# Backend plan

Status: **not built.** This records the intended target so the current structure
stays aligned with it. Nothing here is scheduled.

## Why a backend

Not for tidiness — for credentials. Today **both clients call third-party APIs
directly, holding the keys themselves**:

| Surface | Where the key lives                                                          | Calls directly                        |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| Web     | `localStorage` under `dg_keys` (`apps/web/src/state/keysStore.js`)           | `api.openai.com`, `api.elevenlabs.io` |
| Mobile  | on-device key entry (`apps/mobile/src/lib/openaiService.js` → `getApiKey()`) | `api.openai.com`, `api.elevenlabs.io` |

Consequences we live with right now:

- Every user must supply and pay for their own OpenAI key, which is why the web
  Voice screen is gated behind a setup card. It is the single biggest barrier to
  anyone simply trying the product.
- There is no usage metering, rate limiting, or abuse control.
- A key in `localStorage` is readable by any script that reaches the page.
- The ElevenLabs key is exposed for what is only ever a proxy call.

A backend exists to hold those credentials and to become the only thing the
clients talk to.

## What moves server-side

`packages/core/rag/` — `ragConfig`, `prompt`, `retrieval`, `citations` — is
already written to be portable: no platform imports, no outward dependencies,
and it already runs headless in Node via `scripts/eval/*` and
`scripts/ingest/ingest.mjs`. That is the unit that relocates. See
`packages/core/README.md` for the rule that keeps it that way.

Also server-side: the OpenAI chat/embedding calls, and the Supabase pgvector
queries currently implemented **twice** — `apps/mobile/src/lib/supabaseService.ts` and
`apps/web/src/services/supabase.js` are parallel implementations of the same thing.
One backend collapses that duplication.

## What stays on the client

Anything tied to a device or to perceived latency:

- Audio playback, microphone, STT (`apps/mobile/src/lib/stt/`, `apps/web/src/services/sttWeb.js`)
- Viseme/lip-sync scheduling (`apps/mobile/src/lib/lipsync/`) and the avatar renderers
- `packages/core/voice/speculativeRetrieval.js` — it fires off **live-STT partials**
  while the user is still speaking. It has to stay next to the microphone; it
  would call the backend's retrieve endpoint earlier rather than move.

## The seam that already exists

`apps/web/src/services/chatService.js` is a facade with a mock/real switch on
`isMockMode()`. A backend becomes a third implementation behind that same
facade, so the UI does not change. The mobile equivalent is
`apps/mobile/src/lib/openaiService.js`.

The migration is therefore: stand up the service, point the facade at it, delete
the client-side key entry, and drop the setup-card gate.

## The database

Supabase already provides Postgres + pgvector and holds the knowledge base, so
"add a DB" is mostly **moving ownership of existing queries** behind the API
rather than introducing new storage. A backend additionally makes room for
tables the clients cannot safely own: accounts, usage/quota, and audit or
telemetry beyond the local `apps/mobile/src/lib/ragTelemetry.js`.

The dormant `origin/feat/auth-usage-metering` branch is prior thinking on the
auth/metering half of this.

## Sequence, when it happens

1. Service skeleton; import `packages/core/rag` unchanged.
2. `POST /chat` (streaming) + `/retrieve`, keys server-side from env.
3. Point `chatService.js` at it behind the existing facade; keep mock mode.
4. Move mobile `openaiService.js` to the same endpoints.
5. Proxy ElevenLabs TTS.
6. Remove client key storage and the Voice setup gate.
7. Accounts + usage metering.

Steps 1–3 are independently useful: after step 3 the web app works with no user
key at all.
