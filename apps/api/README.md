# @dementiaguide/api — backend service

Holds the third-party credentials and owns the data the clients must not.

Both clients used to call OpenAI and ElevenLabs directly with a key the user
supplied themselves (`docs/architecture/backend-plan.md`, issue #48). That made
the product unusable for its actual audience — a caregiver is not going to obtain
a paid API key — and left no place for metering, rate limiting, or any data that
outlives one browser.

## Why it is its own app, not `apps/web/api/`

It started inside the web app, which is Vercel's zero-config convention for a
frontend's own API routes. That is the wrong shape here for three reasons:

1. **Mobile needs it too.** As a subdirectory of the web app, the Expo client's
   backend would be a folder inside a Vite project.
2. **This repo's own convention is that `apps/*` are deployable and `packages/*`
   are libraries.** The backend is deployable, so it is an app.
3. **Server-only code sat inside a bundler's project root**, one misconfiguration
   away from shipping to the browser.

## How it deploys

`apps/web` and `apps/api` are **two separate Vercel projects** (`dementiaguide-web`
and `dementiaguide-api`), each with its own root directory. Only `apps/web` has a
`vercel.json`, for the SPA rewrite and the CSP; this project needs no routing file
because Vercel's zero-config convention already maps `api/*.js` to functions, and
its CORS headers are set in code (`_lib/guard.js`), not in configuration.

Deploy from this directory with the same prebuilt flow the web app uses:

```bash
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

A plain `vercel deploy` fails: the CLI uploads only this directory, so the cloud
builder's `npm install` tries to fetch `@dementiaguide/core` from the npm
registry — where it does not exist — and dies with `Command "npm install" exited
with 1`. Built locally, npm walks up to the monorepo root and resolves the
workspace dependency, which is the same property the Layout section relies on
for bundling.

An earlier attempt declared them as two [Vercel Services](https://vercel.com/docs/services)
in a root `vercel.json`, which would have kept them on one domain and same-origin.
That does not work for this backend, and the failure is silent: a service is a
single server identified by an `entrypoint`, so a directory of per-route handlers
has no entrypoint to detect. Vercel fell back to treating `apps/api` as a *static
site* and published the handlers — `_lib/guard.js` and `_lib/supabaseAdmin.js`
included — as static files, with zero functions and no build error. Services is
also still in Beta. Verified with `vercel build`; see the run in `docs/`.

Two projects means the browser reaches this API cross-origin, so it sets CORS
headers itself (`_lib/guard.js`) against the `ALLOWED_ORIGINS` allowlist. Mobile
is unaffected — a native app has no origin to preserve.

## Layout

Handlers live under `api/` because that is the directory Vercel serves functions
from; the service root is left for `package.json` and this file. `_lib/` is
excluded from routing by its underscore, so it is importable but never
addressable.

| Path | Role |
|---|---|
| `api/chat.js`, `api/embed.js`, `api/speech.js`, `api/transcribe.js`, `api/eleven-tts.js` | Credentialed proxies. Explicit per-endpoint allowlists, not a catch-all passthrough: a leaked access code must not reach an arbitrary model. |
| `api/study/` | Session lifecycle and event capture for the usability study (`docs/study/`) |
| `api/_lib/guard.js` | CORS, access-code auth, per-code metering, raw-body reading |
| `api/_lib/supabaseAdmin.js` | PostgREST over `fetch` — **not** supabase-js, which throws on Node 20 for want of a native WebSocket (same reason `scripts/eval/lib.mjs` avoids it) |

Shared logic comes from `@dementiaguide/core`, declared as a real workspace
dependency so the bundler includes it. `study/studyConfig.mjs` in particular is
imported by both this service and the web client, so the arm a participant is
shown and the arm written to the database cannot drift apart.

## Local development

`vercel dev` from the repo root runs both services exactly as production does,
and is the faithful setup. For convenience `npm run web` also mounts these
handlers as Vite middleware (`apps/web/vite.config.js`) so the web app is
self-sufficient without the Vercel CLI — but that middleware re-implements the
platform, so treat `vercel dev` as authoritative when they disagree.

Copy `.env.example` to `.env`. **Nothing here may be prefixed `VITE_`**: that
would inline it into the browser bundle and defeat the point of the service.
