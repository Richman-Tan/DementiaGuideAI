/**
 * Shared expo-av audio-mode presets — the single source of truth for every
 * Audio.setAudioModeAsync call in the app.
 *
 * Before these existed, call sites passed only the iOS keys
 * (playsInSilentModeIOS/allowsRecordingIOS), leaving Android on expo-av
 * defaults. The Android keys matter for parity:
 * - playThroughEarpieceAndroid: false — after a recording session Android
 *   otherwise routes playback to the EARPIECE (the classic
 *   record-then-quiet-playback bug, which would hit every Whisper turn).
 * - shouldDuckAndroid: true — other apps' audio ducks under Aria instead of
 *   mixing at full volume.
 */

export const PLAYBACK_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
  staysActiveInBackground: false,
};

export const RECORDING_MODE = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
  staysActiveInBackground: false,
};
