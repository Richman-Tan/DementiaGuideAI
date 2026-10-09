// ElevenLabs WebSocket streaming TTS — one session per response turn.
//
// Why: the REST /with-timestamps path blocks until a WHOLE sentence is
// synthesized (~400–1200 ms before any audio). The stream-input WebSocket
// accepts text incrementally (LLM tokens forwarded as they arrive) and
// returns audio chunks WITH per-chunk character alignment, so first audio
// lands in ~100–250 ms and the viseme lip-sync pipeline keeps working.
//
// Lifecycle (driven by useAvatarConversation's streaming producer):
//   const s = createElevenLabsStream({...});
//   await s.open();          // fire in parallel with the LLM request — WS
//                            // setup (~200-300 ms) hides inside LLM TTFT
//   s.sendText(token);       // every LLM token, as it arrives
//   s.flush();               // at sentence boundaries (clean prosody breaks)
//   s.end();                 // LLM done — close input, remaining audio drains
//   s.abort();               // barge-in — drop everything now
//
// Failure contract: onError fires ONCE on any fatal condition (open timeout,
// socket error, audio stall). The caller falls back to the REST cascade and
// replays unspoken sentences — worst case equals the pre-streaming pipeline.

import {
  ELEVEN_STREAM_MODEL,
  ELEVEN_STREAM_FORMAT,
  ELEVEN_STREAM_SAMPLE_RATE,
  ELEVEN_CHUNK_SCHEDULE,
  WS_OPEN_TIMEOUT_MS,
  WS_STALL_TIMEOUT_MS,
} from '../voice/voiceConfig';
import { normalizeSpokenText, unsettledTailStart } from './normalizeSpokenText';

const ELEVENLABS_WS_BASE = 'wss://api.elevenlabs.io';

/** Duration in seconds of a base64-encoded 16-bit mono PCM payload. */
export function pcmBase64DurationSec(b64, sampleRate = ELEVEN_STREAM_SAMPLE_RATE) {
  if (!b64) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  return bytes / 2 / sampleRate;
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.voiceId
 * @param {string} [opts.modelId]
 * @param {number} [opts.speechRate]
 * @param {function} opts.onAudioChunk ({ pcmBase64, durationSec, alignment, chunkIndex })
 *   alignment = { chars, charStartTimesMs, charDurationsMs } | null
 * @param {function} opts.onFinal    () — server confirmed end of stream
 * @param {function} opts.onError    (err) — fatal; fires at most once
 * @param {function} [opts.onTextSent] (text) — exactly what went over the wire
 *   (post-normalization, including the BOS space). Cumulative length matches
 *   the alignment char stream — the join key for subtitle timing.
 */
export function createElevenLabsStream({
  apiKey,
  voiceId,
  modelId = ELEVEN_STREAM_MODEL,
  speechRate = 0.78,
  onAudioChunk,
  onFinal,
  onError,
  onTextSent,
}) {
  let ws = null;
  let openPromise = null;
  let wsOpen = false;
  let dead = false;          // fatal error or abort — ignore everything after
  let inputEnded = false;    // end() called
  let finalReceived = false; // server isFinal seen
  let chunkIndex = 0;
  let stallTimer = null;
  let errorFired = false;

  // Text queued before the socket finished opening (open() runs concurrently
  // with the LLM request, so early tokens can beat the handshake).
  const preOpenQueue = [];

  // ElevenLabs buffers text server-side; each message should end cleanly on a
  // word boundary for best quality, so we forward whole words and hold the
  // trailing partial word until the next token completes it. normalizeSpokenText
  // runs on each forwarded piece, which keeps digits animating the lips.
  let wordBuf = '';
  // Whole words that cannot be normalised yet: a phone number may still be
  // arriving ("0800 " … "611 116"), or a "call" is waiting for the "111" it
  // introduces (see unsettledTailStart). Held words go out with the next piece,
  // so every piece normalises the same as it would in the full sentence, as the
  // REST path does it.
  let heldBuf = '';

  const fireError = (err) => {
    if (errorFired || dead) return;
    errorFired = true;
    dead = true;
    clearStall();
    try { ws?.close(); } catch {}
    try { onError?.(err); } catch {}
  };

  const clearStall = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  };

  // Audio must keep arriving while we have undelivered input. Re-armed on
  // every send and every received chunk; disarmed once the server finalizes.
  const armStall = () => {
    clearStall();
    if (dead || finalReceived) return;
    stallTimer = setTimeout(() => {
      fireError(new Error(`ElevenLabs stream stalled (no audio for ${WS_STALL_TIMEOUT_MS}ms)`));
    }, WS_STALL_TIMEOUT_MS);
  };

  const wsSend = (obj) => {
    if (dead) return false;
    if (!wsOpen) {
      preOpenQueue.push(obj);
      return true; // will flush on open; open-timeout catches a dead handshake
    }
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch (err) {
      fireError(err);
      return false;
    }
  };

  const sendTextPayload = (text, flush = false) => {
    if (!text && !flush) return false;
    const ok = wsSend(flush ? { text, flush: true } : { text });
    if (ok && text) { try { onTextSent?.(text); } catch {} }
    return ok;
  };

  const open = () => {
    if (openPromise) return openPromise;
    openPromise = new Promise((resolve, reject) => {
      const url =
        `${ELEVENLABS_WS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input` +
        `?model_id=${encodeURIComponent(modelId)}` +
        `&output_format=${encodeURIComponent(ELEVEN_STREAM_FORMAT)}` +
        `&auto_mode=false&inactivity_timeout=60`;

      let settled = false;
      const openTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        dead = true;
        try { ws?.close(); } catch {}
        reject(new Error(`ElevenLabs WS open timed out after ${WS_OPEN_TIMEOUT_MS}ms`));
      }, WS_OPEN_TIMEOUT_MS);

      try {
        ws = new WebSocket(url);
      } catch (err) {
        clearTimeout(openTimer);
        settled = true;
        reject(err);
        return;
      }

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(openTimer);
        // BOS message: auth + voice/generation config. xi_api_key in-message
        // avoids relying on RN WebSocket header support.
        try {
          ws.send(JSON.stringify({
            text: ' ',
            voice_settings: {
              stability: 0.40,
              similarity_boost: 0.75,
              style: 0.20,
              speed: speechRate,
            },
            generation_config: { chunk_length_schedule: ELEVEN_CHUNK_SCHEDULE },
            xi_api_key: apiKey,
          }));
        } catch (err) {
          reject(err);
          return;
        }
        try { onTextSent?.(' '); } catch {}
        wsOpen = true;
        // Flush text that arrived while the handshake was in flight
        // (onTextSent already fired for these when they were queued).
        const queued = preOpenQueue.splice(0);
        for (const obj of queued) {
          if (!wsSend(obj)) break;
        }
        resolve();
      };

      ws.onmessage = (event) => {
        if (dead) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.audio) {
          armStall();
          const durationSec = pcmBase64DurationSec(msg.audio);
          try {
            onAudioChunk?.({
              pcmBase64: msg.audio,
              durationSec,
              alignment: msg.alignment ?? null,
              chunkIndex: chunkIndex++,
            });
          } catch {}
        }

        if (msg.isFinal) {
          finalReceived = true;
          clearStall();
          try { onFinal?.(); } catch {}
          try { ws?.close(); } catch {}
        }

        if (msg.error) {
          fireError(new Error(`ElevenLabs stream error: ${msg.message ?? msg.error}`));
        }
      };

      ws.onerror = (event) => {
        if (!settled) {
          settled = true;
          clearTimeout(openTimer);
          dead = true;
          reject(new Error(`ElevenLabs WS connection error${event?.message ? `: ${event.message}` : ''}`));
          return;
        }
        fireError(new Error(`ElevenLabs WS error${event?.message ? `: ${event.message}` : ''}`));
      };

      ws.onclose = () => {
        clearStall();
        // Close without isFinal while input was still pending = fatal.
        if (!finalReceived && !dead && inputEnded === false) {
          fireError(new Error('ElevenLabs WS closed unexpectedly'));
        } else if (!finalReceived && !dead && inputEnded) {
          // Input ended but server closed without isFinal — treat drained
          // audio as complete rather than erroring a finished response.
          finalReceived = true;
          try { onFinal?.(); } catch {}
        }
      };
    });
    return openPromise;
  };

  return {
    open,

    /** Forward LLM text as it arrives. Whole words only; remainder is held. */
    sendText(text) {
      if (dead || inputEnded || !text) return;
      wordBuf += text;
      const lastSpace = wordBuf.lastIndexOf(' ');
      if (lastSpace < 0) return;
      const complete = heldBuf + wordBuf.slice(0, lastSpace + 1);
      wordBuf = wordBuf.slice(lastSpace + 1);
      const cut = unsettledTailStart(complete);
      const sendable = complete.slice(0, cut);
      if (sendable.trim().length === 0) {
        // Nothing to send yet; whitespace before held words stays with them.
        heldBuf = cut < complete.length ? complete : '';
        return;
      }
      heldBuf = complete.slice(cut);
      if (sendTextPayload(normalizeSpokenText(sendable))) armStall();
    },

    /**
     * Sentence boundary: force generation of the server-side buffer for a
     * clean prosody break. Deliberately does NOT push the held partial word —
     * at a boundary, it is usually the NEXT sentence's first word (LLM output
     * has a space after ".", so the sentence-final word is already sent);
     * pulling it forward would tie it to the wrong generation.
     *
     * Held whole words (see heldBuf) go out first when the sentence or
     * clause being flushed ends inside them, so they are not carried past the
     * break: when they end with the comma of an early clause split, or when
     * the partial word closes the sentence or clause (only spaces separate
     * words here, so in "time.\n\n", "minutes.\n4" or "111," it is still
     * open at its flush). The closing part of the partial word goes with them
     * only if it holds a digit, the rest of a number or the number a held
     * "call" introduces; otherwise it stays, as before. In any other case the
     * held words belong to text still open (an early split at an earlier comma
     * can land in the middle of "0800 004 001", or the reply's last sentence
     * has no closing punctuation) and stay held until the next piece or end().
     */
    flush() {
      if (dead || inputEnded) return;
      const close = /[.!?,;]["'”’)\]*]*(?=\s|$)/.exec(wordBuf);
      if (heldBuf && (close || /[,;]\s*$/.test(heldBuf))) {
        let held = heldBuf;
        const closing = close ? wordBuf.slice(0, close.index + close[0].length) : '';
        if (/\d/.test(closing)) {
          held += `${closing} `;
          wordBuf = wordBuf.slice(closing.length);
        }
        heldBuf = '';
        sendTextPayload(normalizeSpokenText(held));
      }
      if (sendTextPayload(' ', true)) armStall();
    },

    /** LLM done: send EOS; remaining audio + isFinal will drain. */
    end() {
      if (dead || inputEnded) return;
      const rest = (heldBuf + wordBuf).trimEnd();
      if (rest) sendTextPayload(`${normalizeSpokenText(rest)} `, true);
      heldBuf = '';
      wordBuf = '';
      inputEnded = true;
      if (wsSend({ text: '' })) armStall();
    },

    /** Barge-in / teardown: drop everything immediately, no callbacks. */
    abort() {
      dead = true;
      clearStall();
      try { ws?.close(); } catch {}
    },

    get isDead() { return dead; },
  };
}
