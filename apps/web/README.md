# DementiaGuide AI — Web

The web build of DementiaGuideAI: the same product as the iOS/Android app —
RAG chat with inline citations, a full voice loop, and the real-time 3D
avatar — implemented from the Claude Design prototype ("Full web build
review") and reusing the shared engines from `packages/core` as `@core/…`.

**Live:** https://dementiaguide-web.vercel.app

## Run

Install once from the **repo root** (`npm install`) — this is an npm workspace and
shares the root lockfile. Then, from here:

```bash
npm run dev        # http://localhost:5173 (or --port)
npm test           # vitest — interop canary + settings/citation mapping
npm run build      # static bundle in dist/
```

Or from the repo root without changing directory: `npm run web`, and
`npm run test:web` / `npm run build -w apps/web`.

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

## Study mode

The usability study (`docs/study/`) runs on this app. Two things it needed that
the shipped build could not do:

- **Answer without the participant's own key.** The backend service
  (`apps/api`, its own app — see its README for why it is not a folder in here)
  holds the OpenAI and ElevenLabs credentials and admits callers by **study
  access code**. Retrieval, prompt assembly and citation extraction stay in the
  client, so both credential modes run byte-identical RAG.
- **Produce data.** `src/study/` adds the `/study` flow (consent → tasks →
  questionnaires) and records events to Supabase.

Credential resolution lives in `src/services/transport.js`: a personal key in
localStorage wins; otherwise a study access code routes to `/api/*`; otherwise
mock mode. **Study sessions can never fall into mock mode** — canned replies
would silently turn a session into a test of the prototype.

Set the server-side variables from `apps/api/.env.example` in the Vercel project
(never with a `VITE_` prefix — that would inline them into the browser bundle) and
run `scripts/migrations/2026-08-18_study_tables.sql`.

One constraint the study inherits, recorded in `docs/study/protocol.md` §10:
text-to-speech uses the **REST cascade**, since the ElevenLabs WebSocket path
needs the key in the browser. Arm A uses the deployed **Unity** avatar like every
other visitor; the study records per session which renderer actually resolved,
because the app degrades to Three.js on its own if the build fails to load.

## Architecture notes

- `apps/mobile/src/lib/rag`, `apps/mobile/src/lib/lipsync`, `apps/mobile/src/lib/tts`, sentence tracking and
  speculative retrieval are imported **verbatim from the mobile app** via the
  `@` alias (see `vite.config.js` — a tiny transform converts the five
  deliberately-CJS config modules to ESM).
- The Three.js avatar renderer is **generated** from the mobile WebView
  template: `node scripts/extract-renderer.mjs` re-derives
  `apps/web/src/avatar/three/renderer.js` from `AvatarVRM.js`. Edit the mobile source,
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

## Deploy

This app and `apps/api` are two **Vercel Services** declared in the repo-root
`vercel.json`; they build separately and deploy together on one domain, with
`/api/*` routed to the backend and everything else here. Public routing, headers
and the CSP live in that root file — under services they own traffic for the whole
deployment, so they cannot sit in a per-service config.

Deploy from the **repo root**, not from this directory:

```bash
export VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=…
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

`vercel dev` from the root runs both services together locally.

> **Not yet verified on a real deploy.** The previous prebuilt-from-`apps/web`
> flow existed because the bundle imports `packages/core` and `assets/` from
> outside the app directory. Confirm the service build resolves those workspace
> paths on the first deploy — that is the one thing about this layout most likely
> to need adjusting.
