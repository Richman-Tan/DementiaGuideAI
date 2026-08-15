# @core — shared, platform-agnostic logic

Code in here runs unchanged on **every** surface: the Expo mobile app, the Vite
web app, and headless Node (the eval and ingestion scripts under `scripts/`).

Import it as `@core/…` — an alias defined in five places, all of which must stay
in step:

| Consumer | Where the alias lives |
|---|---|
| Mobile (Metro) | `babel.config.js` → `module-resolver` |
| Types | `tsconfig.json` → `paths` |
| Mobile tests | `jest.config.js` → `moduleNameMapper` |
| Web (dev + build) | `web/vite.config.js` → `resolve.alias` |
| Node scripts | plain relative `require('../../packages/core/…')` |

## The rule for what belongs here

**No platform imports and no outward dependencies.** Nothing in `@core` may
import from `src/` (the mobile app) or `web/`. Dependencies point inward only.
If a module needs React Native, the DOM, browser audio, or microphone timing, it
is *not* core.

That rule is what makes this directory portable. It is also why the boundary is
drawn where it is:

| In core | Why |
|---|---|
| `rag/` — `ragConfig`, `prompt`, `retrieval`, `citations` | Zero dependencies. Already imported by `scripts/eval/*` and `scripts/ingest/ingest.mjs` in plain Node. |
| `net/withTimeout` | Generic fetch/abort helper, used by both apps |
| `sentiment/detectSentiment` | Pure text analysis, used by both apps |

| Deliberately NOT in core | Why |
|---|---|
| `src/lib/voice/speculativeRetrieval.js` | Schedules retrieval off **live-STT partials** and depends on voice timing config — client latency orchestration, not retrieval logic |
| `src/lib/tts/`, `src/lib/lipsync/` | Only partly shared, and browser/native audio bound. Splitting them would leave two folders of the same name in two trees. |
| `src/lib/stt/`, `src/lib/audio/` | Platform APIs |
| `src/lib/supabaseService.ts`, `openaiService.js` | Carry platform config and credentials |

## Why this exists: the backend

`rag/` is the code that moves **server-side** when the backend lands. It already
runs in Node today, so that move should be a relocation rather than an
untangling. See `docs/architecture/backend-plan.md` for the target.

Keeping the rule above intact is what preserves that option — the moment
something in here imports from `src/`, the RAG core stops being portable.
