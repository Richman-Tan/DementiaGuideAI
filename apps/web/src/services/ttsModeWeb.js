// Web twin of src/lib/tts/ttsMode.js. No Azure on web, so the decision is:
// streaming flag on + no sticky degrade + an ElevenLabs key → 'eleven-stream'.
import { VOICE_STREAMING_TTS } from '@core/voice/voiceConfig';
import { getElevenKey } from '../state/keysStore.js';

let ttsDegraded = false; // sticky after a mid-turn WS failure

export function markTtsDegraded(reason) {
  if (!ttsDegraded) {
    console.warn(`[TTS] streaming degraded for this session: ${reason}`);
  }
  ttsDegraded = true;
}

export async function selectTtsMode() {
  if (!VOICE_STREAMING_TTS || ttsDegraded) return 'rest';
  // Study sessions land on 'rest' by construction: stream-input needs the key in
  // the browser to open the socket, which is precisely what the server-side
  // proxy exists to avoid. Recorded as a limitation in docs/study/protocol.md
  // §10.4 — study latency figures are not comparable to the WebSocket ones.
  return getElevenKey() ? 'eleven-stream' : 'rest';
}
