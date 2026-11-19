// Real voice conversation pipeline — the web adaptation of the mobile app's
// src/features/voice/hooks/useAvatarConversation.js. The producer/consumer
// sentence queue, streaming-TTS wiring, charTimes subtitle scheduler,
// mid-stream REST replay and speculative RAG are carried over; only the
// platform providers differ (sttWeb, ttsClient, localStorage history, and the
// headless/Three avatar object instead of a WebView ref).
import { useState, useRef, useEffect, useCallback } from 'react';
import { openaiClient, mapSourcesToCitations } from '../services/openaiClient.js';
import { tts } from '../services/ttsClient.js';
import { selectTtsMode, markTtsDegraded } from '../services/ttsModeWeb.js';
import { startSttSession } from '../services/sttWeb.js';
import { sttErrorPresentation } from './sttErrorCopy.js';
import { getElevenKey } from '../state/keysStore.js';
import { createTurnTimer } from '../lib/latency.js';
import { mapSettingsToRag, speechRateFor } from '../state/mapSettingsToRag.js';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';
import { createElevenLabsStream } from '@core/tts/elevenLabsStreamService';
import { createStreamingVisemeAccumulator } from '@core/lipsync/streamingVisemeAccumulator';
import { ELEVEN_STREAM_SAMPLE_RATE, VOICE_SPECULATIVE_RAG } from '@core/voice/voiceConfig';
import { createSpeculativeRag } from '@core/voice/speculativeRetrieval';
import { detectSentiment } from '@core/sentiment/detectSentiment';
import { createSentenceSplitter } from '@core/voice/sentenceTracker';
import { stripMarkdownForSpeech } from '../lib/markdown.js';
import { credentialErrorCopy } from '../services/credentialErrorCopy.js';

const MAX_QUERY_CHARS = 1000;

export function useVoiceConversation({ enabled, avatar, settings, messages, appendMessage, muted }) {
  const [vState, setVState] = useState('idle'); // idle|listening|thinking|speaking
  const [vTranscript, setVTranscript] = useState('');
  const [vDone, setVDone] = useState(false);
  const [vSubtitle, setVSubtitle] = useState('');
  const [error, setError] = useState(null);

  const audioEnabled = settings.audioResponses && !muted;
  const speechRate = speechRateFor(settings);
  // Effective, not stored — with no Unity build the fallback avatar must also
  // bring its own TTS voice (not Aaron's voice over Aria's face).
  const profile = useEffectiveAvatarProfile(settings.avatarId);
  const ttsVoiceOptions = {
    elevenVoiceId: profile.elevenVoiceId ?? null,
    openaiVoice: profile.openaiVoice ?? null,
  };
  const visemeWeights = profile.visemeWeights;

  const sttSessionRef = useRef(null);
  // The turn that owns the screen (an answer or a repeat), as { aborted }.
  // Every turn checks its OWN token. A single shared "aborted" flag used to be
  // reset by each new question, so an interrupted answer, still parked on its
  // playback promise, woke when the next answer's sentence ended and spoke the
  // rest of itself over the new one.
  const turnRef = useRef(null);
  const activeStreamRef = useRef(null);
  const speculativeRef = useRef(null);
  const stateRef = useRef('idle');
  useEffect(() => { stateRef.current = vState; }, [vState]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const stopAndTranscribeRef = useRef(null);
  const startRecordingRef = useRef(null);

  // Cleanup on unmount / route change
  useEffect(() => {
    if (!enabled) return undefined;
    return () => {
      sttSessionRef.current?.cancel();
      sttSessionRef.current = null;
      speculativeRef.current?.cancel();
      speculativeRef.current = null;
      if (turnRef.current) turnRef.current.aborted = true;
      activeStreamRef.current?.abort();
      avatar?.stopAudio();
    };
  }, [enabled, avatar]);

  // A new turn supersedes, and silences, whatever is still registered.
  const beginTurn = () => {
    if (turnRef.current) {
      turnRef.current.aborted = true;
      avatar?.stopAudio();
    }
    const token = { aborted: false };
    turnRef.current = token;
    return token;
  };

  const historyForModel = () =>
    messagesRef.current
      .filter((m) => m.text && !m.streaming)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

  // ─── Core conversation loop (producer/consumer, mobile parity) ─────────────
  //
  // `userText` arrives trimmed and non-empty: each caller (stopAndTranscribe,
  // askText) normalises and checks it at its own boundary, where a blank can
  // still be answered properly. A blank check in here could only return early,
  // leaving the screen on "thinking" with nothing in flight.
  const processQuery = useCallback(async (
    userText,
    { preRetrievedChunks = null, timer = null } = {},
  ) => {
    if (userText.length > MAX_QUERY_CHARS) userText = userText.slice(0, MAX_QUERY_CHARS);

    const history = historyForModel();
    appendMessage({ role: 'user', text: userText });
    setVState('thinking');
    const token = beginTurn();

    const audioOn = settingsRef.current.audioResponses && !mutedRef.current;
    const turn = timer || createTurnTimer();
    // Shared async queue — also the fallback target for a mid-stream WS failure.
    const queue = { promises: [], done: false, notify: null };
    const wake = () => { const n = queue.notify; queue.notify = null; n?.(); };

    let streamingActive = false;
    if (audioOn && settingsRef.current.fasterVoice && avatar?.supportsStreamingAudio) {
      streamingActive = (await selectTtsMode()) === 'eleven-stream';
    }

    const sessionId = `s_${Date.now()}`;
    let ttsStream = null;
    let accumulator = null;
    let streamFailed = false;
    let sessionStarted = false;
    const sentences = []; // { text, emotion, sentCharStart, sentCharEnd }
    let sentCharCount = 0;
    const charTimes = [];
    let audioStartWallclock = null;
    let nextSubtitleIdx = 0;
    let spokenIdx = -1;
    const subtitleTimers = [];
    let wsFinalResolve = null;
    const wsFinalPromise = new Promise((r) => { wsFinalResolve = r; });

    // Subtitles synced to PLAYBACK position via alignment charTimes.
    const scheduleSubtitles = () => {
      if (audioStartWallclock == null) return;
      while (nextSubtitleIdx < sentences.length) {
        const s = sentences[nextSubtitleIdx];
        if (s.sentCharStart >= charTimes.length) break;
        const streamSec = charTimes[Math.max(Math.min(s.sentCharStart, charTimes.length - 1), 0)];
        const delay = Math.max(0, audioStartWallclock + streamSec * 1000 - Date.now());
        const idx = nextSubtitleIdx;
        subtitleTimers.push(setTimeout(() => {
          if (token.aborted || streamFailed) return;
          setVSubtitle(sentences[idx].text);
          avatar?.setSpeechEmotion?.(sentences[idx].emotion);
          spokenIdx = idx;
        }, delay));
        nextSubtitleIdx++;
      }
    };

    // Mid-stream failure → REST cascade for the unspoken tail (sticky).
    const handleStreamFailure = (err) => {
      if (streamFailed || token.aborted) return;
      streamFailed = true;
      markTtsDegraded(err?.message ?? String(err));
      subtitleTimers.forEach(clearTimeout);
      try { ttsStream?.abort(); } catch { /* closed */ }
      avatar?.stopAudio();
      const replayFrom = Math.max(spokenIdx, 0);
      for (let k = replayFrom; k < sentences.length; k++) addSegment(sentences[k].text);
      wsFinalResolve();
    };

    if (streamingActive) {
      accumulator = createStreamingVisemeAccumulator({ visemeWeights });
      ttsStream = createElevenLabsStream({
        apiKey: getElevenKey(),
        voiceId: ttsVoiceOptions.elevenVoiceId ?? 'nPczCjzI2devNBz1zQrb',
        speechRate,
        onTextSent: (text) => { sentCharCount += text.length; },
        onAudioChunk: ({ pcmBase64, durationSec, alignment }) => {
          if (token.aborted || streamFailed) return;
          const { frames, charTimes: newTimes } = accumulator.push(alignment, durationSec);
          for (const ct of newTimes) charTimes.push(ct);
          if (!sessionStarted) {
            sessionStarted = true;
            avatar?.setOnAudioStart(() => {
              audioStartWallclock = Date.now();
              turn.mark('firstAudio');
              setVState('speaking');
              scheduleSubtitles();
            });
            avatar?.startStreamingPlayback(sessionId, ELEVEN_STREAM_SAMPLE_RATE, sentences[0]?.emotion ?? 'neutral');
          }
          avatar?.appendAudioChunk(sessionId, pcmBase64, frames);
          scheduleSubtitles();
        },
        onFinal: () => {
          const { frames } = accumulator.flush();
          if (frames.length) avatar?.appendAudioChunk(sessionId, '', frames);
          wsFinalResolve();
        },
        onError: handleStreamFailure,
      });

      activeStreamRef.current = {
        abort: () => {
          try { ttsStream?.abort(); } catch { /* closed */ }
          subtitleTimers.forEach(clearTimeout);
          wsFinalResolve();
        },
      };

      // Open in parallel with RAG + LLM — handshake hides inside LLM TTFT.
      ttsStream.open().catch(handleStreamFailure);
    }

    // REST segment queue (legacy path + streaming fallback target). Only ever
    // handed a sentence handleSentence has already trimmed and found non-empty,
    // and only with audio on: its REST branch runs after the audio-off return,
    // and the streaming replay needs audio on for the stream to exist at all.
    const addSegment = (clean) => {
      const emotion = detectSentiment(clean);
      turn.mark('ttsRequest');
      queue.promises.push(
        tts(clean, { speechRate, visemeWeights, ...ttsVoiceOptions }).then((result) => {
          // The audio has ARRIVED, which is not the same as the participant
          // hearing it — it still waits its turn in the queue and has to decode.
          // `firstAudio` is marked by the consumer at actual playback start.
          turn.mark('ttsResponse');
          return { ...result, text: clean, emotion };
        })
      );
      wake();
    };

    const handleSentence = (text) => {
      // Captions and speech carry no Markdown markers; the chat keeps them.
      const clean = stripMarkdownForSpeech(text).trim();
      // The splitter marks boundaries with U+001F, so a stray one in the model's
      // own output comes back as an empty "sentence"; nothing to say for it.
      if (!clean) return;
      turn.mark('firstSentence');
      if (!audioOn) {
        // Audio off: still surface sentences as subtitles-in-order via the queue.
        queue.promises.push(Promise.resolve({ text: clean, emotion: 'neutral', audio: null }));
        wake();
        return;
      }
      if (streamingActive && !streamFailed) {
        ttsStream.flush();
        const sentCharStart = sentences.length ? sentences[sentences.length - 1].sentCharEnd : 0;
        sentences.push({ text: clean, emotion: detectSentiment(clean), sentCharStart, sentCharEnd: sentCharCount });
        scheduleSubtitles();
      } else {
        addSegment(clean);
      }
    };

    // Producer: stream LLM → sentences → WS stream or REST queue.
    let citedSources = [];
    const producerTask = async () => {
      let fullText = '';
      const splitter = createSentenceSplitter();
      try {
        const timingCbs = {
          onRagDone: () => turn.mark('ragDone'),
          onLlmSend: () => turn.mark('llmSend'),
          onSources: (sources) => { citedSources = sources ?? []; },
        };
        for await (const chunk of openaiClient.chatStream(userText, history, timingCbs, {
          ...mapSettingsToRag(settingsRef.current),
          skipThrottle: true,
          preRetrievedChunks,
        })) {
          if (token.aborted) break;
          turn.mark('firstToken');
          fullText += chunk;
          if (streamingActive && !streamFailed && audioOn) ttsStream.sendText(stripMarkdownForSpeech(chunk));
          for (const sentence of splitter.push(chunk)) handleSentence(sentence);
        }

        if (!token.aborted) {
          const rest = splitter.finish();
          if (rest) handleSentence(rest);
        }

        if (streamingActive && !streamFailed && !token.aborted) {
          ttsStream.end();
          await wsFinalPromise;
          if (sessionStarted && !streamFailed && !token.aborted) {
            await avatar?.endStreamingPlayback(sessionId);
          }
        }
      } finally {
        appendMessage({
          role: 'aria',
          text: fullText,
          citations: mapSourcesToCitations(citedSources),
          sources: citedSources,
          safety: false,
        });
        turn.finish();
        queue.done = true;
        wake();
      }
    };

    // Consumer: play queued segments in order, starting on the first one.
    const consumerTask = async () => {
      let i = 0;
      let speakingStart = false;
      while (true) {
        while (i >= queue.promises.length && !queue.done) {
          await new Promise((r) => { queue.notify = r; });
        }
        if (i >= queue.promises.length) break;
        if (!speakingStart) { setVState('speaking'); speakingStart = true; }
        if (token.aborted) break;

        const segment = await queue.promises[i];
        if (token.aborted) break;
        setVSubtitle(segment.text ?? '');
        avatar?.setSpeechEmotion?.(segment.emotion);

        if (segment.audio && avatar) {
          // Time-to-audible, measured where the participant experiences it. The
          // timer keeps the first call only, so later segments do not overwrite
          // this. The streaming path marks the same name from the avatar's own
          // onAudioStart callback, so both paths mean the same thing.
          turn.mark('firstAudio');
          await avatar.playAudio(segment);
        } else if (!segment.audio) {
          // Audio off: pace subtitles by reading speed (~55ms/char, min 1.4s).
          await new Promise((r) => setTimeout(r, Math.max(1400, (segment.text?.length ?? 0) * 55)));
        }

        const isLast = queue.done && i === queue.promises.length - 1;
        if (!isLast && !token.aborted) await new Promise((r) => setTimeout(r, 50));
        i++;
      }
    };

    let failed = false;
    try {
      await Promise.all([producerTask(), consumerTask()]);
    } catch (err) {
      failed = true;
      console.error('[useVoiceConversation] processQuery error:', err);
      setError(credentialErrorCopy(err) ?? err.message ?? 'Something went wrong. Please try again.');
    } finally {
      subtitleTimers.forEach(clearTimeout);
      try { ttsStream?.abort(); } catch { /* completed */ }
      // Only the turn that still owns the screen resets it. A stopped turn was
      // released by whatever stopped it, and a superseded one is history: a
      // late "idle" from either would let a further question start on top of
      // the answer now playing.
      if (turnRef.current === token) {
        // Promise.all settles on the first failure, so the other half of a
        // failed turn (sentences already queued, or the rest of the answer
        // streaming in) may still be running: it stays registered for the
        // next turn to supersede.
        if (!failed) turnRef.current = null;
        activeStreamRef.current = null;
        setVSubtitle('');
        setVState('idle');
      }
    }
    return !token.aborted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar, appendMessage, speechRate, profile.id]);

  // ─── Recording ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      avatar?.unlockAudio?.(); // mic tap is the AudioContext unlock gesture
      if (sttSessionRef.current) {
        sttSessionRef.current.cancel();
        sttSessionRef.current = null;
      }
      setVTranscript('');
      setVDone(false);

      speculativeRef.current?.cancel();
      speculativeRef.current = VOICE_SPECULATIVE_RAG
        ? createSpeculativeRag({ search: (q) => openaiClient.search(q) })
        : null;

      const session = await startSttSession({
        handsFree: settingsRef.current.handsFree,
        onPartial: (text) => {
          setVTranscript(text);
          speculativeRef.current?.onPartial(text.slice(0, MAX_QUERY_CHARS));
        },
        onEndOfSpeech: ({ reason }) => {
          if (stateRef.current !== 'listening') return;
          if (reason === 'lead-silence') {
            sttSessionRef.current?.cancel();
            sttSessionRef.current = null;
            setVState('idle');
            return;
          }
          stopAndTranscribeRef.current?.();
        },
        onError: (err) => {
          // A recognizer error after start (mid-session revoke, 'network',
          // 'audio-capture') otherwise left the screen on "Listening…" with
          // nothing visible anywhere but the console — the participant's read
          // of that is "the mic doesn't work", and the data recorded nothing.
          console.warn('[useVoiceConversation] STT session error:', err?.message ?? err);
          sttSessionRef.current?.cancel();
          sttSessionRef.current = null;
          speculativeRef.current?.cancel();
          speculativeRef.current = null;
          const { copy } = sttErrorPresentation(err);
          setError(copy);
          setVState('idle');
        },
      });

      sttSessionRef.current = session;
      setVState('listening');
    } catch (err) {
      if (err?.code === 'permission-denied') {
        setError(`Microphone access is blocked — allow it in your browser settings to talk with ${profile.name}, or type your question below.`);
        return;
      }
      console.error('[useVoiceConversation] startRecording:', err);
      setError(err.message ?? 'Could not start listening.');
    }
  }, [avatar, profile.name]);

  const stopAndTranscribe = useCallback(async () => {
    const session = sttSessionRef.current;
    if (!session) return;
    sttSessionRef.current = null;
    setVState('thinking');
    setVDone(true);

    const turn = createTurnTimer();
    try {
      const { transcript: heard } = await session.stop();
      turn.mark('sttDone');
      // Normalised here, at the STT boundary, so a provider that ever returns a
      // blank-but-untrimmed transcript gets the "didn't catch that" prompt like
      // an empty one, rather than a turn that never starts and a screen stuck
      // on "thinking". Today's providers already trim, so for them it is a no-op.
      const transcript = (heard ?? '').trim();
      if (!transcript) {
        speculativeRef.current?.cancel();
        speculativeRef.current = null;
        setError("I didn't catch that — try again a little closer to the microphone.");
        setVState('idle');
        return;
      }
      setVTranscript(transcript);

      let preRetrievedChunks = null;
      if (speculativeRef.current) {
        const spec = await speculativeRef.current.resolve(transcript.slice(0, MAX_QUERY_CHARS));
        speculativeRef.current = null;
        if (spec.status === 'hit') preRetrievedChunks = spec.chunks;
      }

      const completed = await processQuery(transcript, { preRetrievedChunks, timer: turn });

      // Hands-free: re-arm listening after a completed (not interrupted) reply.
      if (settingsRef.current.handsFree && completed) {
        startRecordingRef.current?.();
      }
    } catch (err) {
      console.error('[useVoiceConversation] stopAndTranscribe:', err);
      setError(err.message ?? 'Could not transcribe audio. Please try again.');
      setVState('idle');
    }
  }, [processQuery]);

  useEffect(() => { stopAndTranscribeRef.current = stopAndTranscribe; }, [stopAndTranscribe]);
  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  // Ends the turn in flight and releases the screen: every caller sets the
  // state that follows (idle, or the next question's "thinking").
  const stopAudio = useCallback(() => {
    if (turnRef.current) turnRef.current.aborted = true;
    turnRef.current = null;
    activeStreamRef.current?.abort();
    activeStreamRef.current = null;
    avatar?.stopAudio();
  }, [avatar]);

  const micTap = useCallback(async () => {
    setError(null);
    if (stateRef.current === 'idle') await startRecording();
    else if (stateRef.current === 'listening') await stopAndTranscribe();
    else if (stateRef.current === 'speaking') { stopAudio(); setVState('idle'); setVSubtitle(''); }
    // 'thinking' is a deliberate no-op: a tap can't cancel a turn already in
    // flight, so the button dims and the "One moment…" label carries the state.
  }, [startRecording, stopAndTranscribe, stopAudio]);

  const repeatLast = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    const last = messagesRef.current.slice().reverse().find((m) => m.role === 'aria');
    if (!last || !last.text) return;
    avatar?.unlockAudio?.();
    const token = beginTurn();
    setVState('speaking');
    try {
      const clean = stripMarkdownForSpeech(last.text.replace(/\s*\[\d+\]/g, ''));
      if (settingsRef.current.audioResponses && !mutedRef.current) {
        const segment = await tts(clean, { speechRate, visemeWeights, ...ttsVoiceOptions });
        if (token.aborted) return; // interrupted while the audio was on its way
        setVSubtitle(clean);
        await avatar.playAudio({ ...segment, emotion: detectSentiment(clean) });
      } else {
        setVSubtitle(clean);
        await new Promise((r) => setTimeout(r, Math.max(1400, clean.length * 55)));
      }
    } catch (err) {
      setError(err.message ?? 'Could not play that back.');
    } finally {
      if (turnRef.current === token) {
        turnRef.current = null;
        setVSubtitle('');
        setVState('idle');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar, speechRate, profile.id]);

  const stop = useCallback(() => {
    sttSessionRef.current?.cancel();
    sttSessionRef.current = null;
    speculativeRef.current?.cancel();
    speculativeRef.current = null;
    stopAudio();
    setVState('idle');
    setVTranscript('');
    setVSubtitle('');
  }, [stopAudio]);

  // Typed question through the same pipeline (the avatar screen's message
  // bar): barge-in if speaking, ignore while listening/thinking. The send
  // click is the AudioContext unlock gesture, same as the mic tap.
  const askText = useCallback(async (text) => {
    const t = (text ?? '').trim();
    if (!t) return;
    if (stateRef.current === 'listening' || stateRef.current === 'thinking') return;
    setError(null);
    if (stateRef.current === 'speaking') stopAudio();
    avatar?.unlockAudio?.();
    await processQuery(t);
  }, [avatar, processQuery, stopAudio]);

  return { vState, vTranscript, vDone, vSubtitle, micTap, askText, repeatLast, stop, error, clearError: () => setError(null) };
}
