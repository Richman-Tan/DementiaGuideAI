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

## Guest access codes

A visitor without a key of their own can enter an **access code** in Settings.
The backend service (`apps/api`, its own app — see its README for why it is not a
folder in here) holds the OpenAI and ElevenLabs credentials and admits callers by
access code (`x-study-code` header, `STUDY_ACCESS_CODES` on the server). Retrieval,
prompt assembly and citation extraction stay in the client, so both credential
modes run byte-identical RAG.

Credential resolution lives in `src/services/transport.js`: a personal key in
localStorage wins; otherwise a guest access code routes to `/api/*`; otherwise
mock mode.

Set the server-side variables from `apps/api/.env.example` in the Vercel project
(never with a `VITE_` prefix — that would inline them into the browser bundle).

One constraint of the proxy path: text-to-speech uses the **REST cascade**, since
the ElevenLabs WebSocket path needs the key in the browser.

## Architecture notes

- The retrieval config and prompt, citation handling, lip-sync, text-to-speech
  helpers, sentence tracking and speculative retrieval are shared with the
  mobile app: they live in `packages/core` and are imported through the `@core`
  alias (see `vite.config.js`). Everything there is an ES module.
- Unity avatars (Aaron default / Ariana) are the only renderer — mobile
  parity. The WebGL build is a git-ignored artifact: export from the Unity
  project (Tools → UaaL → Export WebGL), then `npm run sync:unity` copies it
  into `public/unity/Build/` (see `public/unity/README.md`). The ~240 MB
  download starts only when an avatar view first mounts (Home or Voice with
  Show Avatar on), never on the landing page or other screens. Without a build,
  or if it fails to load, the same character keeps its name and voice: the
  stage shows the bust and speech plays through the headless audio engine.

## Styling

- **Design tokens** (colours, spacing, radii, type sizes, motion) are decided in
  `packages/core/design/tokens.ts`. `npm run tokens` writes them out twice:
  `src/styles/tokens.generated.css` (the CSS variables, per theme) and
  `src/styles/theme.generated.css` (the Tailwind theme that names them). Tests
  fail if either file is stale.
- **Components** live in `src/components/ui` and are styled with Tailwind
  classes. The theme is cleared of Tailwind's own palette, so a class can only
  name a colour or radius that is a token, and one class follows the light,
  dark and high-contrast themes. `Button` is the first.
- **Most screens still style themselves inline.** They are being moved to the
  component layer one at a time. Until the last has moved, Tailwind's reset is
  left out (`src/styles/tailwind.css` says why), and the `hv1`–`hv9` hover
  classes in `src/styles/app.css` stay for the controls not yet moved.

## Deploy

This app and `apps/api` are **two separate Vercel projects**. Routing, headers and
the CSP for the web deployment live in this directory's `vercel.json`; the backend
owns its own. See `apps/api/README.md` for why they are not Vercel Services.

Because the API is a different origin, set `VITE_API_BASE_URL` to its origin —
`apps/web/src/services/apiBase.js` is the only place that reads it — and add that
same origin to `connect-src` in `vercel.json`. Miss the CSP entry and every call
is blocked by the browser, which presents exactly like a backend outage. Leave
`VITE_API_BASE_URL` unset for local development: `npm run dev` mounts the
handlers as Vite middleware, so the paths stay relative and same-origin.

Deploy from this directory:

```bash
export VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… VITE_API_BASE_URL=…
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

`vercel dev` from the root runs both services together locally.

> **Not yet verified on a real deploy.** The previous prebuilt-from-`apps/web`
> flow existed because the bundle imports `packages/core` and `assets/` from
> outside the app directory. Confirm the service build resolves those workspace
> paths on the first deploy — that is the one thing about this layout most likely
> to need adjusting.
