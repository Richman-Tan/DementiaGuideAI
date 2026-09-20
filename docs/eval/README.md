# Evaluation harness

How the final-project evaluation is run, what each script produces, and how the
numbers get into the report. The design, priorities and statistics behind it
are in **[evaluation-plan.md](evaluation-plan.md)** (approved 2026-09-12); the
results collected so far are in **[results-2026-09-13.md](results-2026-09-13.md)**.

Conventions: every generated artefact is stamped with the git sha and written
under `docs/report/eval/` (raw, one file per run) or `docs/report/eval/final/`
(report tables). Nothing under `docs/report/` is edited by hand. The judge
cache of passage text lives in `.cache/` (git-ignored, regenerable).

## Layout

```
scripts/eval/
  questions.js                dev question sets A/B/C/S/I/N + J (indirect injection); regexes
  questions.heldout.js        HELD-OUT safety set (56 items; team + clinician review recorded 2026-09-13)
  prompts/promptVersions.js   prompt CONDITIONS: p0 | v1 | v2-nosafety | v2-trailing | v2
  run-generation.mjs          answers for any condition × retrieval mode × samples (--resume, --pace-ms, --sha)
  run-retrieval.mjs           recall@k / MRR / nDCG; variants --cap none, --dense-only, --top-k
  compare-retrieval.mjs       paired deltas (bootstrap CI) + McNemar on hit@5 between two retrieval runs
  safety-checks.mjs           CI gate: MUST/MUST-NOT per answer, exit code
  safety-report.mjs           multi-sample rates, Wilson CIs, 111-first, leaks, McNemar
  judge.mjs                   blinded rubric judge (Claude or gpt-4o-mini), CSV + audit JSON
  judge-pairwise.mjs          position-swapped pairwise preference
  human-sheet.mjs             stratified blinded rating sheets + separate KEY
  agreement.mjs               κ (unweighted / linear / quadratic) human–human, human–judge, judge–judge
  report-tables.mjs           Tables A/B/C for the report
  build-phone-allowlist.mjs   verified numbers for the invented-number check
  latency/bench-pipeline.mjs  headless per-stage latency benchmark
  judges/rubrics.js           the ONE rubric text used by judge and humans
  lib/                        stats.js, checks.js, aggregate.js, textMetrics.js, csv.js, judgeClient.mjs
  fixtures/phone-allowlist.json
scripts/parse-latency.mjs     [LATENCY SUMMARY] logs → median/mean/p90/p95/sd, --group-by
scripts/lipsync/
  summarise-testresults.mjs   Unity harness runs → committed JSON + docs/report/eval/lipsync/README.md
  g2p-ablation.mjs            G2P vs character heuristic (JS only)
  lib.js                      sequence/closure metrics
```

All `lib/*.js`, `prompts/*.js`, `judges/*.js` and `questions*.js` are plain
CommonJS and covered by Jest (`npm test -w apps/mobile` collects `scripts/`).

## The answer-quality matrix (E2) and safety benchmark (E3)

1. **Freeze the snapshot.** `npm run rag:introspect` (corpus size into
   `docs/report/kb_chunks_reference.csv`), `npm run eval:phone-allowlist`, note
   `git rev-parse --short HEAD`. Do not change the prompt after this point.
   Pass that sha as `--sha <label>` to every later generation run: a matrix takes
   hours, and commits made meanwhile would otherwise rename later files (the
   header still records the actual HEAD as `actualGitSha`). The 2026-09-13
   snapshot is `8a92ecd` (453 chunks).
2. **Generate.** One seeded run per condition for comparability with the July
   artefacts, then a 3-sample run at the production temperature for rates:

   ```bash
   for c in v2 v2-nosafety v1 p0; do
     npm run eval:generate -- --prompt $c --heldout --tag final
     npm run eval:generate -- --prompt $c --heldout --samples 3 --tag final
   done
   npm run eval:generate -- --no-rag  --heldout --tag final            # RAG ablation
   npm run eval:generate -- --oracle  --sets A,A-neighbour --tag final # retrieval ceiling
   ```
   `--dry-run` prints the plan and a cost estimate first. Set J appends its
   poisoned passage automatically (`--no-inject` for the control).

   **Rate limit.** The project's gpt-4o tier allows 30k tokens per minute, about
   eight to ten answers a minute in total. Run conditions one after another
   (never in parallel), keep `--pace-ms 3000`, and use `--resume`: the file is
   checkpointed every ten answers and a 429 is retried after the wait the API
   asks for. A 130-item condition takes ~13 minutes; a 3-sample condition ~40.
3. **Deterministic gates and safety report.**

   ```bash
   npm run rag:eval:safety -- docs/report/eval/generation_<sha>_v2_final.json        # exit-code gate
   npm run eval:safety-report -- docs/report/eval/generation_<sha>_*_x3_final.json --compare v1,v2 --heldout --tag final
   ```
4. **Judge** (blinded; the judge never sees the condition):

   ```bash
   npm run eval:judge -- docs/report/eval/generation_<sha>_*_final.json --model claude-opus-5 --heldout   # needs ANTHROPIC_API_KEY
   npm run eval:judge -- docs/report/eval/generation_<sha>_*_final.json --model gpt-4o-mini --heldout     # second judge family
   npm run eval:judge:pairwise -- --a generation_<sha>_v2_final.json --b generation_<sha>_p0_final.json
   ```
   Pilot on `--limit 10` and read the reasons before a full run.
5. **Human ratings.** `npm run eval:human-sheet -- <gen files> --per-condition 10 --tag round1`
   gives every rater the same items; fill the CSV, never open `*_KEY.csv`.
   Then `npm run eval:agreement -- --a sheet_R1.csv --b sheet_R2.csv` and
   `--a sheet_R1.csv --key *_KEY.csv --judge judge_*.csv`. Below κ 0.6 on a
   dimension, the human numbers are primary for that dimension.
6. **Tables.** `npm run eval:tables -- <gen files> --judge judge_*.csv --pairwise pairwise_*.json --reference v2 --tag final`.

Costs at 2026 rates: ~US$0.02 per gpt-4o answer, ~US$0.03 per Claude Opus 5
judge call, ~US$0.001 per gpt-4o-mini judge call. The full matrix (≈130 items ×
6 conditions × 4 answers) is roughly US$60 of generation plus US$50 of Opus judging.

## Retrieval configurations (E1)

```bash
npm run rag:eval:retrieval                    # production: hybrid score, iSupport cap 2
npm run rag:eval:retrieval -- --cap none      # pre-2026-07-13 behaviour (no source-family cap)
npm run rag:eval:retrieval -- --dense-only    # cosine-only ordering (empty query_text → lexical term 0)
npm run eval:compare-retrieval -- docs/report/eval/retrieval_<sha>_v2.json docs/report/eval/retrieval_<sha>_v2_cap-none.json
```

The comparison prints per-metric paired deltas with a seeded bootstrap CI and a
McNemar test on hit@5, and names the discordant questions.

## Latency (E4)

* Headless stages: `npm run eval:latency:bench -- --questions 30 --repeats 3 --tag wifi-home`
  (`--tts` needs `ELEVENLABS_API_KEY`; `--whisper clip.wav` times the fallback path).
* Real clients: capture `[LATENCY SUMMARY]` lines from the web console or the
  Metro log, then `npm run eval:latency:parse -- log.txt --group-by mode --out docs/report/eval/final/latency_<device>.csv`.
* Study sessions: `npm run study:analyse` Table 4 (Arm A spoken turns, medians).
* Same-build ablation: flip `VOICE_STREAMING_STT` / `VOICE_SPECULATIVE_RAG` in
  `packages/core/voice/voiceConfig.js`, rebuild, repeat the same questions.

Streaming TTS does not run on the Unity path; report it only for the legacy
Three.js profiles if measured at all.

## Lip-sync (E5)

* `npm run lipsync:summarise -- --all` extracts every local Unity harness run to
  `docs/report/eval/lipsync/` (commit these — the raw folder is git-ignored) and
  flags sampler-starved runs.
* `npm run lipsync:g2p-ablation` compares the shipped G2P timeline with the
  pre-2026-07-12 character heuristic on knowledge-base sentences.
* Re-running the Unity harness itself is manual: Editor → Tools › LipSync › Run
  All Fixtures (no captures), with `Time.captureFramerate = 60`.

## Speech recognition on dementia speech (E9)

Corpus: DementiaBank ADReSS-2020, members only; download the two zips and `2020Labels.txt` into the git-ignored `data/dementiabank/ADReSS-IS2020-data/` (`train/`, `test/`). Nothing under `data/` is ever committed; the reports under `docs/report/eval/stt/` carry aggregates only. Design and data-handling rules: `evaluation-plan.md` §17.1; results: `results-e9-stt-2026-09-18.md`.

```
python3 -m venv .venv && .venv/bin/pip install -r scripts/eval/stt/requirements.txt   # pylangacq, jiwer, faster-whisper; plus mlx-whisper on Apple silicon
npm run eval:stt:prepare -- --adress data/dementiabank/ADReSS-IS2020-data --join utterance      --out data/dementiabank           # condition (a): utterance cuts, pauses included
npm run eval:stt:prepare -- --adress data/dementiabank/ADReSS-IS2020-data --join chunks-concat  --out data/dementiabank/chunkcat  # condition (b): VAD-trimmed, one clip per utterance
npm run eval:stt:local -- --backend mlx --repo mlx-community/whisper-large-v2-mlx-8bit --references data/dementiabank/references.csv --resume
npm run eval:stt:wer   -- --references data/dementiabank/references.csv --hyps data/dementiabank/hyps_local-large-v2-mlx-8bit.csv --out-dir docs/report/eval/stt --sha <sha> --profile-out data/dementiabank/error-profile.json
npm run eval:stt:perturb -- --profile data/dementiabank/error-profile.json --seed 42            # → scripts/eval/questions.perturbed.js
node scripts/eval/run-retrieval.mjs  --questions-file scripts/eval/questions.perturbed.js --only-file
node scripts/eval/run-generation.mjs --questions-file scripts/eval/questions.perturbed.js --prompt v2 ...   # then judge as for the matrix
```

The local run is the primary measurement: the TalkBank Ground Rules only allow uploading protected data to services with non-storage selected. `transcribe.mjs` (the production-exact API call) runs only after supervisor sign-off; OpenAI documents no retention on the transcription endpoint, which is the basis for that request. On an 8 GB Apple-silicon Mac use the MLX 8-bit build: the CPU path and fp16 both swap (RTF ≈ 9 and 4.6 measured), 8-bit runs at RTF ≈ 0.2 on an idle machine. Every transcription is cached by content hash under `data/dementiabank/cache/`, so re-runs and `--resume` are free. `wer-report.mjs --self-test` and `prepare-adress.py --self-test` validate the pipeline on synthetic fixtures without the corpus.

## Not automated

Human ratings, clinician review of the held-out items, device/browser latency
runs, the Unity Editor harness run, the perceptual lip-sync test, and the user
study itself (see `docs/study/`).
