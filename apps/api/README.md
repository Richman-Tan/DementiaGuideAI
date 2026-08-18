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

`apps/web` and `apps/api` are two [Vercel Services](https://vercel.com/docs/services)
declared in the **root `vercel.json`**, built separately and deployed together on
one domain:

```
/api/*  → the api service
/*      → the web service
```

One domain means the browser calls `/api/*` same-origin — no CORS, no second
origin in the CSP. Mobile calls the same public paths. Because every request
enters through one route table, the firewall, rate limiting and deployment
protection are configured once, at the top level, rather than per service.

## Layout

| Path | Role |
|---|---|
| `chat.js`, `embed.js`, `speech.js`, `transcribe.js`, `eleven-tts.js` | Credentialed proxies. Explicit per-endpoint allowlists, not a catch-all passthrough: a leaked access code must not reach an arbitrary model. |
| `study/` | Session lifecycle and event capture for the usability study (`docs/study/`) |
| `_lib/guard.js` | Access-code auth, per-code metering, raw-body reading |
| `_lib/supabaseAdmin.js` | PostgREST over `fetch` — **not** supabase-js, which throws on Node 20 for want of a native WebSocket (same reason `scripts/eval/lib.mjs` avoids it) |

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
