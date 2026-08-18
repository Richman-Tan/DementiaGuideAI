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
import { getElevenKey } from '../state/keysStore.js';
import { createTurnTimer } from '../study/latency.js';
import { emit } from '../study/events.js';
import { currentArm, currentTaskId } from '../study/studyStore.js';
import { mapSettingsToRag, speechRateFor } from '../state/mapSettingsToRag.js';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';
import { createElevenLabsStream } from '@core/tts/elevenLabsStreamService';
import { createStreamingVisemeAccumulator } from '@core/lipsync/streamingVisemeAccumulator';
import { ELEVEN_STREAM_SAMPLE_RATE, VOICE_SPECULATIVE_RAG } from '@core/voice/voiceConfig';
import { createSpeculativeRag } from '@core/voice/speculativeRetrieval';
import { detectSentiment } from '@core/sentiment/detectSentiment';
import { createSentenceSplitter } from '@core/voice/sentenceTracker';

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
  const abortRef = useRef(false);
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
      abortRef.current = true;
      activeStreamRef.current?.abort();
      avatar?.stopAudio();
    };
  }, [enabled, avatar]);

  const historyForModel = () =>
    messagesRef.current
      .filter((m) => m.text && !m.streaming)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

  // ─── Core conversation loop (producer/consumer, mobile parity) ─────────────
  const processQuery = useCallback(async (userText, preRetrievedChunks = null, timer = null) => {
    if (!userText.trim()) return;
    if (userText.length > MAX_QUERY_CHARS) userText = userText.slice(0, MAX_QUERY_CHARS);

    const history = historyForModel();
    appendMessage({ role: 'user', text: userText });
    setVState('thinking');
    abortRef.current = false;

    const audioOn = settingsRef.current.audioResponses && !mutedRef.current;
    const arm = currentArm();
    const taskId = currentTaskId();
    const turn = timer || createTurnTimer(arm, taskId);
    // Emitted at submit, not at completion. Turn counts are derived from these:
    // the completing `turn` event can land after task_end and would be missed.
    emit('turn_start', { arm, taskId, chars: userText.length });

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
          if (abortRef.current || streamFailed) return;
          setVSubtitle(sentences[idx].text);
          avatar?.setSpeechEmotion?.(sentences[idx].emotion);
          spokenIdx = idx;
        }, delay));
        nextSubtitleIdx++;
      }
    };

    // Mid-stream failure → REST cascade for the unspoken tail (sticky).
    const handleStreamFailure = (err) => {
      if (streamFailed || abortRef.current) return;
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
          if (abortRef.current || streamFailed) return;
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

    // REST segment queue (legacy path + streaming fallback target).
    const addSegment = (text) => {
      const clean = text.trim();
      if (!clean || !audioOn) return;
      const emotion = detectSentiment(clean);
      turn.mark('ttsRequest');
      queue.promises.push(
        tts(clean, { speechRate, visemeWeights, ...ttsVoiceOptions }).then((result) => {
          turn.mark('firstAudio');
          return { ...result, text: clean, emotion };
        })
      );
      wake();
    };

    const handleSentence = (text) => {
      const clean = text.trim();
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
          if (abortRef.current) break;
          turn.mark('firstToken');
          fullText += chunk;
          if (streamingActive && !streamFailed && audioOn) ttsStream.sendText(chunk);
          for (const sentence of splitter.push(chunk)) handleSentence(sentence);
        }

        if (!abortRef.current) {
          const rest = splitter.finish();
          if (rest) handleSentence(rest);
        }

        if (streamingActive && !streamFailed && !abortRef.current) {
          ttsStream.end();
          await wsFinalPromise;
          if (sessionStarted && !streamFailed && !abortRef.current) {
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
        turn.finish({ streaming: streamingActive && !streamFailed, aborted: abortRef.current });
        // Transcript capture for rubric scoring and the safety scan. Retrieved
        // chunk ids travel with it so the analysis can check whether the two
        // arms retrieved differently — speech recognition changes the query, so
        // a divergence there would mean the study measured STT, not interface
        // (docs/study/analysis-plan.md §7).
        emit('turn', {
          arm,
          taskId,
          question: userText,
          answer: fullText,
          sourceIds: (citedSources || []).map((c) => c.id ?? c.num ?? null),
          aborted: abortRef.current,
        });
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
        if (abortRef.current) break;

        const segment = await queue.promises[i];
        if (abortRef.current) break;
        setVSubtitle(segment.text ?? '');
        avatar?.setSpeechEmotion?.(segment.emotion);

        if (segment.audio && avatar) {
          await avatar.playAudio(segment);
        } else if (!segment.audio) {
          // Audio off: pace subtitles by reading speed (~55ms/char, min 1.4s).
          await new Promise((r) => setTimeout(r, Math.max(1400, (segment.text?.length ?? 0) * 55)));
        }

        const isLast = queue.done && i === queue.promises.length - 1;
        if (!isLast && !abortRef.current) await new Promise((r) => setTimeout(r, 50));
        i++;
      }
    };

    try {
      await Promise.all([producerTask(), consumerTask()]);
    } catch (err) {
      console.error('[useVoiceConversation] processQuery error:', err);
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      subtitleTimers.forEach(clearTimeout);
      try { ttsStream?.abort(); } catch { /* completed */ }
      activeStreamRef.current = null;
      setVSubtitle('');
      setVState('idle');
    }
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
          console.warn('[useVoiceConversation] STT session error:', err?.message ?? err);
        },
      });

      sttSessionRef.current = session;
      setVState('listening');
    } catch (err) {
      if (err?.code === 'permission-denied') {
        setError('Microphone access is blocked — allow it in your browser settings to talk with Aria.');
        return;
      }
      console.error('[useVoiceConversation] startRecording:', err);
      setError(err.message ?? 'Could not start listening.');
    }
  }, [avatar]);

  const stopAndTranscribe = useCallback(async () => {
    const session = sttSessionRef.current;
    if (!session) return;
    sttSessionRef.current = null;
    setVState('thinking');
    setVDone(true);

    const turn = createTurnTimer(currentArm(), currentTaskId());
    try {
      const { transcript } = await session.stop();
      turn.mark('sttDone');
      if (!transcript) {
        emit('stt_empty', { arm: currentArm(), taskId: currentTaskId() });
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

      await processQuery(transcript, preRetrievedChunks, turn);

      // Hands-free: re-arm listening after a completed (not interrupted) reply.
      if (settingsRef.current.handsFree && !abortRef.current) {
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

  const stopAudio = useCallback(() => {
    abortRef.current = true;
    activeStreamRef.current?.abort();
    avatar?.stopAudio();
  }, [avatar]);

  const micTap = useCallback(async () => {
    setError(null);
    if (stateRef.current === 'idle') await startRecording();
    else if (stateRef.current === 'listening') await stopAndTranscribe();
    else if (stateRef.current === 'speaking') { stopAudio(); setVState('idle'); setVSubtitle(''); }
  }, [startRecording, stopAndTranscribe, stopAudio]);

  const repeatLast = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    const last = messagesRef.current.slice().reverse().find((m) => m.role === 'aria');
    if (!last || !last.text) return;
    avatar?.unlockAudio?.();
    abortRef.current = false;
    setVState('speaking');
    try {
      const clean = last.text.replace(/\s*\[\d+\]/g, '');
      if (settingsRef.current.audioResponses && !mutedRef.current) {
        const segment = await tts(clean, { speechRate, visemeWeights, ...ttsVoiceOptions });
        setVSubtitle(clean);
        await avatar.playAudio({ ...segment, emotion: detectSentiment(clean) });
      } else {
        setVSubtitle(clean);
        await new Promise((r) => setTimeout(r, Math.max(1400, clean.length * 55)));
      }
    } catch (err) {
      setError(err.message ?? 'Could not play that back.');
    } finally {
      setVSubtitle('');
      setVState('idle');
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
    abortRef.current = false;
    await processQuery(t);
  }, [avatar, processQuery, stopAudio]);

  return { vState, vTranscript, vDone, vSubtitle, micTap, askText, repeatLast, stop, error, clearError: () => setError(null) };
}
