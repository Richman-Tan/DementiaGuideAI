import { useState, useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
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
 *        a. chatStream() yields LLM tokens
 *        b. Sentence boundaries detected via punctuation
 *        c. Each complete sentence fires ttsService.tts() immediately
 *           (Promises pushed in order, resolved concurrently — later sentences
 *            generate while earlier ones are still playing)
 *        d. Segments played in order via avatarRef.current.playAudio()
 *           which resolves when the audio ends, keeping mouth sync tight
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
  const { audioEnabled } = useSettings();

  const recordingRef = useRef(null);
  const abortRef     = useRef(false);  // set true when user stops mid-response
  const historyRef   = useRef([]);     // kept in sync so callbacks always see latest

  // Keep historyRef in sync with React state
  useEffect(() => {
    historyRef.current = conversationHistory;
  }, [conversationHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      avatarRef.current?.stopAudio();
    };
  }, [avatarRef]);

  // ─── Core conversation loop ─────────────────────────────────────────────────
  // Stream LLM response sentence-by-sentence → TTS fires per sentence →
  // audio segments queued and played in order while later segments generate.
  const processQuery = useCallback(async (userText) => {
    if (!userText.trim()) return;

    setVoiceState(VoiceState.PROCESSING);
    abortRef.current = false;

    try {
      const history  = historyRef.current;
      let   fullText = '';

      // Each entry is a Promise<{ audio, visemeTimeline }> pushed in sentence order.
      // Promises resolve concurrently so TTS for sentence N+1 is already generating
      // while sentence N is playing — this is the key latency reduction.
      const segmentPromises = [];

      const addSegment = (text) => {
        const clean = text.trim();
        if (!clean || !audioEnabled) return;
        segmentPromises.push(tts(clean));
      };

      // Stream LLM tokens and split into sentences on punctuation boundaries.
      // Uses a delimiter trick (\x1F) to avoid lookbehind (unsupported in Hermes).
      let buf = '';
      for await (const chunk of openaiService.chatStream(userText, history)) {
        if (abortRef.current) break;
        fullText += chunk;
        buf      += chunk;
        const marked = buf.replace(/([.!?])\s+/g, '$1\x1F');
        const parts  = marked.split('\x1F');
        parts.slice(0, -1).forEach(s => addSegment(s));
        buf = parts[parts.length - 1];
      }
      // Flush any remaining text after the stream ends
      if (buf.trim() && !abortRef.current) addSegment(buf);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user',      content: userText  },
        { role: 'assistant', content: fullText   },
      ]);

      if (segmentPromises.length === 0 || abortRef.current) {
        setVoiceState(VoiceState.IDLE);
        return;
      }

      setVoiceState(VoiceState.SPEAKING);

      // Play segments in order. Awaiting each playAudio() call ensures the avatar
      // finishes speaking one sentence before the next begins, keeping lip sync
      // tightly coupled to the audio. playAudio() resolves on the 'audioEnd' event
      // from the WebView (fired by lipSyncSource.onended).
      for (let i = 0; i < segmentPromises.length; i++) {
        if (abortRef.current) break;
        const segment = await segmentPromises[i]; // { audio, visemeTimeline }
        if (abortRef.current) break;
        if (avatarRef.current) await avatarRef.current.playAudio(segment);
      }
    } catch (err) {
      console.error('[useAvatarConversation] processQuery error:', err);
    } finally {
      setVoiceState(VoiceState.IDLE);
    }
  }, [avatarRef]);

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

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
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

    setVoiceState(VoiceState.PROCESSING);

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const transcript = await openaiService.transcribe(uri);
      if (!transcript) {
        setVoiceState(VoiceState.IDLE);
        return;
      }

      await processQuery(transcript);
    } catch (err) {
      console.error('[useAvatarConversation] stopAndTranscribe:', err);
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
  };
}
