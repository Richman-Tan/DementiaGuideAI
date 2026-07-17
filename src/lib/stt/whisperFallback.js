// Legacy STT path: expo-av records the full utterance, then the file is
// uploaded to Whisper. This is the code that used to live inside
// useAvatarConversation — kept behaviour-identical as the fallback for when
// live recognition is unavailable (no permission, unsupported device,
// VOICE_STREAMING_STT off, or a live-session start failure).

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { openaiService } from '@/lib/openaiService';

// Whisper-optimised recording: 16 kHz mono reduces upload size ~4× vs HIGH_QUALITY
// with no accuracy loss (Whisper resamples to 16 kHz internally).
export const WHISPER_RECORDING_OPTIONS = {
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

/** Transcribe an existing audio file (also used to rescue empty live sessions). */
export function transcribeFile(uri) {
  return openaiService.transcribe(uri);
}

/**
 * Start a Whisper-backed recording session with the same interface as the
 * live session in expoSpeechRecognition.js. No partials, no hands-free
 * endpointing (there is no signal to endpoint on without the recognizer).
 */
export async function startWhisperSession() {
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') {
    const err = new Error('Microphone permission not granted');
    err.code = 'permission-denied';
    throw err;
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  let recording;
  try {
    ({ recording } = await Audio.Recording.createAsync(WHISPER_RECORDING_OPTIONS));
  } catch (err) {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    throw err;
  }

  let done = false;

  return {
    provider: 'whisper',
    getRecordedUri: () => null, // stop() already ran Whisper on the recording

    stop: async () => {
      if (done) return '';
      done = true;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const transcript = await transcribeFile(uri);
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      return transcript ?? '';
    },

    cancel: () => {
      if (done) return;
      done = true;
      recording.stopAndUnloadAsync().catch(() => {});
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    },
  };
}
