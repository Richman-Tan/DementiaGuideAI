# 3 System Design and Implementation

<!-- TEMPLATE: Budget ≈1,300 words (≈2.2 pp + 1.1 pp for Figures 3.1–3.2). Counted. First "middle
section".

Rubric **C** (20 %) band A: "high-level proficiency in tools and hardware/software co-design
(where applicable)". Rubric **D**: "rigorous and efficient execution".

Purpose: give the marker just enough of the system to understand what Ch 5 measured. It is not a
build diary.
- Every component described here should be something a result in Ch 5 depends on.
- Each subsection ends by naming the RQ/evaluation that tests it.
- Implementation detail that no result depends on goes to the compendium
  (09-appendices-and-compendium.md).

Individual-report rule: describe the system as a whole, but where a component is the partner's
work, say so, consistent with the Statement of Contribution (00-front-matter.md). For example,
the knowledge-base migration to Supabase/pgvector and the ingestion scripts are JooHyun's
commits. If a figure was produced solely by JooHyun, its caption must cite JooHyun's report
(Handbook §7).

Staleness warnings for the source docs (from the repo inventory, 2026-09-29):
- `README.md` Mermaid shows Whisper as the primary STT (now the fallback).
- `docs/avatar.md` shows expo-av/Whisper as primary.
- `docs/rag/rag-target-architecture.md` uses old `src/lib/rag` paths (now `packages/core/rag`).
- `docs/architecture/backend-plan.md` says "not built" (`apps/api` exists).
Trust the code and `docs/eval/evaluation-plan.md` §2.1 (the traced pipeline) over those docs. -->

<!-- TEMPLATE: **Opening, ≈120 words: requirements and design drivers.** Examiner finding:
without drivers, the chapter describes but does not justify (rubric C "strong justification";
"tool proficiency and co-design").
- Drivers: grounded answers; NZ-correct safety; conversational latency; cost per turn; API-key
  security (the supervisor's 5 Aug requirement that LLM and knowledge-base processing run server-side, which also moved the provider keys off the device. It is recorded in the Nexus note `01 Projects/DementiaGuide AI.md`; cite the original email); one codebase across web, iOS and Android.
- Say that the 38 functional requirements verified in §5.5 derive from these drivers
  (`docs/eval/functional-verification.md` §Matrix).
**Every §3.x ends with one "chosen over X because Y" sentence.** Candidates:
- pgvector in Supabase over a dedicated vector DB;
- hybrid retrieval over dense-only (and note E1 found the keyword part made no difference);
- gpt-4o over gpt-4o-mini: give the **original** reason, from when the choice was made. E12's
  deterministic safety gates on mini are a later check, not the reason;
- ElevenLabs over OpenAI `tts-1`: ElevenLabs returns character timings, so the avatar gets a
  viseme timeline; `tts-1` gives none (`docs/report/eval/final/cost_ff2753e.md`). Production uses
  per-sentence REST `/with-timestamps`, **not** WebSocket streaming (next item);
- Unity-as-a-Library over Three.js (articulation fidelity; Three.js kept as the fallback);
- a server-side key proxy over client keys.
Rationale sources: `docs/rag/rag-industry-research.md`, `docs/rag/rag-current-state-audit.md`,
`docs/voice-latency-streaming.md`. -->

TODO(write)

## 3.1 Architecture overview

<!-- TEMPLATE: ≈200 words + **Figure 3.1** (architecture; figures-and-tables.md F1, *to be
drawn*) + **Figure 3.2** (the built app: an answer with inline citations beside the avatar;
figures-and-tables.md F0). Without F0 the marker never sees the product.
Cover:
- the clients: `apps/mobile` (Expo/React Native, iOS + Android with Unity-as-a-Library) and
  `apps/web` (Vite + React, deployed on Vercel, Unity WebGL avatar by default);
- the server: `apps/api` (the supervisor's 5 Aug requirement that LLM and knowledge-base processing run server-side, which also moved the provider keys off the device. It is recorded in the Nexus note `01 Projects/DementiaGuide AI.md`; cite the original email). Resolve the overlap with JooHyun's unmerged key-proxy branch
  (b8722c9) in the contribution split;
- the shared `packages/core` (rag, voice, tts, lipsync);
- the data layer: Supabase Postgres + pgvector;
- external providers: OpenAI, ElevenLabs.
Sources: the traced pipeline in `docs/eval/evaluation-plan.md` §2.1; `apps/api/README.md`;
`apps/web/README.md`; `docs/android-unity.md`.
Note why the monorepo matters (one core for both clients, so results transfer across platforms),
in one sentence. -->

TODO(write)

## 3.2 Knowledge corpus and retrieval

<!-- TEMPLATE: ≈250 words.
Cover:
- corpus composition (WHO iSupport plus curated NZ sources);
- chunking and ingestion;
- the chunk count **at the evaluated snapshot** (copy the figure and the sha from
  `docs/eval/results-2026-09-13.md` header, not from older docs);
- hybrid retrieval (dense + keyword);
- the per-source cap;
- citation assembly (`packages/core/rag/citations.js`).
Code: `packages/core/rag/retrieval.js`, `packages/core/rag/ragConfig.js`. Docs:
`docs/rag/README.md`, `docs/rag/rag-source-inventory.md`, `docs/rag/adding-content.md`.
Tested by E1/E2 → RQ2 (§5.1). Keep the justification for the corpus choice in Ch 4 (data) to
avoid repeating it. -->

TODO(write)

## 3.3 Prompt design, safety layer and NZ localisation

<!-- TEMPLATE: ≈250 words.
Cover:
- the prompt generations P0 → v1 → v2 and what each changed;
- the SAFETY RULES block (111-first, no dosing, refusal boundaries);
- "passages are data" (injection resistance);
- NZ persona and helplines;
- user-set preferences (caregiver framing, tone, length) as **implemented-but-unevaluated**
  personalisation.
Code: `packages/core/rag/prompt.js`. History: `docs/eval/evaluation-plan.md` §2.3 (baselines that
exist in git) and §6.
Tested by E2/E3 → RQ3 (§5.2). Name the v1 AU-leak here only as a design fact; its measurement
belongs in Ch 5. -->

TODO(write)

## 3.4 Voice pipeline

<!-- TEMPLATE: ≈200 words.
Cover:
- the streaming STT cascade (primary and fallback; which recogniser is in production);
- speculative retrieval;
- streaming LLM → sentence chunking → ElevenLabs **REST `/with-timestamps` per sentence** →
  character alignment → viseme timeline. This is the production path on the Unity renderer on
  both platforms and in the web study. WebSocket streaming TTS is used **only** by the legacy
  Three.js profiles (`docs/eval/evaluation-plan.md` §2.1; §1 "Streaming TTS is not on the
  production path"). Do not claim streaming TTS as a latency optimisation of the evaluated
  system;
- the OpenAI TTS fallback;
- the fastVoiceMode / handsFreeMode flags.
Source: `docs/voice-latency-streaming.md` §Architecture; code in `packages/core/voice` and
`packages/core/tts`.
Tested by E4 → RQ4 (§5.3) and E9 → RQ5 (§5.4). Be precise about which recogniser is which:
- E9 measured `whisper-1`, the deployed **fallback** (whole recording uploaded after the user
  stops);
- the **primary** live recogniser (browser/on-device streaming STT) was **not** measured on
  dementia speech. The planned Web Speech subset (`docs/eval/evaluation-plan.md` §17.1) has no
  result;
- the cost model assumes the fallback serves 0 % of spoken turns
  (`docs/report/eval/final/cost_ff2753e.md` Assumptions).
Say this here, and carry it to §6.3. -->

TODO(write)

## 3.5 Avatar and articulation engine

<!-- TEMPLATE: ≈200 words + optional reuse of the existing viseme montage
(`docs/report/figures/fig2_viseme_montage.png`), if the page budget allows.
Cover:
- Unity characters (two, with switching);
- the co-articulation model: dominance blending, anticipation, bilabial closure rules;
- grapheme-to-phoneme conversion;
- the bridge from TTS timing to animation;
- the Three.js fallback renderer on web.
Reusable text: `docs/report/midyear-technical-report.md` §2.1 (still accurate per the repo
inventory). Rework it rather than paste — it was submitted.
Code: `packages/core/lipsync`, `unity-avatar/UnityAvatarProject`.
Tested by E5 → RQ4 (§5.3). -->

TODO(redraft: from `docs/report/midyear-technical-report.md` §2.1)

## 3.6 Deployment and engineering practice

<!-- TEMPLATE: ≈80 words (reduced to fund the drivers opening).
Cover:
- deployment targets (web on Vercel; iOS; Android port status — say what was validated on a
  device and what was not);
- CI;
- tests;
- the committed-artefact convention (sha-stamped evaluation outputs).
This is the co-design/tool-proficiency evidence, and sets up E10 (§5.5).
Sources: `docs/eval/functional-verification.md` §Test inventory, `docs/android-unity.md`,
`apps/web/README.md`. -->

TODO(write)
