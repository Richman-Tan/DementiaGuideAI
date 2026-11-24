#!/usr/bin/env node
/**
 * Merge every coverage source and check it against the agreed scope.
 *
 *   node scripts/test/coverage-gate.mjs            # report only
 *   node scripts/test/coverage-gate.mjs --enforce  # exit 1 unless every in-scope file is at 100%
 *
 * Sources (produce them first, e.g. `npm run test:coverage:all`):
 *   web   apps/web/.coverage-unit/*.json (Vitest, UNIT_COVERAGE=1)
 *         + apps/web/.coverage-e2e/*.json (Playwright, E2E_COVERAGE=1)
 *         Both instrumented by scripts/test/istanbul-pre-plugin.mjs from the
 *         same source, so their statement maps are identical and are summed.
 *   jest  apps/mobile/coverage/coverage-final.json (apps/mobile/jest.coverage.config.js)
 *   api   apps/api/coverage/coverage-final.json (Vitest, istanbul)
 *
 * Scope and exclusions: scripts/test/coverage-scope.mjs (human version:
 * docs/testing/coverage.md). A source file in scope that no test ever loaded
 * counts as 0%, so an untested file cannot drop out of the denominator.
 *
 * Gated on statements and lines. Branches and functions are reported only.
 * Writes coverage/gate.md (git-ignored) as well as printing to stdout.
 */
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';
import { AREAS, EXCLUDED, IGNORE, EXTENSIONS } from './coverage-scope.mjs';
import { instrumenterFor } from './istanbul-pre-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENFORCE = process.argv.includes('--enforce');
const GATED = ['statements', 'lines'];

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** A CoverageMap keyed by repo-relative path. */
function relMap(data) {
  const out = {};
  for (const [file, fc] of Object.entries(data)) {
    const key = rel(path.isAbsolute(file) ? file : path.resolve(ROOT, file));
    out[key] = { ...fc, path: key };
  }
  return libCoverage.createCoverageMap(out);
}

function loadSources() {
  const missing = [];
  const sources = {};

  // web: every unit and e2e snapshot, summed (identical maps, see header).
  const web = libCoverage.createCoverageMap({});
  const counts = {};
  for (const [label, dir, how] of [
    ['unit', 'apps/web/.coverage-unit', 'UNIT_COVERAGE=1 npm test -w apps/web'],
    ['e2e', 'apps/web/.coverage-e2e', 'npm run test:coverage:e2e'],
  ]) {
    const abs = path.join(ROOT, dir);
    counts[label] = 0;
    if (existsSync(abs)) {
      for (const f of readdirSync(abs).filter((n) => n.endsWith('.json'))) {
        const data = readJson(path.join(abs, f));
        for (const snap of Array.isArray(data) ? data : [data]) web.merge(relMap(snap));
        counts[label] += 1;
      }
    }
    if (!counts[label]) missing.push(`web ${label} (${dir}/; run \`${how}\`)`);
  }
  sources.web = web;

  for (const [id, file] of [
    ['jest', 'apps/mobile/coverage/coverage-final.json'],
    ['api', 'apps/api/coverage/coverage-final.json'],
  ]) {
    const p = path.join(ROOT, file);
    if (existsSync(p)) sources[id] = relMap(readJson(p));
    else {
      sources[id] = libCoverage.createCoverageMap({});
      missing.push(`${id} (${file})`);
    }
  }
  return { sources, missing, counts };
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (EXTENSIONS.includes(path.extname(name))) out.push(rel(p));
  }
  return out;
}

/** All-zero coverage for a file no test loaded, from the same instrumenter. */
function zeroCoverage(f) {
  const inst = instrumenterFor(f);
  if (!inst) return null;
  try {
    inst.instrumentSync(readFileSync(path.join(ROOT, f), 'utf8'), path.join(ROOT, f));
    return libCoverage.createFileCoverage(inst.lastFileCoverage());
  } catch {
    return null;
  }
}

const pct = (m) => (m.total === 0 ? 100 : (100 * m.covered) / m.total);
const fmt = (m) => `${pct(m).toFixed(1)}% (${m.covered}/${m.total})`;

/** Uncovered statements as compact line ranges, e.g. "12-14, 40". */
function uncoveredLines(fc) {
  const lines = new Set();
  for (const [id, hits] of Object.entries(fc.s)) {
    if (hits > 0) continue;
    const loc = fc.statementMap[id];
    for (let l = loc.start.line; l <= loc.end.line; l++) lines.add(l);
  }
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges = [];
  for (const l of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && l === last[1] + 1) last[1] = l;
    else ranges.push([l, l]);
  }
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
}

function main() {
  const { sources, missing, counts } = loadSources();
  const lines = [];
  const say = (s = '') => {
    lines.push(s);
  };
  const failures = [];

  say(`# Coverage gate${ENFORCE ? ' (enforcing)' : ' (report only)'}`);
  say('');
  say(
    `Scope: scripts/test/coverage-scope.mjs. Gated: ${GATED.join(' and ')} at 100% for every in-scope file.`
  );
  say(`Web snapshots merged: ${counts.unit} from unit test files, ${counts.e2e} from e2e tests.`);
  if (missing.length) {
    say('');
    say(`**Missing sources** (their files count as uncovered): ${missing.join('; ')}.`);
  }

  for (const area of AREAS) {
    const files = walk(path.join(ROOT, area.root)).filter((f) => !IGNORE.some((re) => re.test(f)));
    const inScope = files.filter((f) => !(f in EXCLUDED));
    const totals = libCoverage.createCoverageSummary();
    const rows = [];
    const typeOnly = [];
    for (const f of inScope) {
      // The best single source for this file (see coverage-scope.mjs on why not a union).
      let best = null;
      for (const id of area.sources) {
        const map = sources[id];
        if (!map.files().includes(f)) continue;
        const fc = map.fileCoverageFor(f);
        const s = fc.toSummary();
        if (!best || pct(s.statements) > pct(best.summary.statements))
          best = { id, fc, summary: s };
      }
      // A module of type declarations has nothing to execute, so nothing to
      // cover. Type-only imports are erased, which also means no test ever
      // loads it; without this it would count as an untested file.
      if (!best || GATED.some((k) => pct(best.summary[k]) < 100)) {
        if (zeroCoverage(f)?.toSummary().statements.total === 0) {
          typeOnly.push(f);
          continue;
        }
      }
      if (!best) {
        // Never loaded by any test: still counted, at its real size, so an
        // untested file cannot make the totals look better by being absent.
        const zero = zeroCoverage(f);
        if (zero) totals.merge(zero.toSummary());
        const n = zero ? zero.toSummary().statements.total : '?';
        rows.push({
          f,
          source: '—',
          statements: null,
          lines: null,
          uncovered: `never loaded by any test (${n} statements)`,
        });
        failures.push(`${f}: never loaded by any test`);
        continue;
      }
      totals.merge(best.summary);
      const short = GATED.filter((k) => pct(best.summary[k]) < 100);
      if (short.length) {
        rows.push({
          f,
          source: best.id,
          statements: best.summary.statements,
          lines: best.summary.lines,
          uncovered: uncoveredLines(best.fc),
        });
        failures.push(
          `${f}: ${short.map((k) => `${k} ${pct(best.summary[k]).toFixed(1)}%`).join(', ')}`
        );
      }
    }
    const never = rows.filter((r) => r.statements === null).length;
    say('');
    say(`## ${area.label}`);
    say('');
    say(
      `${inScope.length} files in scope, ${files.length - inScope.length} excluded. Loaded files: statements ${fmt(totals.statements)}, lines ${fmt(totals.lines)}, branches ${fmt(totals.branches)}, functions ${fmt(totals.functions)}${never ? `; ${never} file(s) never loaded` : ''}${typeOnly.length ? `; ${typeOnly.length} file(s) with no executable code (type declarations)` : ''}.`
    );
    if (rows.length) {
      say('');
      say('| File | Source | Statements | Uncovered lines |');
      say('|---|---|---|---|');
      for (const r of rows.sort(
        (a, b) => (a.statements ? pct(a.statements) : -1) - (b.statements ? pct(b.statements) : -1)
      )) {
        say(
          `| ${r.f} | ${r.source} | ${r.statements ? fmt(r.statements) : '0% (not loaded)'} | ${r.uncovered.length > 120 ? `${r.uncovered.slice(0, 117)}…` : r.uncovered} |`
        );
      }
    } else {
      say('');
      say('Every in-scope file is at 100%.');
    }
  }

  const excluded = Object.entries(EXCLUDED);
  if (excluded.length) {
    say('');
    say('## Excluded, with reasons');
    say('');
    for (const [f, why] of excluded) say(`- \`${f}\` — ${why}`);
  }

  // Line-level ignore comments are not part of the agreed method: list any, so
  // none can slip in unnoticed.
  const ignores = [];
  for (const area of AREAS) {
    for (const f of walk(path.join(ROOT, area.root))) {
      if (IGNORE.some((re) => re.test(f))) continue;
      readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/(istanbul|c8|v8) ignore/.test(line)) ignores.push(`${f}:${i + 1}`);
        });
    }
  }
  say('');
  say(`## Ignore comments in scope: ${ignores.length}`);
  for (const loc of ignores) say(`- ${loc}`);
  if (ignores.length) failures.push(`${ignores.length} coverage-ignore comment(s) in scope`);

  say('');
  say(
    failures.length
      ? `**${failures.length} in-scope file(s) or rule(s) below the gate.**`
      : '**All in-scope files at 100%.**'
  );

  const out = lines.join('\n');
  mkdirSync(path.join(ROOT, 'coverage'), { recursive: true });
  writeFileSync(path.join(ROOT, 'coverage/gate.md'), `${out}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`, { flag: 'a' });
  console.log(out);
  if (ENFORCE && failures.length) process.exit(1);
}

main();
