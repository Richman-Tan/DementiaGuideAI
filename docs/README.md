# Documentation index

Start here. Everything below is grouped by what you are trying to do.

## Architecture

| Doc | What it covers |
|---|---|
| [architecture/backend-plan.md](architecture/backend-plan.md) | The planned backend + DB, why it exists (credentials, not tidiness), and what moves server-side. **Not built** — a target, not a description. |

See also [`packages/core/README.md`](../packages/core/README.md) for the rule
governing what may live in the shared core.

## RAG pipeline

The retrieval-augmented chat: how it is built, measured, and sourced.

| Doc | What it covers |
|---|---|
| [rag/rag-target-architecture.md](rag/rag-target-architecture.md) | The intended design — start here |
| [rag/rag-current-state-audit.md](rag/rag-current-state-audit.md) | Audit of what was actually implemented |
| [rag/rag-industry-research.md](rag/rag-industry-research.md) | Background research behind the design choices |
| [rag/rag-evaluation-plan.md](rag/rag-evaluation-plan.md) | Metric definitions, method, known limitations |
| [rag/rag-improvement-results.md](rag/rag-improvement-results.md) | Measured before/after results |
| [rag/rag-source-inventory.md](rag/rag-source-inventory.md) | Every knowledge-base source and its review verdict |

Config lives in `packages/core/rag/`; tooling in `scripts/eval/` and
`scripts/ingest/`.

## Subsystems

| Doc | What it covers |
|---|---|
| [voice-latency-streaming.md](voice-latency-streaming.md) | Streaming STT/TTS, viseme scheduling, and the latency budget |
| [android-unity.md](android-unity.md) | Embedding the Unity avatar on Android (UaaL) |

## Deliverables and prep

These are point-in-time academic artefacts, not living reference docs.

| Folder | Contents |
|---|---|
| `report/` | Mid-year report: drafts, `figures/`, `baseline/`, `eval/` data. **Paths here are stable on purpose** — they may be cited in submitted work, so do not reorganise. |
| `seminar/` | Conference-day deck prompt, research notes, speaker script |
| `web/` | The design prompt used to generate the web front-end |

## Conventions

- Living technical docs go in a topic folder (`rag/`, `architecture/`) or at
  this level if they are standalone.
- Anything submitted or presented goes under `report/` or `seminar/` and is then
  left alone.
- Update this index when adding a folder.
