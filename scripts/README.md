# scripts/

Repo-level tooling. These live at the workspace root, not inside an app, because
they are surface-agnostic: they talk to Supabase and OpenAI directly and import
`packages/core` in plain Node — no Metro, no Vite, no aliases.

That last point is deliberate. `scripts/eval/lib.mjs` and `scripts/ingest/ingest.mjs`
`require('../../packages/core/rag/…')` with no build step, which is the standing
proof that the RAG core is portable enough to move server-side later. If you ever
have to add a bundler to run these, the boundary has been broken.

Run everything from the repo root via the npm scripts — they are root-relative.

| Group | What it is |
|---|---|
| `migrations/` | SQL applied by hand in the Supabase SQL editor. **Start here on a fresh database** — see [migrations/README.md](migrations/README.md) for run order and status. |
| `ingest/` | Fetches, chunks, embeds and upserts source documents into `knowledge_chunks`. |
| `eval/` | The RAG evaluation suite: retrieval metrics, generation runs, safety checks, groundedness grading, parameter sweeps. |
| `brand/` | Rasterises every app icon, favicon and splash image from the mark geometry in `packages/core/brand/mark.js`. Dependency-free — signed distance fields plus `zlib`, so no `sharp` and no headless browser. Its test rebuilds each asset and diffs it against what is committed. |
| loose files | Report tooling — `make-figures.py`, `report-to-docx.py`, `parse-latency.mjs`. Kept at this level because `docs/report/` cites these paths and that directory is frozen. |

## Commands

| Command | What it does |
|---|---|
| `npm run brand:icons` | Regenerate every brand asset from `packages/core/brand/mark.js` |
| `npm run kb:ingest` | Ingest sources into Supabase |
| `npm run kb:ingest:dry` | Plan the ingest without writing |
| `npm run rag:eval:retrieval` | Retrieval metrics over the labelled question set |
| `npm run rag:eval:generation` | Generation run (answers + token use) |
| `npm run rag:eval:safety` | Safety checks |
| `npm run rag:eval:sweep` | Parameter sweep |
| `npm run rag:grade` | Groundedness grading |
| `npm run rag:introspect` | Inspect what retrieval returns for a query |

Full methodology and results: [docs/rag/](../docs/rag/README.md).

## Setup order on a new database

1. Run `migrations/000_supabase-setup.sql` in the Supabase SQL editor.
2. Apply anything still pending from `migrations/` (that README tracks status).
3. Seed the corpus: `npm run kb:ingest -- --doc curated`.
