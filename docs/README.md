# Documentation index

Start here. Everything below is grouped by what you are trying to do.

## The surfaces

| Doc | What it covers |
|---|---|
| [mobile-app.md](mobile-app.md) | Expo/React Native app: tech stack, screens, structure, path aliases, native builds, API keys |
| [`apps/web/README.md`](../apps/web/README.md) | The Vite web app: mock vs real mode, architecture, deploy |
| [`apps/api/README.md`](../apps/api/README.md) | The backend service: holds the provider credentials, owns study and conversation data |
| [`packages/core/README.md`](../packages/core/README.md) | The shared core — what may live in `@core` and why the boundary exists |

`apps/web` and `apps/api` deploy as **two separate Vercel projects**, each with its
own `vercel.json`. The browser reaches the API cross-origin, so the backend sets
CORS headers against an allowlist and the web CSP names the API origin; mobile is
unaffected. `apps/api/README.md` records why Vercel Services was not used. See
[architecture/backend-plan.md](architecture/backend-plan.md).

## Architecture

| Doc | What it covers |
|---|---|
| [architecture/backend-plan.md](architecture/backend-plan.md) | The backend + DB as planned before `apps/api/` was built: why it exists (credentials, not tidiness) and what moves server-side. Kept as the plan; [`apps/api/README.md`](../apps/api/README.md) describes what was built. |
| [design-system.md](design-system.md) | Colour tokens and the accessibility requirements |

## RAG pipeline

The retrieval-augmented chat: how it is built, measured, and sourced.
**Start at [rag/README.md](rag/README.md)** — config, ingestion and evaluation,
plus an index of the six research documents behind it.

Config lives in `packages/core/rag/`; tooling in `scripts/eval/` and
`scripts/ingest/`.

## Evaluation

| Doc | What it covers |
|---|---|
| [eval/evaluation-plan.md](eval/evaluation-plan.md) | The final-project evaluation design: claims, experiments (prompt/RAG ablation, safety, latency, lip-sync, user study), statistics, priorities |
| [eval/README.md](eval/README.md) | How to run the harness: `scripts/eval/`, `scripts/lipsync/`, outputs under `docs/report/eval/` |
| [eval/results-2026-09-13.md](eval/results-2026-09-13.md) | Results at snapshot 8a92ecd: retrieval, the prompt/RAG matrix, held-out safety, latency, lip-sync — and what is still pending |
| [eval/results-e9-stt-2026-09-18.md](eval/results-e9-stt-2026-09-18.md) | E9: word-error rate of the transcription path on ADReSS-2020 dementia speech, four recognisers, downstream effect |
| [eval/functional-verification.md](eval/functional-verification.md) | E10: requirements-to-evidence matrix, test levels, coverage, unverified requirements |
| [eval/scalability.md](eval/scalability.md) | E11: per-turn call trace, capacity per dependency, the binding constraint, measured load |
| [eval/plan-19a-safety.md](eval/plan-19a-safety.md) … [plan-19k-lead-passage.md](eval/plan-19k-lead-passage.md) | The October follow-ups (§19A–§19K), each plan written before its run; results in `eval/results-2026-10-*.md` |
| [eval/errata-2026-09-30.md](eval/errata-2026-09-30.md) | Corrections to numbers in the results documents, which were left as written |
| [Root README, section 2](../README.md#2-where-each-result-comes-from) | **Where each result in the final reports comes from**: plan, result document, data and scripts for every evaluation |

## Subsystems

| Doc | What it covers |
|---|---|
| [avatar.md](avatar.md) | Both avatar renderers, the voice conversation pipeline, lip sync |
| [voice-latency-streaming.md](voice-latency-streaming.md) | Streaming STT/TTS, viseme scheduling, and the latency budget |
| [android-unity.md](android-unity.md) | Embedding the Unity avatar on Android (UaaL) |

## Deliverables and prep

These are point-in-time academic artefacts, not living reference docs.

| Folder | Contents |
|---|---|
| [`study/`](study/README.md) | **The human usability study**: protocol, task sets and rubric, instruments, analysis plan, pilot gate, and the full UAHPEC ethics pack. Start at [study/README.md](study/README.md). The last sessions were on 12 October 2026. The study data are git-ignored and not in the repository (root README, section 6); [study/data-state.md](study/data-state.md) is a database snapshot of 21 September, superseded. |
| `report/` | Mid-year report and drafts, `baseline/`, and the evaluation outputs in `eval/`; `figures/final/` holds the final report's figures and `lit-review/` the October literature-search record. The final reports themselves are not stored. **Paths here are stable on purpose** — they are cited in submitted work, so do not reorganise. |
| [`meetings/`](meetings/README.md) | Notes of the weekly supervisor meetings (May to October 2026) and the material prepared for the 15 July meeting, exported from the project's shared Google Drive |
| `seminar/` | Conference-day deck prompt, research notes, speaker script |
| `web/` | The design prompt used to generate the web front-end (this is `docs/web/`, not the app) |

## Conventions

- Living technical docs go in a topic folder (`rag/`, `architecture/`) or at
  this level if they are standalone.
- Anything submitted or presented goes under `report/` or `seminar/` and is then
  left alone. `study/` was the exception while the study ran; its results stay
  git-ignored.
- Update this index when adding a folder.
