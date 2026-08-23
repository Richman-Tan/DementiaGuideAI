# @core — shared, platform-agnostic logic

Code in here runs unchanged on **every** surface: the Expo mobile app, the Vite
web app, and headless Node (the eval and ingestion scripts under `scripts/`).

Import it as `@core/…` — an alias declared in five config files plus one
convention, all of which must stay in step:

| Consumer | Where the alias lives |
|---|---|
| Mobile (Metro) | `apps/mobile/babel.config.js` → `module-resolver` |
| Mobile types | `apps/mobile/tsconfig.json` → `paths` |
| Mobile tests | `apps/mobile/jest.config.js` → `moduleNameMapper` |
| Web (dev + build) | `apps/web/vite.config.js` → `resolve.alias` |
| Web types + lint | `apps/web/tsconfig.json` → `paths` |
| Node scripts | plain relative `require('../../packages/core/…')` |
| Backend (`apps/api`) | `@dementiaguide/core/…` — a real workspace dependency, so the bundler includes it |

**Inside this directory, imports are relative** (`./voiceConfig`,
`../voice/voiceConfig`) — never `@core/…`. That is what lets `scripts/eval/*` and
`scripts/ingest/ingest.mjs` pull core in with a bare `require()` and no alias
configured at all.

For the same reason `package.json` here deliberately has **no `"type": "module"`**.
The `rag/` and `brand/` files are CommonJS on purpose so plain Node can
`require()` them; declaring the package ESM would break `scripts/eval`,
`scripts/ingest` and `scripts/brand`. Note that the web build converts these
files with an **explicit allowlist** — `CJS_LIBS` in `apps/web/vite.config.js` —
so a new CommonJS module here has to be added there as well, or Vite ships raw
`module.exports` to the browser. `apps/web/tests/interop.test.js` is the canary. The
`voice/`, `tts/`, `lipsync/` and `avatar/` files use ESM syntax and are only ever
consumed by a bundler (Metro or Vite), which resolves them regardless.

`study/studyConfig.mjs` is the exception that needs an explicit extension: it is
imported by `apps/api` in **plain Node**, where a `.js` file containing `export`
fails to parse in a package without `"type": "module"`. Anything else the backend
and a client must agree on belongs here on the same terms — the study's arm
assignment lives here precisely so what a participant is shown and what is written
to the database cannot drift apart.

## The rule for what belongs here

**No platform imports and no outward dependencies.** Nothing in `@core` may
import from `apps/mobile/src/` or `apps/web/src/`. Dependencies point inward only.
If a module needs React Native, the DOM, browser audio, or microphone timing, it
is *not* core.

That rule is what makes this directory portable. It is also why the boundary is
drawn where it is:

| In core | Why |
|---|---|
| `rag/` — `ragConfig`, `prompt`, `retrieval`, `citations` | Zero dependencies. Already imported by `scripts/eval/*` and `scripts/ingest/ingest.mjs` in plain Node. |
| `net/withTimeout` | Generic fetch/abort helper, used by both apps |
| `sentiment/detectSentiment` | Pure text analysis, used by both apps |
| `voice/` — `voiceConfig`, `speculativeRetrieval`, `sentenceTracker` | Timing constants and two pure state machines. No timer, socket or mic is owned here — callers drive them. |
| `tts/` — `normalizeSpokenText`, `elevenLabsStreamService` | Text normalisation is pure; the stream service speaks the ElevenLabs WebSocket protocol using only `WebSocket`, which both runtimes provide. Audio *playback* stays platform-side. |
| `lipsync/` — `createVisemeTimeline`, `streamingVisemeAccumulator`, `phonemeMap`, `g2p/` | Alignment → viseme timeline is arithmetic over text and timings. It produces a timeline; it never renders one. |
| `avatar/blendshapeTranslator` | Maps viseme segments to CC4 blendshape payloads — a data transform, shared verbatim by the mobile and web Unity bridges. |
| `brand/mark.js` | The logo's geometry and colours as plain numbers. Three things draw the mark — an SVG component on web, two `View`s on mobile, and the icon rasteriser in `scripts/brand/` — so the shape lives here and each one renders it. The *components* stay in their apps; only the spec is shared. |

The `voice`/`tts`/`lipsync`/`avatar` folders arrived when the web app was found to
be importing nine modules straight out of the mobile tree. The boundary was originally drawn
per *folder*, which left partly-shared folders behind; it is now drawn per *file*.

| Deliberately NOT in core | Why |
|---|---|
| `apps/mobile/src/lib/voice/prewarm.js` | Warms Expo AV and the native recognizer — platform handles |
| `apps/mobile/src/lib/tts/{ttsService,ttsMode,azureTtsService,elevenLabsService}` | Own playback, `expo-av` and provider credentials |
| `apps/mobile/src/lib/lipsync/azureVisemeMap.js` | Azure Speech SDK viseme IDs — used only by the mobile Azure path |
| `apps/mobile/src/lib/stt/`, `apps/mobile/src/lib/audio/` | Platform APIs |
| `apps/mobile/src/lib/supabaseService.ts`, `openaiService.js` | Carry platform config and credentials |

## Why this exists: the backend

`rag/` is the code that moves **server-side** when the backend lands. It already
runs in Node today, so that move should be a relocation rather than an
untangling. See `docs/architecture/backend-plan.md` for the target.

Keeping the rule above intact is what preserves that option — the moment
something in here imports from an app, the RAG core stops being portable.
