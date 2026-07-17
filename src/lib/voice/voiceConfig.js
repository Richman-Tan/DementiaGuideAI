// Single source of truth for voice-pipeline latency configuration.
//
// Plain CommonJS on purpose, mirroring rag/ragConfig.js: consumable by Metro,
// Jest, and Node scripts without ESM interop surprises. Developer flags live
// here; user-facing kill switches (handsFreeMode, fastVoiceMode) live in
// SettingsContext and are ANDed with these at runtime.

// ─── Streaming STT (PR 2) ─────────────────────────────────────────────────────
const VOICE_STREAMING_STT = true; // expo-speech-recognition primary, Whisper-upload fallback

// How long stop() waits for the recognizer's final result before using the
// last interim transcript (the last partial is almost always the complete
// utterance — waiting longer defeats the point of streaming STT).
const STT_FINAL_TIMEOUT_MS = 700;

// Hands-free endpointing: declare end-of-speech after this much silence
// (no partial-transcript change AND volume below threshold). Deliberately
// generous — elderly and hesitant speakers pause mid-thought.
const HANDS_FREE_SILENCE_MS = 1200;
// Give up waiting for the user to start talking after this long.
const HANDS_FREE_MAX_LEAD_SILENCE_MS = 8000;
// volumechange emits ≈ -2..10; the library documents "below 0" as inaudible.
const HANDS_FREE_VOLUME_THRESHOLD = 0;
const HANDS_FREE_VOLUME_INTERVAL_MS = 150;

// ─── Streaming TTS (PR 3) ─────────────────────────────────────────────────────
const VOICE_STREAMING_TTS = true; // ElevenLabs WebSocket stream-input; REST cascade fallback

// eleven_flash_v2_5 ≈ 75 ms model TTFB vs ~275 ms for turbo_v2_5. Flip back to
// 'eleven_turbo_v2_5' if flash quality on NZ health content disappoints (A/B).
const ELEVEN_STREAM_MODEL = 'eleven_flash_v2_5';

// PCM (not MP3) so the WebView can schedule chunks gaplessly without needing a
// complete file for decodeAudioData. 22 kHz halves bridge traffic vs 44.1 kHz
// and is full-band for a speech voice through phone speakers.
const ELEVEN_STREAM_FORMAT = 'pcm_22050';
const ELEVEN_STREAM_SAMPLE_RATE = 22050;

// Server-side buffering thresholds (chars) before each successive generation —
// small first value = sub-sentence first audio.
const ELEVEN_CHUNK_SCHEDULE = [90, 120, 160, 250];

// Re-bucket WS audio into ~this many ms per WebView inject (≈15 KB base64 at
// 22.05 kHz — far below injectJavaScript practical limits, few enough calls).
const CHUNK_BUCKET_MS = 250;

const WS_OPEN_TIMEOUT_MS = 3000;   // WS connect slower than this → REST fallback
const WS_STALL_TIMEOUT_MS = 6000;  // no audio while input pending → REST fallback

// ─── Speculative RAG (PR 4) ───────────────────────────────────────────────────
// Fire retrieval on a stabilized live-STT partial while the user is still
// talking, so the embedding + vector-search round trips (250–650 ms) are
// already done when the final transcript lands.
const VOICE_SPECULATIVE_RAG = true;
const SPECULATIVE_STABLE_MS = 900;      // partial unchanged this long → fire
const SPECULATIVE_MIN_WORDS = 4;        // don't fire on fragments
const SPECULATIVE_MAX_FIRES = 2;        // cap wasted embedding tokens per turn
const SPECULATIVE_REUSE_JACCARD = 0.8;  // token overlap needed to reuse the result

module.exports = {
  VOICE_STREAMING_STT,
  STT_FINAL_TIMEOUT_MS,
  HANDS_FREE_SILENCE_MS,
  HANDS_FREE_MAX_LEAD_SILENCE_MS,
  HANDS_FREE_VOLUME_THRESHOLD,
  HANDS_FREE_VOLUME_INTERVAL_MS,
  VOICE_STREAMING_TTS,
  ELEVEN_STREAM_MODEL,
  ELEVEN_STREAM_FORMAT,
  ELEVEN_STREAM_SAMPLE_RATE,
  ELEVEN_CHUNK_SCHEDULE,
  CHUNK_BUCKET_MS,
  WS_OPEN_TIMEOUT_MS,
  WS_STALL_TIMEOUT_MS,
  VOICE_SPECULATIVE_RAG,
  SPECULATIVE_STABLE_MS,
  SPECULATIVE_MIN_WORDS,
  SPECULATIVE_MAX_FIRES,
  SPECULATIVE_REUSE_JACCARD,
};
