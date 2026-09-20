// Merge the two coverage-summary.json files (Jest over apps/mobile + packages/core
// + scripts via apps/mobile/jest.coverage.config.js; Vitest over apps/web) into
// one dated markdown table grouped by subsystem.
//
//   npm run test:coverage && node scripts/eval/coverage-summary.mjs
//
// Reported, never gated: there are no thresholds anywhere, and this script does
// not fail on low numbers. A directory that appears in no summary is listed under
// "not instrumented" so the report cannot quietly imply coverage it lacks.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, gitSha } from './lib.mjs';

const SOURCES = [
  { workspace: 'jest (apps/mobile + packages/core + scripts)', file: 'apps/mobile/coverage/coverage-summary.json' },
  { workspace: 'vitest (apps/web)', file: 'apps/web/coverage/coverage-summary.json' },
  // Present once apps/api runs `vitest --coverage`; reported as missing until then.
  { workspace: 'vitest (apps/api)', file: 'apps/api/coverage/coverage-summary.json' },
];

// First match wins; order matters for the packages/core split.
const SUBSYSTEMS = [
  ['packages/core/rag', 'packages/core/rag'],
  ['packages/core/voice', 'packages/core/voice'],
  ['packages/core/lipsync', 'packages/core/lipsync'],
  ['packages/core/tts', 'packages/core/tts'],
  ['packages/core/study', 'packages/core/study'],
  ['packages/core (other)', 'packages/core'],
  ['scripts/eval/lib', 'scripts/eval/lib'],
  ['scripts/ingest', 'scripts/ingest'],
  ['apps/mobile src/lib', 'apps/mobile/src/lib'],
  ['apps/mobile src/features', 'apps/mobile/src/features'],
  ['apps/web src/services', 'apps/web/src/services'],
  ['apps/web src/study', 'apps/web/src/study'],
  ['apps/web src/voice', 'apps/web/src/voice'],
  ['apps/web src/avatar', 'apps/web/src/avatar'],
  ['apps/web src/screens', 'apps/web/src/screens'],
  ['apps/web src/lib', 'apps/web/src/lib'],
  ['apps/web (other)', 'apps/web/src'],
];

// Directories the report is expected to speak about. Any of these with zero
// files in either summary is reported as not instrumented.
const EXPECTED = [
  'packages/core/rag', 'packages/core/voice', 'packages/core/lipsync', 'packages/core/tts',
  'packages/core/study', 'scripts/eval/lib', 'scripts/ingest', 'apps/mobile/src/lib',
  'apps/mobile/src/features', 'apps/web/src/services', 'apps/web/src/study', 'apps/web/src/voice',
  'apps/web/src/avatar', 'apps/web/src/screens', 'apps/api/api',
];

const METRICS = ['statements', 'branches', 'functions', 'lines'];

function subsystemOf(rel) {
  for (const [name, prefix] of SUBSYSTEMS) if (rel.startsWith(prefix + '/') || rel === prefix) return name;
  return 'other';
}

function emptyAgg() {
  const a = {};
  for (const m of METRICS) a[m] = { covered: 0, total: 0 };
  a.files = 0;
  return a;
}

function add(agg, entry) {
  for (const m of METRICS) {
    agg[m].covered += entry[m]?.covered ?? 0;
    agg[m].total += entry[m]?.total ?? 0;
  }
  agg.files += 1;
}

function pct(c) {
  return c.total ? `${((100 * c.covered) / c.total).toFixed(1)}%` : 'n/a';
}

function row(name, agg) {
  return `| ${name} | ${agg.files} | ${METRICS.map(m => `${pct(agg[m])} (${agg[m].covered}/${agg[m].total})`).join(' | ')} |`;
}

function countTests(dirs) {
  // Static count of it()/test() calls, the same measure quoted in the plan.
  let files = 0, cases = 0;
  for (const d of dirs) {
    const out = execSync(
      `find ${d} -type f \\( -name '*.test.js' -o -name '*.test.ts' -o -name '*.test.jsx' -o -name '*.test.tsx' \\) -not -path '*/node_modules/*'`,
      { cwd: ROOT },
    ).toString().trim().split('\n').filter(Boolean);
    files += out.length;
    for (const f of out) {
      const src = readFileSync(resolve(ROOT, f), 'utf8');
      cases += (src.match(/^\s*(it|test)(\.each\([^)]*\))?\s*\(/gm) || []).length;
    }
  }
  return { files, cases };
}

const perSubsystem = new Map();
const perWorkspace = [];
const seenDirs = new Set();
let anyLoaded = false;

for (const src of SOURCES) {
  const p = resolve(ROOT, src.file);
  if (!existsSync(p)) {
    perWorkspace.push({ workspace: src.workspace, missing: true });
    continue;
  }
  anyLoaded = true;
  const json = JSON.parse(readFileSync(p, 'utf8'));
  const ws = emptyAgg();
  for (const [file, entry] of Object.entries(json)) {
    if (file === 'total') continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    seenDirs.add(rel);
    const sub = subsystemOf(rel);
    if (!perSubsystem.has(sub)) perSubsystem.set(sub, emptyAgg());
    add(perSubsystem.get(sub), entry);
    add(ws, entry);
  }
  perWorkspace.push({ workspace: src.workspace, agg: ws });
}

if (!anyLoaded) {
  console.error('No coverage-summary.json found. Run `npm run test:coverage` first.');
  process.exit(1);
}

const notInstrumented = EXPECTED.filter(d => ![...seenDirs].some(f => f.startsWith(d + '/')));
const jestCounts = countTests(['apps/mobile', 'packages/core', 'scripts']);
const vitestCounts = countTests(['apps/web/tests']);
const apiCounts = existsSync(resolve(ROOT, 'apps/api/tests')) ? countTests(['apps/api/tests']) : { files: 0, cases: 0 };

const sha = gitSha();
const date = new Date().toISOString().slice(0, 10);
const header = (first) => `| ${first} | files | statements | branches | functions | lines |\n|---|---:|---|---|---|---|`;

const ordered = [...SUBSYSTEMS.map(s => s[0]), 'other'].filter(n => perSubsystem.has(n));

const md = `# Test coverage — ${sha} (${date})

Statement, branch, function and line coverage as reported by the test runners
themselves (Jest V8 provider via \`apps/mobile/jest.coverage.config.js\`; Vitest V8
provider via \`apps/web/vite.config.js\`). Coverage is **reported, not gated**: no
threshold exists and CI does not run this. Numbers describe how much of the
instrumented source the automated suites execute — not whether the product works.
The requirements-to-evidence matrix in \`docs/eval/functional-verification.md\` is
the functional claim; this table is one of its inputs.

Regenerate: \`npm run test:coverage && node scripts/eval/coverage-summary.mjs\`.

## Test counts (static count of \`it()\`/\`test()\` calls)

| Runner | test files | cases |
|---|---:|---:|
| Jest (apps/mobile, packages/core, scripts) | ${jestCounts.files} | ${jestCounts.cases} |
| Vitest (apps/web) | ${vitestCounts.files} | ${vitestCounts.cases} |
| Vitest (apps/api) | ${apiCounts.files} | ${apiCounts.cases} |
| **Total** | **${jestCounts.files + vitestCounts.files + apiCounts.files}** | **${jestCounts.cases + vitestCounts.cases + apiCounts.cases}** |

\`it.each\` rows count once here; the runners' own totals are higher by the number
of table rows they expand.

## By workspace

${header('Workspace')}
${perWorkspace.map(w => w.missing ? `| ${w.workspace} | — | no coverage-summary.json | | | |` : row(w.workspace, w.agg)).join('\n')}

## By subsystem

${header('Subsystem')}
${ordered.map(n => row(n, perSubsystem.get(n))).join('\n')}

## Not instrumented

Directories with no file in either summary (nothing executes them under the
automated suites, and they are outside the instrumented globs or have no tests):

${notInstrumented.length ? notInstrumented.map(d => `- \`${d}\``).join('\n') : '- none'}

Files are counted per workspace summary; a shared file cannot appear in both
because the two runners instrument disjoint trees.
`;

const outDir = resolve(ROOT, 'docs/report/eval/final');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, `coverage_${sha}.md`);
writeFileSync(out, md);
console.log(md);
console.log(`→ ${relative(ROOT, out)}`);
