// Live (streaming) speech recognition via expo-speech-recognition —
// iOS SFSpeechRecognizer / Android SpeechRecognizer.
//
// Partials arrive WHILE the user is talking, so the transcript is essentially
// ready the moment they stop — no post-stop Whisper upload round trip.
//
// Design notes:
// - `continuous: true` on both platforms: the OS must never auto-kill the
//   session mid-utterance in push-to-talk mode; endpointing is ours.
// - `recordingOptions.persist` keeps the raw audio so the caller can rescue a
//   failed/empty live transcript by sending the file to Whisper.
// - The recognition session is the ONLY mic owner per turn. Do not run an
//   expo-av recording in parallel — AVAudioRecorder and SFSpeechRecognizer's
//   AVAudioEngine tap contend for the shared AVAudioSession on iOS.

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Audio } from 'expo-av';
import {
  STT_FINAL_TIMEOUT_MS,
  HANDS_FREE_SILENCE_MS,
  HANDS_FREE_MAX_LEAD_SILENCE_MS,
  HANDS_FREE_VOLUME_THRESHOLD,
  HANDS_FREE_VOLUME_INTERVAL_MS,
} from '@/lib/voice/voiceConfig';

// Recognition runs under playAndRecord + measurement (see start() below),
// which iOS plays MUCH quieter through the speaker — and the category
// outlives the session. Hand the session back to plain playback as soon as
// recognition finishes so the avatar's TTS comes out at full volume.
function restorePlaybackSession() {
  Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  }).catch(() => {});
}

export function isLiveRecognitionAvailable() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/**
 * Start a live recognition session.
 *
 * @param {object} opts
 * @param {boolean}  opts.handsFree     enable silence auto-endpointing
 * @param {function} opts.onPartial     (text, { isFinal }) — every transcript update
 * @param {function} opts.onEndOfSpeech ({ reason }) — hands-free endpoint detected (fires once)
 * @param {function} opts.onError       (err) — mid-session recognition error
 *
 * @returns {Promise<{
 *   provider: 'live',
 *   stop: () => Promise<string>,   // finalize; resolves transcript ('' if none)
 *   cancel: () => void,            // abort, no result
 *   getRecordedUri: () => string|null, // persisted audio for Whisper rescue
 * }>}
 */
export async function startLiveSession({ handsFree = false, onPartial, onEndOfSpeech, onError } = {}) {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) {
    const err = new Error('Speech recognition permission not granted');
    err.code = 'permission-denied';
    throw err;
  }

  let lastTranscript = '';
  let recordedUri = null;
  let gotFinal = false;
  let ended = false;
  let stopping = false;
  let settled = false;
  let stopResolve = null;
  let stopTimer = null;
  let endpointTimer = null;
  let endOfSpeechFired = false;

  const subs = [];

  const cleanup = () => {
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (endpointTimer) { clearInterval(endpointTimer); endpointTimer = null; }
    subs.forEach(s => { try { s.remove(); } catch {} });
    subs.length = 0;
  };

  // Resolve the pending stop() with whatever we have. The last interim
  // transcript is almost always the complete utterance — never block on a
  // recognizer that won't deliver its final result.
  const settleStop = () => {
    if (settled || !stopResolve) return;
    settled = true;
    const r = stopResolve;
    stopResolve = null;
    cleanup();
    restorePlaybackSession();
    r(lastTranscript.trim());
  };

  // Hands-free endpointing state
  let sawSpeech = false;
  let lastChangeAt = Date.now();
  let currentVolume = -2; // library range ≈ -2..10; below 0 is inaudible

  subs.push(ExpoSpeechRecognitionModule.addListener('result', (ev) => {
    const transcript = ev?.results?.[0]?.transcript ?? '';
    if (transcript) {
      if (transcript !== lastTranscript) lastChangeAt = Date.now();
      lastTranscript = transcript;
      sawSpeech = true;
      try { onPartial?.(transcript, { isFinal: !!ev.isFinal }); } catch {}
    }
    if (ev?.isFinal) {
      gotFinal = true;
      settleStop();
    }
  }));

  // The persisted-recording URI arrives on audiostart (iOS) / audioend.
  subs.push(ExpoSpeechRecognitionModule.addListener('audiostart', (ev) => {
    if (ev?.uri) recordedUri = ev.uri;
  }));
  subs.push(ExpoSpeechRecognitionModule.addListener('audioend', (ev) => {
    if (ev?.uri) recordedUri = ev.uri;
  }));

  subs.push(ExpoSpeechRecognitionModule.addListener('end', () => {
    ended = true;
    settleStop();
  }));

  subs.push(ExpoSpeechRecognitionModule.addListener('error', (ev) => {
    // 'aborted' follows our own abort(); 'no-speech' is an empty utterance,
    // not a failure — both settle quietly.
    const code = ev?.error ?? 'unknown';
    if (code !== 'aborted' && code !== 'no-speech' && !stopping) {
      try { onError?.(new Error(`Speech recognition error: ${code}${ev?.message ? ` (${ev.message})` : ''}`)); } catch {}
    }
    ended = true;
    settleStop();
  }));

  if (handsFree) {
    subs.push(ExpoSpeechRecognitionModule.addListener('volumechange', (ev) => {
      if (typeof ev?.value === 'number') currentVolume = ev.value;
    }));

    const startedAt = Date.now();
    const fireEndOfSpeech = (reason) => {
      if (endOfSpeechFired || stopping) return;
      endOfSpeechFired = true;
      try { onEndOfSpeech?.({ reason }); } catch {}
    };
    endpointTimer = setInterval(() => {
      if (stopping) return;
      const now = Date.now();
      if (!sawSpeech) {
        // Never endpoint on leading silence — but don't listen forever either.
        if (now - startedAt > HANDS_FREE_MAX_LEAD_SILENCE_MS) fireEndOfSpeech('lead-silence');
        return;
      }
      const quiet = currentVolume < HANDS_FREE_VOLUME_THRESHOLD;
      const stable = now - lastChangeAt >= HANDS_FREE_SILENCE_MS;
      if (quiet && stable) fireEndOfSpeech('endpoint');
    }, HANDS_FREE_VOLUME_INTERVAL_MS);
  }

  try {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-NZ',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
      // Keep the raw audio so an empty/failed live transcript can be rescued
      // by the Whisper fallback (Android 13+/iOS only; null uri elsewhere).
      recordingOptions: { persist: true },
      volumeChangeEventOptions: { enabled: handsFree, intervalMillis: HANDS_FREE_VOLUME_INTERVAL_MS },
      // playAndRecord shares the AVAudioSession with the avatar's WebView
      // playback instead of fighting it — without this, recognition dies at
      // start with "Audio session was interrupted" whenever the WebView's
      // AudioContext holds the session.
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
        mode: 'measurement',
      },
    });
  } catch (err) {
    cleanup();
    throw err;
  }

  return {
    provider: 'live',
    getRecordedUri: () => recordedUri,

    stop: () => new Promise((resolve) => {
      stopping = true;
      if (gotFinal || ended) {
        cleanup();
        restorePlaybackSession();
        resolve(lastTranscript.trim());
        return;
      }
      stopResolve = resolve;
      stopTimer = setTimeout(settleStop, STT_FINAL_TIMEOUT_MS);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        settleStop();
      }
    }),

    cancel: () => {
      stopping = true;
      settled = true; // block any pending settle from resolving after cancel
      cleanup();
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
      restorePlaybackSession();
    },
  };
}
