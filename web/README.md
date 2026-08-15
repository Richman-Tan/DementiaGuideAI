# DementiaGuide AI — Web

The web build of DementiaGuideAI: the same product as the iOS/Android app —
RAG chat with inline citations, a full voice loop, and the real-time 3D
avatar — implemented from the Claude Design prototype ("Full web build
review") and reusing the mobile app's core libraries from `../src/lib`.

**Live:** https://dementiaguide-web.vercel.app

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:5173 (or --port)
npm test           # vitest — interop canary + settings/citation mapping
npm run build      # static bundle in dist/
```

`cp .env.example .env` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
(same values as the mobile app's `EXPO_PUBLIC_*` vars) for live retrieval.

## Mock vs real

With **no OpenAI key stored** (or `?mock=1`, or `VITE_FORCE_MOCK=1`) the app
runs fully offline with the prototype's canned replies and simulated voice
loop. Paste an **OpenAI key** (and optionally an **ElevenLabs key**) under
Settings → Advanced to go live:

- Chat: gpt-4o + Supabase pgvector RAG (`match_chunks`), streaming, validated
  inline `[n]` citations with a source drawer (KB sources matched back to
  library articles where possible).
- Voice: Web Speech API live partials (Chrome/Edge; MediaRecorder→Whisper
  fallback elsewhere), hands-free endpointing, speculative RAG, ElevenLabs
  WebSocket streaming TTS with character-alignment visemes, REST cascade
  fallback.
- Keys live only in this browser's localStorage — parity with the app's
  on-device key entry. Don't use this pattern for a public multi-tenant site.

## Architecture notes

- `src/lib/rag`, `src/lib/lipsync`, `src/lib/tts`, sentence tracking and
  speculative retrieval are imported **verbatim from the mobile app** via the
  `@` alias (see `vite.config.js` — a tiny transform converts the five
  deliberately-CJS config modules to ESM).
- The Three.js avatar renderer is **generated** from the mobile WebView
  template: `node scripts/extract-renderer.mjs` re-derives
  `src/avatar/three/renderer.js` from `AvatarVRM.js`. Edit the mobile source,
  not the generated file.
- GLB models are referenced from `../assets` (aria 26 MB, zhenja 8.8 MB,
  backdrop 9.6 MB) and content-hashed into `dist/` at build.
- Unity avatars (Aaron default / Ariana) are the primary renderer — mobile
  parity. The WebGL build is a git-ignored artifact: export from the Unity
  project (Tools → UaaL → Export WebGL), then `npm run sync:unity` copies it
  into `public/unity/Build/` (see `public/unity/README.md`). Without a build
  the app auto-falls back to the Three.js avatars (effective-profile
  resolution — renderer, TTS voice and UI copy fall back together) and the
  picker keeps the Unity entries locked.

## Deploy (Vercel)

The bundle imports from `../src`, which Vercel's cloud build can't see when
the project root is `web/` — deploy **prebuilt**:

```bash
cd web
export VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=…   # vercel build stages a copy without .env
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

(If you later connect the Git repo instead, set Root Directory to `web` and
enable "Include source files outside of the Root Directory".)
