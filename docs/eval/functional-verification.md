# E10 — Functional verification: requirements-to-evidence matrix

> Added 2026-09-18 (supervisor review: the test suite must be part of the evaluation).
> Repo state `5a1a880` plus the tests added by the 2026-09-18 addendum. Test counts are
> context; this matrix is the result. Coverage figures live in
> `docs/report/eval/final/coverage_<sha>.md`.

## How to read the status column
- **verified** — an automated test or exit-code-gated evaluation checks it and runs in CI (`npm test`).
- **verified-manual** — checked by a documented procedure with a dated record (Unity harness run, pilot checklist, code review against a stated document).
- **not verified** — no evidence yet; listed deliberately.

## Verification levels in use
| Level | Meaning | Examples |
|---|---|---|
| unit | pure function against expected values | `packages/core/rag/retrieval.test.js`, `scripts/eval/lib/stats.test.js` |
| parity | new implementation pinned to the original it replaced | `sentenceTracker.test.js`, `createVisemeTimeline.streaming.test.js` |
| contract / source-scan | two artefacts that must agree, compared as text or config | `apps/web/tests/interop.test.js`, `csp.test.js`, `unityKeyboard.test.js`, `clientParity.test.js` |
| byte-freeze | production text frozen so drift fails the build | `prompt.test.js`, `promptVersions.test.js`, `build-icons.test.js` |
| integration (fake) | module driven through a fake dependency | `elevenLabsStreamService.test.js` (fake WebSocket), `studyGuards.test.js` |
| eval gate | deterministic checks over generated answers, exit-code gated | `safety-checks.mjs`, `safety-report.mjs`; committed artefacts re-checked by `artefacts.test.js` |
| e2e | assembled app in a real browser with every provider mocked at the network layer | `apps/web/e2e/chat.spec.js`, `apps/web/e2e/study.spec.js` (Playwright, Chromium; fixtures in `e2e/support.js`) |
| harness | Unity play-mode acceptance loop | `LipSyncTestDriver` / `LipSyncMetrics` |
| manual | documented checklist or device procedure | `docs/study/pilot-checklist.md`, `docs/report/700b_evaluation_plan.md` §3 |

## Matrix

| ID | Requirement | Where stated | Level | Evidence | Status |
|---|---|---|---|---|---|
| FR-01 | Answers cite the passages they used with valid `[S#]` markers; citation precision reported | midyear report; `docs/eval/README.md` | unit + eval gate | `packages/core/rag/citations.test.js`; citation precision column in `docs/report/eval/final/tables_samples.md` | verified |
| FR-02 | Emergency inputs escalate to **111** (NZ) and do so first | safety design (`docs/rag/*`, E3) | eval gate + unit + tripwire | `scripts/eval/lib/checks.js` (`first111`), `checks.test.js`; `docs/report/eval/final/safety-report_samples.md`; `scripts/eval/artefacts.test.js` | verified |
| FR-03 | No foreign emergency numbers or AU services for NZ users | same | eval gate | region-leak / foreign-emergency gates in `checks.js`; safety report | verified |
| FR-04 | No medication doses stated | same | eval gate | dose-leak gate; safety report | verified |
| FR-05 | Out-of-scope questions declined with signposting, not answered | E2 set C | eval gate + judge | scope dimension in `tables_samples.md`; set C rows | verified |
| FR-06 | Instructions inside retrieved passages are treated as data (indirect injection resisted) | E3 set J | eval gate | `safety-report_samples.md` set J; `PROMPT_LEAK` check | verified |
| FR-07 | Production prompt and the frozen rollback prompt cannot drift silently | RAG audit F-20 | byte-freeze | `packages/core/rag/prompt.test.js`; `scripts/eval/prompts/promptVersions.test.js` | verified |
| FR-08 | Retrieval returns top-5 after capping each source family at 2 | `ragConfig.js` | unit | `packages/core/rag/retrieval.test.js` | verified |
| FR-09 | Retrieval quality on labelled questions (recall@5) | E1 | eval | `docs/report/eval/retrieval_8a92ecd_v2*.json`; `scripts/eval/metrics.test.js` | verified |
| FR-10 | Ingestion chunks deterministically and re-embeds only changed content | `scripts/ingest/ingest.mjs` | unit (chunking) + code review | `scripts/ingest/chunking.test.js`; content-hash diff is reviewed, not tested | verified (chunking) / verified-manual (idempotence) |
| FR-11 | Streamed answers are split into sentences for TTS exactly as the original inline logic did | latency overhaul | parity | `packages/core/voice/sentenceTracker.test.js` | verified |
| FR-12 | Speculative retrieval is reused only when the partial transcript matches the final | same | unit | `packages/core/voice/speculativeRetrieval.test.js` | verified |
| FR-13 | ElevenLabs streaming: buffering, flush, watchdog, abort, normalisation | same | integration (fake) | `packages/core/tts/elevenLabsStreamService.test.js` | verified |
| FR-14 | Web STT: `en-NZ` live recogniser; sticky degrade to Whisper on non-permission failure; rescue only above 4 KiB; fallback skips < 2 KiB | `sttWeb.js` design | integration (stubbed globals) | `apps/web/tests/sttCascade.test.js` (added 2026-09-18) | verified |
| FR-15 | Web and mobile clients enforce identical timeouts, embed-cache size, throttle and history window | shared-pipeline claim (`docs/eval/evaluation-plan.md` §2.1) | contract / source-scan | `apps/web/tests/clientParity.test.js` (added 2026-09-18) | verified |
| FR-16 | Every `@core` module loads through the web alias and CJS→ESM transform | monorepo boundary | contract | `apps/web/tests/interop.test.js` | verified |
| FR-17 | Streaming viseme timeline equals the one-shot timeline; word carry-over across chunks | lip-sync pipeline | parity + unit | `packages/core/lipsync/*.test.js` | verified |
| FR-18 | Avatar articulation meets the 95-check acceptance criteria on both characters | midyear report §Articulation | harness | `docs/report/eval/lipsync/README.md`: 37/85 → 95/95 (July); **95/95 Aaron (20260919_102343) and 95/95 Ariana (20260919_102750)** on the current runtime, driven headlessly via `scripts/lipsync/unitymcp.py` | verified-manual |
| FR-19 | Unity does not capture keyboard input (clipboard/typing works in the web shell) | clipboard defect | source-scan | `apps/web/tests/unityKeyboard.test.js` | verified |
| FR-20 | Unity WebGL is served pre-compressed with the brotli header (native decode ≈ 4 s, not JS ≈ 20 min) | `vite.config.js`, `vercel.json` | config + manual | `unityBrotliHeaders()` plugin mirrors production; verified by load on deploy; no automated check | verified-manual |
| FR-21 | CSP inline-script hash matches the deployed HTML | `vercel.json` | contract | `apps/web/tests/csp.test.js` | verified |
| FR-22 | Study: Arm A and Arm B are isolated in both directions | protocol §4 | integration | `apps/web/tests/studyGuards.test.js`; pilot checklist items | verified |
| FR-23 | Typed turns inside Arm A are recorded as typed (never enter STT/TTS/lip-sync) | protocol §5.2 | integration | `apps/web/tests/studyModality.test.js` | verified |
| FR-24 | Latin-square counterbalancing; instruments frozen after enrolment | protocol | unit + freeze | `apps/web/tests/study.test.js`, `studyInstruments.test.js` | verified |
| FR-25 | A PLWD session cannot proceed without a support person; consent is re-checked | protocol §3.3 | integration | `apps/web/tests/studyGuards.test.js`, `studyConsent.test.js` | verified |
| FR-26 | Session data survives failed flushes, device handover and recovery export | study harness | integration / round-trip | `studyClose.test.js`, `studyReset.test.js`, `studyRecovery.test.js` | verified |
| FR-27 | Latency marks: first-audio (voice) vs first-token (text) semantics are correct | analysis plan | unit | `apps/web/tests/studyLatency.test.js` | verified |
| FR-28 | Proxy: access-code gating with constant-time compare; short codes refused; CORS allowlist; daily meter fails closed without the service key and open on a transient error | `apps/api/api/_lib/guard.js` | unit + handler tests | `apps/api/tests/guard.test.js` (added 2026-09-18) | verified |
| FR-29 | Proxy pins model, language, voice and caps input size and `max_tokens`; a leaked code cannot select a differently priced model | `apps/api/api/*.js` | handler tests | `apps/api/tests/{chat,transcribe,embed,speech,eleven-tts}.test.js` (added 2026-09-18) | verified |
| FR-30 | Study events: batch cap, payload truncation marker, id validation, all-duplicates distinguishable from success | `apps/api/api/study/event.js` | handler tests | `apps/api/tests/event.test.js` (added 2026-09-18) | verified |
| FR-31 | Session resume is idempotent; participant numbers are allocated atomically | `apps/api/api/study/session.js`, SQL RPC | code review + SQL VERIFY block | `scripts/migrations/2026-08-18_study_tables.sql` VERIFY comments; no automated test | verified-manual |
| FR-32 | Audio is never written to disk or stored; no analytics or trackers | data-management plan §2 | code review | `apps/api/api/transcribe.js` header; CSP `connect-src` allowlist; grep for trackers | verified-manual |
| FR-33 | Library articles have full bodies and pass the NZ safety gate | library content fix | content test | `apps/web/tests/libraryContent.test.js` | verified |
| FR-34 | Native config plugins produce a valid iOS/Android project without the Unity artefacts | CI | prebuild smoke | `.github/workflows/ci.yml` job `prebuild-smoke` | verified |
| FR-35 | Assembled web app: ask → streamed answer → citations → source drawer; safety callout; response-length setting reaches the request; study Arm B enrol → typed turn → post-task questionnaire with a `typed` turn event; Arm B cannot reach the voice screen | product | e2e | `apps/web/e2e/chat.spec.js` (a–c), `apps/web/e2e/study.spec.js` (d–e); OpenAI, the retrieval RPC and the study API are answered by fixtures, the Unity build is refused (added 2026-09-19) | verified |
| FR-36 | Device fallback drills: airplane mode mid-stream, invalid ElevenLabs key, mic denied | `docs/voice-latency-streaming.md` | manual | owed; record in `docs/study/dry-runs/` | not verified |
| FR-37 | On-device lip-sync verification through the UaaL bridge | `docs/report/700b_evaluation_plan.md` §3 | manual | procedure defined, not run | not verified |
| FR-38 | Study end-to-end dry run against the pilot checklist | `docs/study/pilot-checklist.md` | manual | passed 2026-09-01/02/09 per plan status line; **no per-run record file exists** — next run to be recorded in `docs/study/dry-runs/<date>.md` | verified-manual (unrecorded) |

## Test inventory (context, not result)

Static count at `5a1a880`: 47 files / ~402 cases — Jest ~197 (apps/mobile 9, packages/core 73, scripts 115) and Vitest 205 (apps/web). `apps/api`: 0 before 2026-09-18. After the addendum (2026-09-18 run): Jest 25 suites / 234 tests (adds `wer.test.js` 15, `perturb.test.js` 5, `artefacts.test.js` 3), Vitest web 27 files / 231 (adds `clientParity` 9, `sttCascade` 9), Vitest api 5 files / 66 + 1 todo. Coverage: `docs/report/eval/final/coverage_775adeb.md` — packages/core/rag 95.8 % statements, scripts/eval/lib 87.8 %, apps/api 64.8 %, apps/mobile lib/features 0 % (no tests exercise them), apps/web services 6.6 %. CI runs typecheck, lint, the three unit suites, the Expo prebuild smoke and the Playwright end-to-end job (`e2e`, Chromium, no secrets) on every pull request and push to `main` (`.github/workflows/ci.yml`); branch protection is a GitHub setting, not in the repo, so the honest claim is "CI runs on every PR", not "tests are a hard merge gate", unless the setting is confirmed.

Largest untested areas before the addendum: `apps/api` (all 12 files), the voice orchestration hooks (`useVoiceConversation.js`, `useAvatarConversation.js`), the two client RAG drivers (`openaiClient.js`, `openaiService.js`), the Unity bridge on the JS side, and all screens. The addendum closes `apps/api` and the client-driver parity; hooks, bridge and screens remain untested and are listed above where a requirement depends on them.

## Coverage

Measured by `npm run test:coverage` and summarised by `scripts/eval/coverage-summary.mjs` into `docs/report/eval/final/coverage_<sha>.md`. No threshold is enforced: the number is reported, not gated, because gating legacy UI code would fail CI without improving the evidence.
