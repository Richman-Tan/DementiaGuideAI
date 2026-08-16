# Avatar and the voice conversation

Two renderers exist. Which one runs is resolved per platform and per avatar
profile:

| Renderer | Where | Model |
|---|---|---|
| **Unity** (CC4 characters, UaaL) | Native iOS/Android builds; default on web via WebGL | `unity-avatar/` submodule |
| **Three.js** (in a WebView, loaded from a CDN) | Expo Go, Simulator, and as the web fallback | `.vrm` / `.glb` in `assets/` |

On mobile the Three.js renderer runs inside a React Native `WebView`; all
animation happens in that embedded browser context and reports back via
`postMessage`.

## The voice conversation pipeline

Managed by `apps/mobile/src/features/voice/hooks/useAvatarConversation.js` (mobile) and
`apps/web/src/voice/useVoiceConversation.js` (web):

```
[Microphone] → expo-av recording
     ↓
[Whisper STT] → transcribed text
     ↓
[OpenAI gpt-4o stream] → tokens arrive sentence by sentence
     ↓
[ElevenLabs TTS] ← fires immediately per sentence, in parallel
     ↓
[Viseme timeline] ← character alignment → mouth-shape keyframes
     ↓
[Avatar] → plays audio + drives blend shapes in real time
```

Each sentence goes to TTS the moment it completes in the LLM stream, so the
avatar starts speaking the first sentence while later ones are still generating.
Latency budget, streaming STT and speculative retrieval:
[voice-latency-streaming.md](voice-latency-streaming.md).

`packages/core/voice/speculativeRetrieval.js` starts retrieval on a stabilised live-STT
partial *while the user is still talking*, so the embedding and vector-search
round trips are already in flight when the final transcript lands.

## State machine

`idle → listening → thinking → speaking`

Each state drives body bob and sway amplitude, head look-around frequency and
range, thinking gaze bias (up-right), and breathing depth on the spine/chest
bones.

## Lip sync

**ElevenLabs viseme path (primary).** ElevenLabs returns character-level
timestamps alongside the audio. `createVisemeTimeline.js` converts these into a
viseme frame sequence, mapping characters to one of five VRM blend shapes:
`aa` (open), `ih` (smile-open), `ou` (round), `ee` (wide), `oh` (rounded-open).
During playback the renderer tracks `AudioContext.currentTime` each frame,
binary-searches the timeline, and cross-fades between the active and next frame
over the final 20% of each frame's duration.

**RMS fallback path** (OpenAI TTS, or no ElevenLabs key). With no alignment
data, a Web Audio `AnalyserNode` measures RMS amplitude per frame and maps it to
the `aa` blend shape — open/close jaw movement tracking loudness.

**Recovery.** If the WebGL context is lost (iOS background eviction, Android
process kill), the WebView remounts automatically.

## Using AvatarVRM directly

Pass `modelUrl` to render any publicly hosted `.vrm`:

```jsx
<AvatarVRM
  ref={avatarRef}
  modelUrl="https://example.com/your-model.vrm"
  isListening={listening}
  isSpeaking={speaking}
  isThinking={thinking}
  width={300}
  height={420}
/>

// Play TTS audio with viseme lip sync (ElevenLabs path)
await avatarRef.current.playAudio({ audio: base64DataUri, visemeTimeline });

// Play TTS audio with the RMS fallback
await avatarRef.current.playAudio(base64DataUri);

// Stop early
avatarRef.current.stopAudio();
```

## Unity avatar

The Unity path shares one message protocol across mobile and web
(`setCharacter` / `play` / `stop`), so the same viseme timeline drives both.

- Native embedding, gradle wiring and export internals: [android-unity.md](android-unity.md)
- Web (WebGL) build and serving: [`apps/web/README.md`](../apps/web/README.md)
