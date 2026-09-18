# E9 — speech recognition on dementia speech (DementiaBank / ADReSS-2020)

Tooling for evaluation E9 (`docs/eval/evaluation-plan.md` §17.1). Everything under
`data/dementiabank/` is git-ignored; only aggregate tables under
`docs/report/eval/stt/` are committed.

## Ground Rules — read before running anything

DementiaBank is password-protected TalkBank data. The Ground Rules
(https://talkbank.org/0share/rules.html) forbid posting it elsewhere, sharing it
with anyone without their own access, and **uploading it to web services unless a
non-storage option is in force**. Therefore:

- **Local transcription (`transcribe-local.py`) is the primary path.** The audio
  never leaves this machine. `large-v2` is the default because OpenAI has said the
  hosted `whisper-1` is that family; label the result as "local Whisper large-v2
  (proxy for the production `whisper-1`)".
- **API transcription (`transcribe.mjs`)** is byte-identical to the production
  fallback call and is the number the report would ideally carry, but it uploads
  the audio to OpenAI. Run it only with zero-data-retention confirmed on the
  account or explicit supervisor sign-off, and say which in the report.
- Cite the corpus (Becker et al. 1994 for Pitt; Luz et al. 2020 for ADReSS) and
  acknowledge NIA AG03705 and AG05133. Never commit audio, references or
  hypothesis text; the report scripts refuse to emit more than single-word
  confusion pairs.

## Steps

1. **Prepare.** Download ADReSS-2020 (members only) to
   `data/dementiabank/ADReSS-IS2020-data/` and build the reference table:
   ```
   .venv/bin/pip install -r scripts/eval/stt/requirements.txt   # once; venv is git-ignored
   .venv/bin/python scripts/eval/stt/prepare-adress.py --adress data/dementiabank/ADReSS-IS2020-data
   ```
   → `data/dementiabank/references.csv`, `manifest.json`. `--self-test` runs it on the
   synthetic fixture instead; `--join chunks` uses the distributed chunk files.
2. **Transcribe.** Local (primary):
   ```
   .venv/bin/python scripts/eval/stt/transcribe-local.py --dry-run
   .venv/bin/python scripts/eval/stt/transcribe-local.py                 # large-v2, int8, CPU
   ```
   → `data/dementiabank/hyps_local-large-v2.csv` (model column `local:large-v2`),
   cached per file under `data/dementiabank/cache/local-large-v2/` so re-runs are
   free. API (secondary, see above): `node scripts/eval/stt/transcribe.mjs --dry-run`
   then `--model whisper-1 | gpt-4o-transcribe | gpt-4o-mini-transcribe`.
   Both write the same CSV contract (`chunk_path, model, prompt, hyp_text, ms, cached, error`).
3. **Report.**
   ```
   node scripts/eval/stt/wer-report.mjs                    # every hyps_*.csv in data/dementiabank/
   node scripts/eval/stt/wer-report.mjs --profile-out data/dementiabank/error-profile_local-large-v2.json
   node scripts/eval/stt/perturb-questions.mjs --profile data/dementiabank/error-profile_local-large-v2.json
   ```
   → `docs/report/eval/stt/wer_<sha>_<model>.{md,csv}` (aggregates only) and, for the
   downstream step, `scripts/eval/questions.perturbed.js`.

`live-harness.html` is the Web Speech (Chrome, `en-NZ`) loopback harness for the
production-primary recogniser on a 20-speaker subset; it runs in the browser and
sends nothing anywhere except Chrome's own recogniser, which is itself a web
service — treat it under the same rule as the API path.
