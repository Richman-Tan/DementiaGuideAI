# Test coverage — 5a1a880 (2026-09-18)

Statement, branch, function and line coverage as reported by the test runners
themselves (Jest V8 provider via `apps/mobile/jest.coverage.config.js`; Vitest V8
provider via `apps/web/vite.config.js`). Coverage is **reported, not gated**: no
threshold exists and CI does not run this. Numbers describe how much of the
instrumented source the automated suites execute — not whether the product works.
The requirements-to-evidence matrix in `docs/eval/functional-verification.md` is
the functional claim; this table is one of its inputs.

Regenerate: `npm run test:coverage && node scripts/eval/coverage-summary.mjs`.

## Test counts (static count of `it()`/`test()` calls)

| Runner | test files | cases |
|---|---:|---:|
| Jest (apps/mobile, packages/core, scripts) | 25 | 218 |
| Vitest (apps/web) | 27 | 217 |
| Vitest (apps/api) | 5 | 66 |
| **Total** | **57** | **501** |

`it.each` rows count once here; the runners' own totals are higher by the number
of table rows they expand.

## By workspace

| Workspace | files | statements | branches | functions | lines |
|---|---:|---|---|---|---|
| jest (apps/mobile + packages/core + scripts) | 75 | 17.4% (2846/16353) | 74.5% (699/938) | 68.1% (128/188) | 17.4% (2846/16353) |
| vitest (apps/web) | 77 | 28.6% (3104/10839) | 74.8% (232/310) | 51.8% (73/141) | 28.6% (3104/10839) |
| vitest (apps/api) | 12 | 64.8% (689/1063) | 80.1% (193/241) | 81.5% (22/27) | 64.8% (689/1063) |

## By subsystem

| Subsystem | files | statements | branches | functions | lines |
|---|---:|---|---|---|---|
| packages/core/rag | 4 | 95.8% (342/357) | 82.8% (96/116) | 92.3% (12/13) | 95.8% (342/357) |
| packages/core/voice | 3 | 99.2% (244/246) | 77.1% (37/48) | 100.0% (11/11) | 99.2% (244/246) |
| packages/core/lipsync | 5 | 86.7% (552/637) | 79.6% (82/103) | 92.9% (13/14) | 86.7% (552/637) |
| packages/core/tts | 2 | 89.3% (357/400) | 60.0% (60/100) | 86.4% (19/22) | 89.3% (357/400) |
| packages/core/study | 1 | 0.0% (0/235) | 0.0% (0/1) | 0.0% (0/1) | 0.0% (0/235) |
| packages/core (other) | 4 | 50.2% (261/520) | 81.8% (18/22) | 50.0% (4/8) | 50.2% (261/520) |
| scripts/eval/lib | 7 | 87.8% (860/980) | 80.1% (327/408) | 96.6% (57/59) | 87.8% (860/980) |
| scripts/ingest | 3 | 34.1% (230/674) | 84.0% (79/94) | 85.7% (12/14) | 34.1% (230/674) |
| apps/mobile src/lib | 14 | 0.0% (0/1572) | 0.0% (0/14) | 0.0% (0/14) | 0.0% (0/1572) |
| apps/mobile src/features | 32 | 0.0% (0/10732) | 0.0% (0/32) | 0.0% (0/32) | 0.0% (0/10732) |
| apps/web src/services | 9 | 6.6% (60/916) | 55.2% (16/29) | 30.0% (3/10) | 6.6% (60/916) |
| apps/web src/study | 11 | 40.0% (801/2003) | 83.1% (128/154) | 66.7% (36/54) | 40.0% (801/2003) |
| apps/web src/voice | 2 | 3.4% (18/526) | 80.0% (4/5) | 50.0% (1/2) | 3.4% (18/526) |
| apps/web src/avatar | 14 | 0.0% (0/2962) | 21.4% (3/14) | 21.4% (3/14) | 0.0% (0/2962) |
| apps/web src/screens | 11 | 0.0% (0/1217) | 18.2% (2/11) | 18.2% (2/11) | 0.0% (0/1217) |
| apps/web src/lib | 2 | 100.0% (45/45) | 75.0% (6/8) | 100.0% (6/6) | 100.0% (45/45) |
| apps/web (other) | 28 | 68.8% (2180/3170) | 82.0% (73/89) | 50.0% (22/44) | 68.8% (2180/3170) |
| other | 12 | 64.8% (689/1063) | 80.1% (193/241) | 81.5% (22/27) | 64.8% (689/1063) |

## Not instrumented

Directories with no file in either summary (nothing executes them under the
automated suites, and they are outside the instrumented globs or have no tests):

- none

Files are counted per workspace summary; a shared file cannot appear in both
because the two runners instrument disjoint trees.
