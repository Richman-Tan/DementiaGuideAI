import { useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openaiService } from '@/lib/openaiService';
import { tts } from '@/lib/tts/ttsService';
import { selectTtsMode, markTtsDegraded } from '@/lib/tts/ttsMode';
import { createElevenLabsStream } from '@/lib/tts/elevenLabsStreamService';
import { elevenLabsService } from '@/lib/tts/elevenLabsService';
import { createStreamingVisemeAccumulator } from '@/lib/lipsync/streamingVisemeAccumulator';
import { prewarmVoicePipeline } from '@/lib/voice/prewarm';
import { ELEVEN_STREAM_SAMPLE_RATE, VOICE_SPECULATIVE_RAG } from '@/lib/voice/voiceConfig';
import { createSpeculativeRag } from '@/lib/rag/speculativeRetrieval';
import { startSttSession } from '@/lib/stt/sttService';
import { detectSentiment } from '@/lib/sentiment/detectSentiment';
import { useSettings } from '@/context/SettingsContext';
import { createSentenceSplitter } from '@/features/voice/sentenceTracker';
import { AVATAR_PROFILES, DEFAULT_AVATAR_ID } from '@/features/avatar/config/avatarProfiles';

// ─── Voice state machine ──────────────────────────────────────────────────────
export const VoiceState = {
  IDLE:       'idle',
  LISTENING:  'listening',
  PROCESSING: 'processing',
  SPEAKING:   'speaking',
};

// Shared AsyncStorage key with ChatScreen — both read/write the same array.
const MESSAGES_KEY = 'chat_messages_v1';
const MAX_PERSISTED = 100;
const MAX_QUERY_CHARS = 1000;

/**
 * useAvatarConversation
 *
 * Encapsulates the full voice conversation pipeline so VoiceScreen.js stays
 * purely presentational.
 *
 * Pipeline overview:
 *   1. startRecording()     — sttService streams live partials while the user
 *      talks (expo-speech-recognition), or records for Whisper as fallback
 *   2. stopAndTranscribe()  — finalizes the STT session (near-instant on the
 *      live path; upload round trip only on the Whisper fallback)
 *   3. processQuery(text)   — runs the streaming conversation loop:
 *        a. producerTask(): chatStream() yields LLM tokens; sentence boundaries
 *           detected via punctuation (and early comma chunking); each complete
 *           sentence fires tts() immediately and is pushed to an async queue.
 *        b. consumerTask(): starts as soon as the first TTS promise is queued
 *           (does NOT wait for the full LLM stream to complete). Plays segments
 *           in order via avatarRef.current.playAudio() which resolves on audioEnd.
 *        c. Both tasks run concurrently via Promise.all() — first audio plays
 *           while later sentences are still generating/synthesising.
 *
 * How to swap the LLM provider:
 *   Replace the chatStream() call below with a different async generator that
 *   yields string chunks. The sentence-splitting and TTS queue logic is unchanged.
 *
 * How to swap the TTS provider:
 *   Update ttsService.js — this hook only calls tts(text) and receives
 *   { audio, visemeTimeline }. No changes needed here.
 *
 * How to swap the renderer (Three.js vs Unity):
 *   The avatarRef.current API is renderer-agnostic (AvatarBridgeProtocol).
 *   Both AvatarVRM and AvatarUnity expose playAudio/stopAudio/setOnAudioStart.
 *   This hook does not need to know which renderer is active.
 *
 * @param {{ avatarRef: React.RefObject }} options
 */
export function useAvatarConversation({ avatarRef }) {
  const [voiceState, setVoiceState]               = useState(VoiceState.IDLE);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [error, setError]                         = useState(null);            // string | null
  const [currentSubtitle, setCurrentSubtitle]     = useState(''); // current speaking sentence
  const {
    audioEnabled, conciseMode,
    responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, speechRate,
    selectedAvatarId, handsFreeMode, fastVoiceMode,
  } = useSettings();

  // Resolve the active avatar profile so viseme weights match the loaded model.
  const avatarProfile  = AVATAR_PROFILES[selectedAvatarId ?? DEFAULT_AVATAR_ID] ?? AVATAR_PROFILES[DEFAULT_AVATAR_ID];
  const visemeWeights  = avatarProfile.visemeWeights;
  const avatarVoice    = avatarProfile.voice ?? null;
  const ttsVoiceOptions = {
    voice: avatarVoice,
    elevenVoiceId: avatarProfile.elevenVoiceId ?? null,
    openaiVoice: avatarProfile.openaiVoice ?? null,
  };

  const sttSessionRef = useRef(null);  // active STT session (live or whisper)
  const abortRef      = useRef(false); // set true when user stops mid-response
  const historyRef    = useRef([]);    // kept in sync so callbacks always see latest
  const lastPartialRef = useRef('');   // latest live STT partial (speculative RAG input)
  const activeStreamRef = useRef(null); // { abort } for the in-flight TTS stream (barge-in)
  const speculativeRef  = useRef(null); // per-turn speculative RAG session

  // Refs so STT-session callbacks (created in startRecording) always call the
  // CURRENT versions of these functions without stale closures.
  const stopAndTranscribeRef = useRef(null);
  const startRecordingRef    = useRef(null);
  const voiceStateRef        = useRef(VoiceState.IDLE);
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  // Keep historyRef in sync with React state
  useEffect(() => {
    historyRef.current = conversationHistory;
  }, [conversationHistory]);

  // On mount: load persisted conversation history so the voice pipeline
  // shares context with ChatScreen.
  useEffect(() => {
    const init = async () => {
      try {
        const raw = await AsyncStorage.getItem(MESSAGES_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved) && saved.length > 0) {
            const history = saved
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.text ?? m.content ?? '' }));
            setConversationHistory(history);
            historyRef.current = history;
          }
        }
      } catch { /* non-critical */ }
    };
    init();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sttSessionRef.current?.cancel();
      sttSessionRef.current = null;
      speculativeRef.current?.cancel();
      speculativeRef.current = null;
      activeStreamRef.current?.abort();
      avatarRef.current?.stopAudio();
    };
  }, [avatarRef]);

  // ─── Core conversation loop ─────────────────────────────────────────────────
  // Producer-consumer pattern: LLM streaming and TTS playback run concurrently.
  // The consumer starts as soon as the first sentence is queued — it does NOT
  // wait for the full LLM response before playing the first audio segment.
  const processQuery = useCallback(async (userText, t0 = Date.now(), sttDoneAt = null, preRetrievedChunks = null) => {
    if (!userText.trim()) return;
    // Cap transcript length: STT can produce unbounded text (the text path caps
    // at 500 chars), and an over-long query inflates embedding + prompt tokens.
    if (userText.length > MAX_QUERY_CHARS) {
      userText = userText.slice(0, MAX_QUERY_CHARS);
    }

    setVoiceState(VoiceState.PROCESSING);
    abortRef.current = false;

    // Timing accumulator — checkpoints set inline, printed in finally
    const pts = { stt_done: sttDoneAt };

    // ── Shared async queue (single consumer, Hermes-safe) ────────────────────
    // JS is single-threaded so array writes are never truly concurrent.
    // The notify slot holds at most one waiter (only the consumer ever sets it).
    // In streaming mode the queue idles empty — it is also the FALLBACK target:
    // a mid-stream WebSocket failure requeues unspoken sentences here and the
    // consumer plays them through the classic REST cascade.
    const queue = { promises: [], done: false, notify: null };
    const wake  = () => { const n = queue.notify; queue.notify = null; n?.(); };

    // ── Streaming TTS state (ElevenLabs WebSocket → WebView PCM chunks) ──────
    let streamingActive = false;
    if (audioEnabled && fastVoiceMode && avatarRef.current?.supportsStreamingAudio) {
      streamingActive = (await selectTtsMode()) === 'eleven-stream';
    }

    const sessionId = `s_${Date.now()}`;
    let ttsStream = null;
    let accumulator = null;
    let streamFailed = false;
    let sessionStarted = false;         // first audio chunk reached the WebView
    const sentences = [];               // { text, emotion, sentCharStart, sentCharEnd }
    let sentCharCount = 0;              // chars actually sent over the WS (normalized)
    const charTimes = [];               // absolute stream-time (sec) per sent char
    let audioStartWallclock = null;     // Date.now() when playback actually started
    let nextSubtitleIdx = 0;
    let spokenIdx = -1;                 // last sentence whose subtitle was shown
    const subtitleTimers = [];
    let wsFinalResolve = null;
    const wsFinalPromise = new Promise(r => { wsFinalResolve = r; });

    // Subtitles/emotion are synced to PLAYBACK position (synthesis runs far
    // ahead of audio): sentence k's start char maps to a stream time via the
    // alignment charTimes, then to a wallclock timer from the audio anchor.
    const scheduleSubtitles = () => {
      if (audioStartWallclock == null) return;
      while (nextSubtitleIdx < sentences.length) {
        const s = sentences[nextSubtitleIdx];
        if (s.sentCharStart >= charTimes.length) break; // timing not yet known
        const streamSec = charTimes[Math.max(Math.min(s.sentCharStart, charTimes.length - 1), 0)];
        const delay = Math.max(0, audioStartWallclock + streamSec * 1000 - Date.now());
        const idx = nextSubtitleIdx;
        subtitleTimers.push(setTimeout(() => {
          if (abortRef.current || streamFailed) return;
          setCurrentSubtitle(sentences[idx].text);
          avatarRef.current?.setSpeechEmotion?.(sentences[idx].emotion);
          spokenIdx = idx;
        }, delay));
        nextSubtitleIdx++;
      }
    };

    // Mid-stream failure: degrade to the REST cascade for the unspoken tail
    // (and for the rest of the session — sticky). Worst case equals the
    // pre-streaming pipeline.
    const handleStreamFailure = (err) => {
      if (streamFailed || abortRef.current) return;
      streamFailed = true;
      markTtsDegraded(err?.message ?? String(err));
      subtitleTimers.forEach(clearTimeout);
      try { ttsStream?.abort(); } catch {}
      avatarRef.current?.stopAudio(); // kill partial stream audio in the WebView
      const replayFrom = Math.max(spokenIdx, 0);
      for (let k = replayFrom; k < sentences.length; k++) {
        addSegment(sentences[k].text);
      }
      wsFinalResolve();
    };

    if (streamingActive) {
      accumulator = createStreamingVisemeAccumulator({ visemeWeights });
      const elevenKey = await elevenLabsService.getApiKey();
      ttsStream = createElevenLabsStream({
        apiKey: elevenKey,
        voiceId: ttsVoiceOptions.elevenVoiceId ?? 'nPczCjzI2devNBz1zQrb',
        speechRate,
        onTextSent: (text) => { sentCharCount += text.length; },
        onAudioChunk: ({ pcmBase64, durationSec, alignment }) => {
          if (abortRef.current || streamFailed) return;
          const { frames, charTimes: newTimes } = accumulator.push(alignment, durationSec);
          for (const ct of newTimes) charTimes.push(ct);
          if (!sessionStarted) {
            sessionStarted = true;
            pts.tts_first_chunk = Date.now();
            console.log(`[LATENCY] tts_first_chunk_ms +${pts.tts_first_chunk - t0}`);
            avatarRef.current?.setOnAudioStart(() => {
              if (!pts.audio_started) {
                pts.audio_started = Date.now();
                console.log(`[LATENCY] avatar_audio_started_ms +${pts.audio_started - t0}`);
              }
              audioStartWallclock = Date.now();
              setVoiceState(VoiceState.SPEAKING);
              scheduleSubtitles();
            });
            avatarRef.current?.startStreamingPlayback(
              sessionId, ELEVEN_STREAM_SAMPLE_RATE, sentences[0]?.emotion ?? 'neutral');
          }
          avatarRef.current?.appendAudioChunk(sessionId, pcmBase64, frames);
          scheduleSubtitles();
        },
        onFinal: () => {
          // Release the held trailing word's frames (audio already scheduled).
          const { frames } = accumulator.flush();
          if (frames.length) avatarRef.current?.appendAudioChunk(sessionId, '', frames);
          wsFinalResolve();
        },
        onError: handleStreamFailure,
      });

      // Barge-in hook: stopAudio() aborts the socket and unblocks the drain.
      activeStreamRef.current = {
        abort: () => {
          try { ttsStream?.abort(); } catch {}
          subtitleTimers.forEach(clearTimeout);
          wsFinalResolve();
        },
      };

      // Open in parallel with RAG + the LLM request — the WS handshake
      // (~200–300 ms) hides entirely inside LLM time-to-first-token.
      ttsStream.open().then(() => {
        pts.ws_open = Date.now();
        console.log(`[LATENCY] ws_open_ms +${pts.ws_open - t0}`);
      }).catch(handleStreamFailure);
    }

    // ── REST segment queue (legacy path + streaming fallback target) ─────────
    let firstSeg = true;
    const addSegment = (text) => {
      const clean = text.trim();
      if (!clean || !audioEnabled) return;

      const emotion = detectSentiment(clean);

      if (firstSeg) {
        pts.first_sentence = pts.first_sentence ?? Date.now();
        pts.tts_start = Date.now();
        console.log(`[LATENCY] tts_first_request_start_ms +${pts.tts_start - t0}`);
        const p = tts(clean, { speechRate, visemeWeights, ...ttsVoiceOptions }).then(result => {
          pts.tts_ready = Date.now();
          console.log(`[LATENCY] tts_first_audio_ready_ms +${pts.tts_ready - t0}`);
          return { ...result, text: clean, emotion };
        });
        queue.promises.push(p);
        firstSeg = false;
      } else {
        queue.promises.push(tts(clean, { speechRate, visemeWeights, ...ttsVoiceOptions }).then(result => ({ ...result, text: clean, emotion })));
      }
      wake();
    };

    // Sentence boundary handler — routes to the WS stream or the REST queue.
    const handleSentence = (text) => {
      const clean = text.trim();
      if (!clean || !audioEnabled) return;

      if (streamingActive && !streamFailed) {
        if (sentences.length === 0) {
          pts.first_sentence = Date.now();
          console.log(`[LATENCY] first_sentence_ready_ms +${pts.first_sentence - t0}`);
        }
        // flush() forces generation of everything buffered server-side, giving
        // a clean prosody break; the sentence's chars are all sent by now, so
        // the cumulative counter is this sentence's end offset.
        ttsStream.flush();
        const sentCharStart = sentences.length ? sentences[sentences.length - 1].sentCharEnd : 0;
        sentences.push({ text: clean, emotion: detectSentiment(clean), sentCharStart, sentCharEnd: sentCharCount });
        scheduleSubtitles();
      } else {
        if (sentences.length === 0 && firstSeg && !pts.first_sentence) {
          pts.first_sentence = Date.now();
          console.log(`[LATENCY] first_sentence_ready_ms +${pts.first_sentence - t0}`);
        }
        addSegment(clean);
      }
    };

    // ── Producer: stream LLM → split sentences → WS stream or TTS queue ──────
    const producerTask = async () => {
      const history = historyRef.current;
      let fullText  = '';
      const splitter = createSentenceSplitter();

      let citedSources = [];
      try {
        const timingCbs = {
          onRagDone: () => {
            pts.rag_done = Date.now();
            console.log(`[LATENCY] rag_done_ms +${pts.rag_done - t0}`);
          },
          onLlmSend: () => {
            pts.llm_send = Date.now();
            console.log(`[LATENCY] llm_request_start_ms +${pts.llm_send - t0}`);
          },
          // Structured, validated sources extracted from inline [S#] markers
          // (the markers themselves are stripped before TTS).
          onSources: (sources) => { citedSources = sources ?? []; },
        };

        pts.rag_start = Date.now();
        console.log(`[LATENCY] rag_start_ms +${pts.rag_start - t0}`);

        let firstChunk = true;
        for await (const chunk of openaiService.chatStream(userText, history, timingCbs,
            { conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup,
              // Voice turns are serialized by the state machine — pacing here is
              // pure dead time on the hot path (up to 750 ms before every reply).
              skipThrottle: true,
              // Chunks retrieved speculatively during live STT (or null).
              preRetrievedChunks })) {
          if (abortRef.current) break;
          if (firstChunk) {
            pts.first_token = Date.now();
            console.log(`[LATENCY] first_token_ms +${pts.first_token - t0}`);
            firstChunk = false;
          }
          fullText += chunk;

          // Forward tokens to the WS immediately (sub-sentence first audio);
          // sentence boundaries then trigger flush + subtitle records.
          if (streamingActive && !streamFailed && audioEnabled) {
            ttsStream.sendText(chunk);
          }
          for (const sentence of splitter.push(chunk)) handleSentence(sentence);
        }

        if (!abortRef.current) {
          const rest = splitter.finish();
          if (rest) handleSentence(rest);
        }

        // Streaming drain: close WS input, wait for the server's final audio,
        // then wait for the WebView to finish playing the scheduled chunks.
        if (streamingActive && !streamFailed && !abortRef.current) {
          ttsStream.end();
          await wsFinalPromise;
          if (sessionStarted && !streamFailed && !abortRef.current) {
            await avatarRef.current?.endStreamingPlayback(sessionId);
          }
        }
      } finally {
        setConversationHistory(prev => [
          ...prev,
          { role: 'user',      content: userText },
          { role: 'assistant', content: fullText  },
        ]);
        // Persist voice exchange to AsyncStorage in ChatScreen format so both
        // screens share a unified history.
        try {
          const raw = await AsyncStorage.getItem(MESSAGES_KEY);
          const existing = raw ? JSON.parse(raw) : [];
          const now = Date.now();
          const userEntry = { id: `v_${now}`, role: 'user', text: userText, sources: [], timestamp: new Date().toISOString() };
          const assistantEntry = { id: `v_${now + 1}`, role: 'assistant', text: fullText, sources: citedSources, timestamp: new Date().toISOString() };
          const updated = [...existing, userEntry, assistantEntry].slice(-MAX_PERSISTED);
          await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(updated));
        } catch { /* non-critical */ }
        queue.done = true;
        wake(); // unblock consumer even if no segments were added
      }
    };

    // ── Consumer: play in order, starting on first available promise ──────────
    const consumerTask = async () => {
      let i             = 0;
      let speakingStart = false;
      let firstPlay     = true;

      while (true) {
        // Block until there is a queued promise or the producer is done
        while (i >= queue.promises.length && !queue.done) {
          await new Promise(r => { queue.notify = r; });
        }
        if (i >= queue.promises.length) break; // producer done, nothing left

        if (!speakingStart) {
          setVoiceState(VoiceState.SPEAKING); // fires at first sentence, not end of stream
          speakingStart = true;
        }
        if (abortRef.current) break;

        const segment = await queue.promises[i]; // wait for TTS to resolve
        if (abortRef.current) break;
        setCurrentSubtitle(segment.text ?? '');

        if (firstPlay) {
          pts.avatar_play = Date.now();
          console.log(`[LATENCY] avatar_play_request_ms +${pts.avatar_play - t0}`);
          // One-shot callback: fires when WebView signals audio has actually
          // started. Guarded so a streaming→REST fallback keeps the FIRST
          // audible moment as the latency checkpoint.
          avatarRef.current?.setOnAudioStart(() => {
            if (!pts.audio_started) {
              pts.audio_started = Date.now();
              console.log(`[LATENCY] avatar_audio_started_ms +${pts.audio_started - t0}`);
            }
          });
          firstPlay = false;
        }

        if (avatarRef.current) await avatarRef.current.playAudio(segment);

        // Small gap to let the AudioContext finish before the next segment.
        // TTS audio already includes natural trailing silence; 50 ms is enough
        // to avoid any bridge-timing overlap without creating perceptible pauses.
        const isLast = queue.done && i === queue.promises.length - 1;
        if (!isLast && !abortRef.current) {
          await new Promise(r => setTimeout(r, 50));
        }
        i++;
      }
    };

    try {
      await Promise.all([producerTask(), consumerTask()]);
    } catch (err) {
      console.error('[useAvatarConversation] processQuery error:', err);
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      subtitleTimers.forEach(clearTimeout);
      try { ttsStream?.abort(); } catch {} // no-op if the stream completed cleanly
      activeStreamRef.current = null;
      setCurrentSubtitle('');
      setVoiceState(VoiceState.IDLE);
      const d = (a, b) => (a != null && b != null) ? a - b : null;
      console.log('[LATENCY SUMMARY]', JSON.stringify({
        mode:              streamingActive ? (streamFailed ? 'streaming-degraded' : 'streaming') : 'legacy',
        stt_ms:            d(pts.stt_done,      t0),
        rag_ms:            d(pts.rag_done,       pts.rag_start),
        llm_to_token_ms:   d(pts.first_token,    pts.llm_send),
        first_sentence_ms: d(pts.first_sentence, pts.first_token),
        ws_open_ms:        d(pts.ws_open,        t0),
        tts_first_chunk_ms: d(pts.tts_first_chunk, t0),
        tts_first_ms:      d(pts.tts_ready,      pts.tts_start),
        to_first_audio_ms: d(pts.audio_started,  t0),
      }));
    }
  }, [avatarRef, audioEnabled, fastVoiceMode, conciseMode, responseStyle, jargonMode,
      ariaPersonality, isCaregiversSetup, speechRate, selectedAvatarId]);

  // ─── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      // While the user talks, pay the cold-start costs (SecureStore reads,
      // TLS handshakes) so the post-stop hot path hits warm connections.
      prewarmVoicePipeline();

      if (sttSessionRef.current) {
        sttSessionRef.current.cancel();
        sttSessionRef.current = null;
      }

      lastPartialRef.current = '';
      const recordingStartedAt = Date.now();
      let loggedFirstPartial = false;

      // Fresh speculative-RAG session per turn: retrieval fires on a
      // stabilized partial while the user is still talking.
      speculativeRef.current?.cancel();
      speculativeRef.current = VOICE_SPECULATIVE_RAG
        ? createSpeculativeRag({ search: (q) => openaiService.search(q) })
        : null;

      const session = await startSttSession({
        handsFree: handsFreeMode,
        onPartial: (text) => {
          lastPartialRef.current = text;
          speculativeRef.current?.onPartial(text.slice(0, MAX_QUERY_CHARS));
          if (!loggedFirstPartial) {
            loggedFirstPartial = true;
            console.log(`[LATENCY] stt_partial_first_ms +${Date.now() - recordingStartedAt} (from record start)`);
          }
        },
        onEndOfSpeech: ({ reason }) => {
          if (voiceStateRef.current !== VoiceState.LISTENING) return;
          if (reason === 'lead-silence') {
            // User never spoke — return to idle quietly instead of processing.
            sttSessionRef.current?.cancel();
            sttSessionRef.current = null;
            setVoiceState(VoiceState.IDLE);
            return;
          }
          stopAndTranscribeRef.current?.();
        },
        onError: (err) => {
          console.warn('[useAvatarConversation] STT session error:', err?.message ?? err);
        },
      });

      sttSessionRef.current = session;
      setVoiceState(VoiceState.LISTENING);
    } catch (err) {
      if (err?.code === 'permission-denied') return; // same silent no-op as before
      console.error('[useAvatarConversation] startRecording:', err);
    }
  }, [handsFreeMode]);

  const stopAndTranscribe = useCallback(async () => {
    const session = sttSessionRef.current;
    if (!session) return;
    sttSessionRef.current = null;

    const t0 = Date.now();
    console.log(`[LATENCY] recording_stop_ms +0`);

    setVoiceState(VoiceState.PROCESSING);

    try {
      console.log(`[LATENCY] stt_start_ms +${Date.now() - t0}`);
      const { transcript, source } = await session.stop();
      const sttDoneAt = Date.now();
      console.log(`[LATENCY] stt_final_ms +${sttDoneAt - t0} source=${source}`);

      if (!transcript) {
        speculativeRef.current?.cancel();
        speculativeRef.current = null;
        setVoiceState(VoiceState.IDLE);
        return;
      }

      // Speculative RAG: reuse retrieval fired during speech when the final
      // transcript is lexically close to the stabilized partial.
      let preRetrievedChunks = null;
      if (speculativeRef.current) {
        const spec = await speculativeRef.current.resolve(transcript.slice(0, MAX_QUERY_CHARS));
        speculativeRef.current = null;
        console.log(`[LATENCY] rag_speculative=${spec.status} +${Date.now() - t0}`);
        if (spec.status === 'hit') preRetrievedChunks = spec.chunks;
      }

      // Pass t0 and sttDoneAt so processQuery shares the same timing anchor
      await processQuery(transcript, t0, sttDoneAt, preRetrievedChunks);

      // Hands-free: re-arm listening after a completed (not interrupted)
      // response so the conversation continues without another tap. The mic
      // stays off while the avatar speaks — echo would feed the recognizer.
      // (abortRef is the barge-in signal; state may not have re-rendered yet.)
      if (handsFreeMode && !abortRef.current) {
        startRecordingRef.current?.();
      }
    } catch (err) {
      console.error('[useAvatarConversation] stopAndTranscribe:', err);
      setError(err.message ?? 'Could not transcribe audio. Please try again.');
      setVoiceState(VoiceState.IDLE);
    }
  }, [processQuery, handsFreeMode]);

  // Keep the callback refs current (STT session callbacks + hands-free re-arm).
  useEffect(() => { stopAndTranscribeRef.current = stopAndTranscribe; }, [stopAndTranscribe]);
  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  const stopAudio = useCallback(() => {
    abortRef.current = true;
    activeStreamRef.current?.abort(); // close the TTS WebSocket + unblock the drain
    avatarRef.current?.stopAudio();
  }, [avatarRef]);

  // Unified handler for the microphone button — handles all state transitions.
  const handleMicPress = useCallback(async () => {
    if (voiceState === VoiceState.IDLE) {
      await startRecording();
    } else if (voiceState === VoiceState.LISTENING) {
      await stopAndTranscribe();
    } else if (voiceState === VoiceState.SPEAKING) {
      stopAudio();
      setVoiceState(VoiceState.IDLE);
    }
  }, [voiceState, startRecording, stopAndTranscribe, stopAudio]);

  const handleStop = useCallback(async () => {
    if (sttSessionRef.current) {
      sttSessionRef.current.cancel();
      sttSessionRef.current = null;
    }
    speculativeRef.current?.cancel();
    speculativeRef.current = null;
    stopAudio();
    setVoiceState(VoiceState.IDLE);
  }, [stopAudio]);

  return {
    voiceState,
    conversationHistory,
    processQuery,
    startRecording,
    stopAndTranscribe,
    stopAudio,
    handleMicPress,
    handleStop,
    error,
    clearError: () => setError(null),
    currentSubtitle,
  };
}
