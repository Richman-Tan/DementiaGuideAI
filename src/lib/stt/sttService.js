// Provider-agnostic STT facade for the voice pipeline.
//
//   const session = await startSttSession({ handsFree, onPartial, onEndOfSpeech, onError });
//   ...user talks; partials stream via onPartial (live provider only)...
//   const { transcript, source } = await session.stop();   // or session.cancel()
//
// Provider selection per turn:
//   1. Live recognition (expo-speech-recognition) when the config flag is on,
//      the device supports it, and no earlier live start has failed this
//      session (sticky degrade — a device that fails once will keep failing).
//   2. Whisper file-upload fallback (expo-av) otherwise.
//
// Live sessions that finalize to an EMPTY transcript are rescued through
// Whisper using the recognizer's persisted recording, so a bad recognition
// day never silently loses the user's words.

import { VOICE_STREAMING_STT } from '@/lib/voice/voiceConfig';
import { isLiveRecognitionAvailable, startLiveSession } from './expoSpeechRecognition';
import { startWhisperSession, transcribeFile } from './whisperFallback';

let sttDegraded = false; // sticky for the app session after a live start failure

export async function startSttSession(opts = {}) {
  if (VOICE_STREAMING_STT && !sttDegraded && isLiveRecognitionAvailable()) {
    try {
      const live = await startLiveSession(opts);
      return wrapLiveSession(live);
    } catch (err) {
      if (err?.code === 'permission-denied') throw err; // don't burn the fallback on a denial
      console.warn(`[STT] live recognition failed to start (${err?.message ?? err}) — using Whisper fallback from now on`);
      sttDegraded = true;
    }
  }

  const whisper = await startWhisperSession();
  return {
    provider: whisper.provider,
    cancel: whisper.cancel,
    stop: async () => ({ transcript: (await whisper.stop()) ?? '', source: 'whisper' }),
  };
}

function wrapLiveSession(live) {
  return {
    provider: live.provider,
    cancel: live.cancel,
    stop: async () => {
      const transcript = await live.stop();
      if (transcript) return { transcript, source: 'live' };

      // Empty live result: rescue via Whisper if the recognizer kept the audio.
      const uri = live.getRecordedUri();
      if (uri) {
        try {
          const rescued = await transcribeFile(uri);
          if (rescued) return { transcript: rescued, source: 'whisper-rescue' };
        } catch (err) {
          console.warn(`[STT] whisper rescue failed: ${err?.message ?? err}`);
        }
      }
      return { transcript: '', source: 'live' };
    },
  };
}
