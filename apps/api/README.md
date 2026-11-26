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

Deploy from this directory with the same prebuilt flow the web app uses, after
bundling the server's TypeScript:

```bash
npm run bundle -- --check   # src/ and packages/core → dist/, then loads each endpoint from it
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

The bundle step comes first because `api/turn.js` only re-exports
`dist/turn.mjs`. Skip it and `vercel build` fails on the missing file, or, worse,
packages a stale one. The script is called `bundle`, not `build`, on purpose:
Vercel reads a `build` script as "this project is a site with an output
directory" and this project is functions only.

`engines.node` in `package.json` is a floor (`>=22.18.0`), not a pin, so the
Node.js version in the Vercel project's settings decides what production runs.

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
| `api/turn.js` | The assistant: one turn in, a stream of events out. A shim over the bundle of `src/`; see [The turn endpoint](#the-turn-endpoint) |
| `api/speak.js` | A piece of the reply as speech, for a visitor's session. Also a shim; see [The speech endpoint](#the-speech-endpoint) |
| `src/` | The server's own code, in TypeScript: the turn handler (`turn.ts`), request validation (`turnRequest.ts`), session verification (`session.ts`), the daily cap (`admission.ts`), the event stream (`sse.ts`), and where the real services are put together (`providers.ts`, `compose.ts`). `src/entry/*.ts` are the bundle's entry points, one per endpoint |
| `build.mjs` | Bundles `src/entry/*.ts`, with the pipeline from `packages/core`, into `dist/` |
| `api/chat.js`, `api/embed.js`, `api/speech.js`, `api/transcribe.js`, `api/eleven-tts.js` | Credentialed proxies. Explicit per-endpoint allowlists, not a catch-all passthrough: a leaked access code must not reach an arbitrary model. |
| `api/admin/ingest.js` | Knowledge-base intake for `apps/admin` (see that app's README) — chunks/tags/titles/embeds a submission via `scripts/ingest/pipeline.js` and writes it `review_status='pending'` |
| `api/_lib/guard.js` | CORS, access-code auth, per-code metering, raw-body reading |
| `api/_lib/adminGuard.js` | Auth for the admin intake endpoint — a verified Supabase Auth session checked against `ADMIN_ALLOWED_EMAILS`, not a shared secret like the access codes |
| `api/_lib/supabaseAdmin.js` | PostgREST over `fetch` — **not** supabase-js, which throws on Node 20 for want of a native WebSocket (same reason `scripts/eval/lib.mjs` avoids it) |

Shared logic comes from `@dementiaguide/core`, declared as a real workspace
dependency so the bundler includes it, so anything this service and a client must
agree on lives in one place.

## The turn endpoint

`POST /api/turn` runs the answering pipeline (`packages/core/rag/pipeline`) on the
server's own keys and streams what happens as server-sent events. The apps hold
no model key and build no prompt. The evaluation harness (`npm run eval:pipeline`)
calls the same pipeline function in-process, so what is measured is what this
endpoint serves.

**It is off until it is switched on.** It answers 503 unless `TURN_ENDPOINT=on`
and the four settings it needs are present (`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). It also needs the knowledge base
re-embedded for Voyage (`scripts/migrations/2026-11-25_embedding_v2_voyage.sql`,
then `npm run kb:reembed`), because it searches with `match_chunks_v2`.

Request, as JSON, with the visitor's Supabase session token as
`Authorization: Bearer …` (the web app signs every visitor in anonymously):

```json
{
  "message": "What about at night?",
  "history": [{ "role": "user", "content": "How do I manage sundowning?" }],
  "modality": "text",
  "avatar": "ariana",
  "settings": { "responseStyle": "balanced", "jargonMode": "explain", "personality": "warm" }
}
```

Only `message` is required. Every field is checked against a fixed set of values
or a size limit (`src/turnRequest.ts`); the assistant's name comes from `avatar`,
so no text a caller sends reaches the instructions.

Response: `text/event-stream`, one frame per event, the event as JSON
(`TurnEvent` in `packages/core/rag/pipeline/types.ts`):

| Event | Carries |
|---|---|
| `meta` | Pipeline version, prompt version, model, modality |
| `retrieval` | The query searched for and the passages found |
| `safety` | Whether the message describes an emergency, and who judged it (a model, or the keyword fallback). Arrives when the verdict is ready, wherever the answer has got to |
| `token` | A piece of the answer, marked `lead` (worth saying aloud) or `detail` |
| `final` | The whole answer with citations numbered `[1]…[n]`, the lead on its own, and the sources cited |
| `usage`, `timings` | Tokens billed; milliseconds to each stage |
| `done` | Why it ended: `end_turn`, `max_tokens`, `refusal` or `aborted` |
| `error` | The answer failed. The provider's own wording goes to the log, not to the caller |

Closing the connection stops the model call. That is how an interruption (the
person starts talking over the avatar) stops costing money.

### What a day can cost

Each turn is counted, before any model call, against two limits per UTC day:
`TURN_VISITOR_DAILY_LIMIT` (default 20) for that visitor and
`TURN_GLOBAL_DAILY_LIMIT` (default 100) for everyone together. Over the first the
answer is 429 with `code: "visitor_limit"`; over the second, `code: "demo_limit"`.
If the counter cannot be reached, the turn is refused (503).

Anyone can start a fresh anonymous session, so the per-visitor limit is a
courtesy and the global one is the cap: a day costs at most the global limit
times the most one turn can cost. On Opus 5.5 at the default limit that is
roughly US$4 a day if turns are typical and under US$40 if every turn ran to its
maximum length. Both figures are estimates from list prices and assumed token
counts, not measurements. Set a hard spend limit on the Anthropic account as
well; it is the backstop that does not depend on this code.

#### A budget in dollars

Set `DAILY_BUDGET_USD` (say `5`) and a day is also capped as an amount of money
(`src/budget.ts`; table and functions in
`scripts/migrations/2026-11-27_daily_spend.sql`, which must be run first):

1. Before a turn calls the model, the most it could cost is set aside from
   today's budget: everything it can send priced as input, the answer running
   to its full length, and the two helper calls. On Opus 5.5 that is about 36
   cents for a written answer and 20 for a spoken one.
2. If today's spending plus everything set aside would pass the budget, the
   turn is refused (429, `code: "demo_limit"`) before it has cost anything.
3. When the turn ends, what it cost takes the reservation's place:

| The turn | Is charged |
|---|---|
| Answered | Its tokens at list prices, plus the helper calls |
| Was interrupted while the model was writing | The whole reservation: its usage never arrives |
| Ended before the model was asked, or the model call failed | The helper calls only |

Because a reservation is the ceiling and a typical turn costs about a tenth of
it, the last turns of a day are refused while a little of the budget is still
unspent. That is the direction a cap should err in.

If the budget cannot be reached, or the model has no list price to budget
with, the turn is refused (503). A turn that never settles (the function was
killed mid-answer) keeps its reservation until the day ends.

It covers the model calls, which are billed by use. Speech is billed against a
plan's monthly allowance, which is a ceiling already, and stays on its request
counters. The amounts are estimates from list prices, not the provider's bill;
the hard limit on the provider account is still the backstop.

Known gap: an interrupted turn's tokens are not written to `usage_events`.

### What is recorded about a turn

When a turn ends, the server writes one row to `turn_traces` (`src/trace.ts`;
table in `scripts/migrations/2026-11-27_turn_traces.sql`). It is a record of
what the system did:

| Kept | For |
|---|---|
| Pipeline version, prompt version, model, text or voice | Tying a number to the code that produced it |
| How it ended: `end_turn`, `max_tokens`, `refusal`, `aborted`, or `error` and which | Failure and interruption rates |
| The ids and similarity scores of the passages found, and the ids of those cited | How often the search comes back empty; which passages earn their place |
| The safety verdict, and whether the model or the keyword fallback gave it | How often it fires |
| Tokens of each kind | Cost, worked out from list prices when displayed |
| Milliseconds: the search, then to the first word, the last word and the end | How long people wait |
| The length of the question and of the answer, and how many earlier turns came with it | Sizes, without the text |

**It does not hold what was said, or who said it.** There is no question, no
answer and no account id, and the time is kept to the hour so a trace cannot be
matched to a `usage_events` row by its timestamp. Tests hold the table to
exactly the columns the server sends, and to having no column that could carry
a person's words.

`turn_traces_daily` sums it by day: turns, failures, interruptions, searches
that found nothing, emergencies, the median and 95th-percentile wait for the
first word, and tokens.

A turn that failed or was interrupted is traced too. A refused request (not
signed in, over a limit) is not a turn and leaves nothing. If the row cannot be
written, the answer is unaffected and the first failure is logged; until the
migration has been run that is one warning per server instance. `TURN_TRACES=off`
keeps none.

### Reading it back

`GET /api/admin-usage?days=14` (1 to 90 days) returns the daily summary for
the admin tool's Usage tab: one line for each day, kind of turn, model and
pipeline version, with a cost worked out from the list prices, the totals, and
today against `DAILY_BUDGET_USD` if one is set (`src/usageReport.ts`,
`src/adminUsage.ts`). Admins only: the same Supabase sign-in and
`ADMIN_ALLOWED_EMAILS` list as the intake endpoint. If a model has no list
price its line has no cost, and then neither does the total, rather than a
total that quietly leaves it out.

## The speech endpoint

`POST /api/speak` turns a sentence or two of the reply into audio, with the
timing of each character that moves the avatar's mouth. It is what lets the
avatar speak for a visitor who has no key: the ElevenLabs key stays on the
server.

It follows the turn endpoint's rules. It answers 503 unless `SPEAK_ENDPOINT=on`
and `ELEVENLABS_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set;
it needs the visitor's session token; and each request passes the daily cap
first, counted separately from turns (`SPEAK_VISITOR_DAILY_LIMIT`, default 60,
and `SPEAK_GLOBAL_DAILY_LIMIT`, default 300: three requests for each turn).

Request: `{ "text": "…", "voiceId": "…", "speechRate": 0.78 }`. The text is at
most 600 characters and the voice must be one of the two roster voices, so the
endpoint cannot be used as a general text-to-speech service. The reply is
ElevenLabs' JSON unchanged (`audio_base64`, `alignment`). A failure upstream is
logged here and reported to the caller without the provider's wording.

ElevenLabs bills by character against a monthly allowance, and this cap counts
requests: at the defaults a day is at most 300 × 600 characters, and far less in
practice. Size the global limit to the plan.

## Local development

`vercel dev` from the repo root runs both services exactly as production does,
and is the faithful setup. For convenience `npm run web` also mounts these
handlers as Vite middleware (`apps/web/vite.config.js`) so the web app is
self-sufficient without the Vercel CLI — but that middleware re-implements the
platform, so treat `vercel dev` as authoritative when they disagree.

Copy `.env.example` to `.env`. **Nothing here may be prefixed `VITE_`**: that
would inline it into the browser bundle and defeat the point of the service.
