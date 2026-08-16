# Documentation index

Start here. Everything below is grouped by what you are trying to do.

## The three surfaces

| Doc                                                     | What it covers                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [mobile-app.md](mobile-app.md)                          | Expo/React Native app: tech stack, screens, structure, path aliases, native builds, API keys |
| [`apps/web/README.md`](../apps/web/README.md)           | The Vite web app: mock vs real mode, architecture, Vercel deploy                             |
| [`packages/core/README.md`](../packages/core/README.md) | The shared core — what may live in `@core` and why the boundary exists                       |

## Architecture

| Doc                                                          | What it covers                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture/backend-plan.md](architecture/backend-plan.md) | The planned backend + DB, why it exists (credentials, not tidiness), and what moves server-side. **Not built** — a target, not a description. |
| [design-system.md](design-system.md)                         | Colour tokens and the accessibility requirements                                                                                              |

## RAG pipeline

The retrieval-augmented chat: how it is built, measured, and sourced.
**Start at [rag/README.md](rag/README.md)** — config, ingestion and evaluation,
plus an index of the six research documents behind it.

Config lives in `packages/core/rag/`; tooling in `scripts/eval/` and
`scripts/ingest/`.

## Subsystems

| Doc                                                      | What it covers                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| [avatar.md](avatar.md)                                   | Both avatar renderers, the voice conversation pipeline, lip sync |
| [voice-latency-streaming.md](voice-latency-streaming.md) | Streaming STT/TTS, viseme scheduling, and the latency budget     |
| [android-unity.md](android-unity.md)                     | Embedding the Unity avatar on Android (UaaL)                     |

## Deliverables and prep

These are point-in-time academic artefacts, not living reference docs.

| Folder     | Contents                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report/`  | Mid-year report: drafts, `figures/`, `baseline/`, `eval/` data. **Paths here are stable on purpose** — they may be cited in submitted work, so do not reorganise. |
| `seminar/` | Conference-day deck prompt, research notes, speaker script                                                                                                        |
| `web/`     | The design prompt used to generate the web front-end (this is `docs/web/`, not the app)                                                                           |

## Conventions

- Living technical docs go in a topic folder (`rag/`, `architecture/`) or at
  this level if they are standalone.
- Anything submitted or presented goes under `report/` or `seminar/` and is then
  left alone.
- Update this index when adding a folder.
