# Mobile app (Expo / React Native)

The Expo project is `apps/mobile/` — `App.js`, `index.js`, `app.json` and the
Metro/Babel/TS config all live there, and it is its own npm workspace. iOS and
Android only; the web build is a separate Vite app in
[`apps/web/`](../apps/web/README.md). Paths below are relative to `apps/mobile/`
unless stated otherwise.

Two things sit outside the app because both surfaces use them: `packages/core/`
(shared logic, `@core/…`) and `assets/` (the `.glb` avatar models, `@assets/…`).
`metro.config.js` names both in `watchFolders` — Metro only resolves what it
watches, so a new shared directory at the workspace root has to be added there
or it will not resolve.

## Tech stack

| Layer      | Technology                                                                |
| ---------- | ------------------------------------------------------------------------- |
| Framework  | React Native (Expo SDK 54)                                                |
| Navigation | React Navigation 7 (Bottom Tabs + Native Stack)                           |
| AI / RAG   | OpenAI `gpt-4o` + `text-embedding-3-small`                                |
| Vector DB  | Supabase (pgvector) — hosted knowledge base with the `match_chunks` RPC   |
| STT        | OpenAI Whisper (`whisper-1`) via `expo-av` recording                      |
| TTS        | ElevenLabs `eleven_turbo_v2_5` (primary) · OpenAI `tts-1` (fallback)      |
| Lip sync   | ElevenLabs character alignment → viseme timeline → 5 VRM blend shapes     |
| Avatar     | Unity (CC4, native) or VRM via Three.js + `@pixiv/three-vrm` in a WebView |
| Audio      | expo-av · Web Audio API (WebView)                                         |
| Storage    | `@react-native-async-storage/async-storage` · `expo-secure-store`         |
| Other      | expo-linear-gradient · expo-haptics · react-native-safe-area-context      |

## Screens

| Screen       | Description                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| **Home**     | Avatar hero card, quick question chips, text/voice entry, navigation grid                                   |
| **Chat**     | iMessage-style conversation, typing indicator, clickable source links                                       |
| **Library**  | Searchable knowledge base across 6 categories, with article detail view                                     |
| **Voice**    | Full-screen voice UI — Whisper STT, streamed LLM response, sentence-by-sentence avatar speech with lip sync |
| **Settings** | Accessibility controls — text size, contrast, audio, subtitles, haptics, privacy                            |

A guided 12-step onboarding flow runs on first launch.

## Structure

Organised **feature-first**: each domain owns its screens, components, hooks and
config under `src/features/<domain>/`. Cross-cutting concerns live in a shared
kernel (`theme/`, `context/`, `constants/`, top-level `components/`); all
external integrations and pure engines live in `lib/`.

Three path aliases, and the distinctions matter:

| Alias      | Points to          | Contains                                           |
| ---------- | ------------------ | -------------------------------------------------- |
| `@/`       | `apps/mobile/src/` | Mobile-app code only                               |
| `@core/`   | `packages/core/`   | Logic shared with `apps/web/` and the Node scripts |
| `@assets/` | `assets/`          | The `.glb` avatar models, shared with `apps/web/`  |

`@core` is declared in `babel.config.js`, `tsconfig.json`, `jest.config.js` and
`apps/web/vite.config.js` — **all four must stay in step.** See
[`packages/core/README.md`](../packages/core/README.md) for what may live there.

Files migrate to **TypeScript** incrementally: the shared kernel and integration
layer are typed (`.ts`/`.tsx`); screens and avatar/provider modules remain `.js`
under `allowJs`.

```
src/
├── navigation/AppNavigator.js        # Root bottom-tab + stack navigator
├── features/
│   ├── home/screens/HomeScreen.js
│   ├── chat/screens/ChatScreen.js
│   ├── voice/                        # Whisper → LLM → TTS → avatar
│   │   ├── screens/VoiceScreen.js
│   │   ├── components/VoiceWaveform.js
│   │   └── hooks/useAvatarConversation.js
│   ├── avatar/                       # Avatar rendering + Unity bridge
│   │   ├── components/{AvatarVRM,AvatarUnity}.js
│   │   ├── config/avatarProfiles.ts
│   │   └── bridge/{UnityAvatarBridge,AvatarBridgeProtocol}.js
│   ├── library/                      # Knowledge-base browsing
│   │   ├── screens/{LibraryScreen,ArticleDetailScreen}.js
│   │   └── data/knowledgeBase.js     # Local KB backup; runtime uses Supabase
│   ├── onboarding/                   # 12-step flow + its own navigator
│   └── settings/screens/ProfileScreen.js
├── components/                       # Shared cross-feature UI
├── lib/                              # Platform integrations (pure engines are in @core)
│   ├── openaiService.js              # embed → match_chunks → streaming chat
│   ├── ragTelemetry.js               # Device-local traces (never message text)
│   ├── supabaseService.ts            # Supabase anon client
│   ├── tts/                          # Playback + provider selection (Azure/ElevenLabs)
│   ├── stt/                          # Whisper + on-device recognition
│   ├── voice/prewarm.js              # Warms expo-av and the native recognizer
│   ├── audio/audioModes.js
│   └── lipsync/azureVisemeMap.js     # Azure Speech SDK viseme IDs
├── theme/                            # colors.ts, typography.ts
├── constants/data.js
└── context/SettingsContext.tsx       # App-wide settings + theme provider
```

The pure engines these sit on top of live in `packages/core/` — `voice/`
(`voiceConfig`, `speculativeRetrieval`, `sentenceTracker`), `tts/`
(`normalizeSpokenText`, `elevenLabsStreamService`), `lipsync/` (viseme timeline

- `g2p/`) and `avatar/blendshapeTranslator`. Anything with no platform import
  belongs there, not here.

## Running natively

Expo Go and the Simulator cover chat, voice and library. The **Unity avatar
needs a full native build**; without it the avatar area shows a fallback.

```bash
npx expo start --ios        # Simulator / Expo Go
npx expo start --android
npx expo start --ios --clear   # clear the Metro cache
```

### Android with the Unity avatar

One-time machine setup:

1. **Unity Android Build Support** for the pinned editor (6000.5.0f1), including
   the _Android SDK & NDK Tools_ and _OpenJDK_ child modules — via Unity Hub
   (Installs → ⚙ → Add modules), or headless:
   ```bash
   "/Applications/Unity Hub.app/Contents/MacOS/Unity Hub" -- --headless \
     install-modules --version 6000.5.0f1 -m android --childModules
   ```
2. **Android SDK env** in your shell profile (`expo run:android` needs it to
   write `android/local.properties`):
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
   ```

Build and run:

```bash
# 1. Export the Unity Android library (once per Unity-side change):
#    Unity → Tools → UaaL → Export Android (android-export)
#    …or pull the committed export:
git submodule update --init && git -C unity-avatar/UnityAvatarProject lfs pull

# 2. Generate the native project and run on a connected device:
npx expo prebuild --platform android
npx expo run:android

# Debugging filters
adb logcat -s Unity:V UnityAvatarModule:V UnityBridgeManager:V ReactNativeJS:V AndroidRuntime:E
```

Without the `android-export/` artifact the app still builds — the config plugin
logs a warning, skips the Unity wiring, and the avatar falls back. Export
internals, gradle wiring and material fallbacks: [android-unity.md](android-unity.md).

> `apps/mobile/{android,ios}/` are generated by `expo prebuild` and are **not**
> tracked. Run every Expo command from `apps/mobile/` (or via the root `npm start`
> / `npm run ios` / `npm run android`, which delegate there).
>
> Never run `expo prebuild` from inside `apps/web/` — Expo will treat the Vite app
> as a React Native project and write RN dependencies into it. Because a shell's
> working directory persists, a stray `cd apps/web` from an earlier command is
> enough to cause this.

## API keys

Enter keys in-app under **Settings → AI Configuration**:

- **OpenAI** — required for chat, Whisper STT, and fallback TTS
- **ElevenLabs** — optional; enables the full viseme lip-sync path

Both are stored via `expo-secure-store` and never leave the device. Moving them
server-side is the motivation for the planned backend — see
[architecture/backend-plan.md](architecture/backend-plan.md).
