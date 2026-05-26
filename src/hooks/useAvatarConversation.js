import { useState, useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { openaiService } from '../services/openaiService';
import { tts } from '../lib/tts/ttsService';
import { useSettings } from '../context/SettingsContext';

// ─── Voice state machine ──────────────────────────────────────────────────────
export const VoiceState = {
  IDLE:       'idle',
  LISTENING:  'listening',
  PROCESSING: 'processing',
  SPEAKING:   'speaking',
};

// Whisper-optimised recording: 16 kHz mono reduces upload size ~4× vs HIGH_QUALITY
// with no accuracy loss (Whisper resamples to 16 kHz internally).
const WHISPER_RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

// Secondary sentence split: fire TTS early when a sentence buffer exceeds this
// length and contains a comma/semicolon, avoiding long silences on clause-heavy
// responses before the first .!? boundary arrives.
const EARLY_CHUNK_CHARS = 80;

// Shared AsyncStorage key with ChatScreen — both read/write the same array.
const MESSAGES_KEY = 'chat_messages_v1';
const MAX_PERSISTED = 100;

/**
 * useAvatarConversation
 *
 * Encapsulates the full voice conversation pipeline so VoiceScreen.js stays
 * purely presentational.
 *
 * Pipeline overview:
 *   1. startRecording()     — expo-av records microphone audio
 *   2. stopAndTranscribe()  — Whisper transcribes the recording
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
 * @param {{ avatarRef: React.RefObject }} options
 */
export function useAvatarConversation({ avatarRef }) {
  const [voiceState, setVoiceState]               = useState(VoiceState.IDLE);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [error, setError]                         = useState(null);            // string | null
  const [currentSubtitle, setCurrentSubtitle]     = useState(''); // current speaking sentence
  const { audioEnabled } = useSettings();

  const recordingRef = useRef(null);
  const abortRef     = useRef(false);  // set true when user stops mid-response
  const historyRef   = useRef([]);     // kept in sync so callbacks always see latest

  // Keep historyRef in sync with React state
  useEffect(() => {
    historyRef.current = conversationHistory;
  }, [conversationHistory]);

  // On mount: pre-warm KB embeddings and load persisted conversation history
  // so the voice pipeline shares context with ChatScreen.
  useEffect(() => {
    const init = async () => {
      openaiService.initKnowledgeBase().catch(() => {});
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
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      avatarRef.current?.stopAudio();
    };
  }, [avatarRef]);

  // ─── Core conversation loop ─────────────────────────────────────────────────
  // Producer-consumer pattern: LLM streaming and TTS playback run concurrently.
  // The consumer starts as soon as the first sentence is queued — it does NOT
  // wait for the full LLM response before playing the first audio segment.
  const processQuery = useCallback(async (userText, t0 = Date.now(), sttDoneAt = null) => {
    if (!userText.trim()) return;

    setVoiceState(VoiceState.PROCESSING);
    abortRef.current = false;

    // Timing accumulator — checkpoints set inline, printed in finally
    const pts = { stt_done: sttDoneAt };

    // ── Shared async queue (single consumer, Hermes-safe) ────────────────────
    // JS is single-threaded so array writes are never truly concurrent.
    // The notify slot holds at most one waiter (only the consumer ever sets it).
    const queue = { promises: [], done: false, notify: null };
    const wake  = () => { const n = queue.notify; queue.notify = null; n?.(); };

    // ── Producer: stream LLM → split sentences → enqueue TTS promises ────────
    const producerTask = async () => {
      const history = historyRef.current;
      let fullText  = '';
      let buf       = '';
      let firstSeg  = true;

      const addSegment = (text) => {
        const clean = text.trim();
        if (!clean || !audioEnabled) return;

        if (firstSeg) {
          pts.first_sentence = Date.now();
          console.log(`[LATENCY] first_sentence_ready_ms +${pts.first_sentence - t0}`);
          pts.tts_start = Date.now();
          console.log(`[LATENCY] tts_first_request_start_ms +${pts.tts_start - t0}`);
          const p = tts(clean).then(result => {
            pts.tts_ready = Date.now();
            console.log(`[LATENCY] tts_first_audio_ready_ms +${pts.tts_ready - t0}`);
            return { ...result, text: clean };
          });
          queue.promises.push(p);
          firstSeg = false;
        } else {
          queue.promises.push(tts(clean).then(result => ({ ...result, text: clean })));
        }
        wake();
      };

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
        };

        pts.rag_start = Date.now();
        console.log(`[LATENCY] rag_start_ms +${pts.rag_start - t0}`);

        let firstChunk = true;
        for await (const chunk of openaiService.chatStream(userText, history, timingCbs)) {
          if (abortRef.current) break;
          if (firstChunk) {
            pts.first_token = Date.now();
            console.log(`[LATENCY] first_token_ms +${pts.first_token - t0}`);
            firstChunk = false;
          }
          fullText += chunk;
          buf      += chunk;

          // Primary split: sentence boundaries on .!?
          // Uses \x1F delimiter trick to avoid lookbehind (unsupported in Hermes).
          const marked = buf.replace(/([.!?])\s+/g, '$1\x1F');
          const parts  = marked.split('\x1F');
          parts.slice(0, -1).forEach(s => addSegment(s));
          buf = parts[parts.length - 1];

          // Secondary split: fire TTS early when buffer is long and contains a
          // natural pause point, so clause-heavy responses don't block first audio.
          if (buf.length > EARLY_CHUNK_CHARS) {
            const splitIdx = Math.max(buf.lastIndexOf(','), buf.lastIndexOf(';'));
            if (splitIdx > 15) {
              addSegment(buf.slice(0, splitIdx + 1));
              buf = buf.slice(splitIdx + 1).trimStart();
            }
          }
        }

        if (buf.trim() && !abortRef.current) addSegment(buf);
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
          const assistantEntry = { id: `v_${now + 1}`, role: 'assistant', text: fullText, sources: [], timestamp: new Date().toISOString() };
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
          // One-shot callback: fires when WebView signals audio has actually started
          avatarRef.current?.setOnAudioStart(() => {
            pts.audio_started = Date.now();
            console.log(`[LATENCY] avatar_audio_started_ms +${pts.audio_started - t0}`);
          });
          firstPlay = false;
        }

        if (avatarRef.current) await avatarRef.current.playAudio(segment);

        // Skip the inter-segment gap after the final segment
        const isLast = queue.done && i === queue.promises.length - 1;
        if (!isLast && !abortRef.current) {
          await new Promise(r => setTimeout(r, 420));
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
      setCurrentSubtitle('');
      setVoiceState(VoiceState.IDLE);
      const d = (a, b) => (a != null && b != null) ? a - b : null;
      console.log('[LATENCY SUMMARY]', JSON.stringify({
        stt_ms:            d(pts.stt_done,      t0),
        rag_ms:            d(pts.rag_done,       pts.rag_start),
        llm_to_token_ms:   d(pts.first_token,    pts.llm_send),
        first_sentence_ms: d(pts.first_sentence, pts.first_token),
        tts_first_ms:      d(pts.tts_ready,      pts.tts_start),
        to_first_audio_ms: d(pts.audio_started,  t0),
      }));
    }
  }, [avatarRef, audioEnabled]);

  // ─── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(WHISPER_RECORDING_OPTIONS);
      recordingRef.current = recording;
      setVoiceState(VoiceState.LISTENING);
    } catch (err) {
      console.error('[useAvatarConversation] startRecording:', err);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    const t0 = Date.now();
    console.log(`[LATENCY] recording_stop_ms +0`);

    setVoiceState(VoiceState.PROCESSING);

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      console.log(`[LATENCY] stt_start_ms +${Date.now() - t0}`);
      const transcript = await openaiService.transcribe(uri);
      const sttDoneAt = Date.now();
      console.log(`[LATENCY] stt_done_ms +${sttDoneAt - t0}`);

      if (!transcript) {
        setVoiceState(VoiceState.IDLE);
        return;
      }

      // Clean up temp recording file before proceeding
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

      // Pass t0 and sttDoneAt so processQuery shares the same timing anchor
      await processQuery(transcript, t0, sttDoneAt);
    } catch (err) {
      console.error('[useAvatarConversation] stopAndTranscribe:', err);
      setError(err.message ?? 'Could not transcribe audio. Please try again.');
      setVoiceState(VoiceState.IDLE);
    }
  }, [processQuery]);

  const stopAudio = useCallback(() => {
    abortRef.current = true;
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
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      recordingRef.current = null;
    }
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
