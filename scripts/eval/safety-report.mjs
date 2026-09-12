#!/usr/bin/env node
// Safety report over one or more generation runs: per-item ROBUST pass rates
// (every sample passes) and sample-level rates with Wilson 95% intervals, the
// 111-first escalation rate, leak rates (dose / foreign emergency / Australian
// services / prompt), in-scope refusal rate, suspected invented phone numbers,
// citation precision, and a paired McNemar comparison between two runs.
// Deterministic — no LLM, no network.
//
// Every failure is listed verbatim so a human can read it (the gates are
// necessary, not sufficient: docs/eval/evaluation-plan.md §8).
//
//   node scripts/eval/safety-report.mjs docs/report/eval/generation_<sha>_v2*.json docs/report/eval/generation_<sha>_v1*.json \
//        [--compare v1,v2] [--heldout] [--phone-allowlist scripts/eval/fixtures/phone-allowlist.json] [--tag name] [--out-dir docs/report/eval/final]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, csvEscape } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const { aggregateRun, rateTable, flagRates, compareColumns, uniqueKeys } = require('./lib/aggregate.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const flagArgs = new Set(['--compare', '--phone-allowlist', '--tag', '--out-dir']);
const files = args.filter((a, i) => !a.startsWith('--') && !flagArgs.has(args[i - 1]));
if (!files.length) { console.error('Usage: node scripts/eval/safety-report.mjs <generation.json> [...] [--compare a,b]'); process.exit(1); }

const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/final');
const TAG = argVal('--tag') ?? new Date().toISOString().slice(0, 10);
const ALLOWLIST_PATH = argVal('--phone-allowlist') ?? 'scripts/eval/fixtures/phone-allowlist.json';
const COMPARE = argVal('--compare')?.split(',') ?? null;

const pool = [...QUESTIONS];
if (args.includes('--heldout')) {
  const p = resolve(ROOT, 'scripts/eval/questions.heldout.js');
  if (existsSync(p)) pool.push(...require(p).HELDOUT_QUESTIONS);
}
const byId = Object.fromEntries(pool.map(q => [q.id, q]));
const allowlist = existsSync(resolve(ROOT, ALLOWLIST_PATH)) ? JSON.parse(readFileSync(resolve(ROOT, ALLOWLIST_PATH), 'utf8')).numbers : null;

const pct = (w) => w && w.p != null ? `${(100 * w.p).toFixed(1)}% [${(100 * w.lo).toFixed(1)}–${(100 * w.hi).toFixed(1)}] (${w.k}/${w.n})` : '—';

const columns = files.map(f => {
  const run = JSON.parse(readFileSync(resolve(ROOT, f), 'utf8'));
  const col = aggregateRun(run, byId, { phoneAllowlist: allowlist });
  col.file = f;
  col.gitSha = run.gitSha;
  col.model = run.model;
  col.temperature = run.temperature;
  return col;
});
uniqueKeys(columns);
const withHeldout = (label, item) => (item.heldout ? `${label} (held-out)` : label);

const md = [];
md.push(`# Safety report — ${TAG}`, '');
md.push('Item = one question; an item passes ROBUSTLY only when every sample passes. Sample rate = share of all answers passing. 95% Wilson intervals in brackets.', '');
md.push('| Column | File | Condition | Retrieval | Region | Model | Temp | Samples | Items | Answers |', '|---|---|---|---|---|---|---|---|---|---|');
for (const c of columns) md.push(`| ${c.key} | ${c.file.replace(/^.*\//, '')} | ${c.condition} | ${c.retrievalMode} | ${c.region} | ${c.model ?? ''} | ${c.temperature ?? ''} | ${c.samples} | ${c.items.size} | ${c.rows.length} |`);
md.push('');

function section(title, groupOf, filterSets) {
  md.push(`## ${title}`, '');
  const groups = new Set();
  const tables = columns.map(c => { const t = rateTable(c, groupOf); Object.keys(t).forEach(g => groups.add(g)); return t; });
  const gs = [...groups].filter(g => !filterSets || filterSets.has(g)).sort();
  md.push(`| Group | ${columns.map(c => `${c.key} robust`).join(' | ')} | ${columns.map(c => `${c.key} samples`).join(' | ')} |`);
  md.push(`|---|${columns.map(() => '---').join('|')}|${columns.map(() => '---').join('|')}|`);
  for (const g of gs) {
    md.push(`| ${g} | ${tables.map(t => pct(t[g]?.robust)).join(' | ')} | ${tables.map(t => pct(t[g]?.sampleRate)).join(' | ')} |`);
  }
  md.push('');
}
section('Pass rate by set', item => withHeldout(item.set, item));
section('Pass rate by category (safety-relevant sets)', item => withHeldout(item.category, item),
  new Set(pool.filter(q => ['S', 'I', 'J', 'B', 'N'].includes(q.set)).flatMap(q => [q.category, `${q.category} (held-out)`])));

md.push('## Behaviour rates (per answer)', '');
md.push(`| Rate | ${columns.map(c => c.key).join(' | ')} |`, `|---|${columns.map(() => '---').join('|')}|`);
const flagTable = columns.map(c => flagRates(c));
const rows = [
  ['111 in first sentence (emergency items)', 'first111'],
  ['111 anywhere (emergency items)', 'has111'],
  ['Foreign emergency number (000/911/999)', 'foreignEmergency'],
  ['Medication dose stated (mg/mcg)', 'doseLeak'],
  ['Australian service named', 'regionLeak'],
  ['System-prompt text leaked', 'promptLeak'],
  ['Knowledge-base refusal on in-scope items', 'refusalInScope'],
  ['Suspected invented phone number', 'unknownPhones'],
  ['Empty answer', 'empty'],
];
for (const [label, key] of rows) md.push(`| ${label} | ${flagTable.map(f => pct(f[key])).join(' | ')} |`);
md.push(`| Citation precision (valid markers / all markers) | ${flagTable.map(f => f.citationPrecision ? `${(100 * f.citationPrecision.p).toFixed(1)}% (${f.citationPrecision.k}/${f.citationPrecision.n})` : '— (no markers)').join(' | ')} |`);
md.push('');

if (COMPARE) {
  const [aKey, bKey] = COMPARE;
  const a = columns.find(c => c.key === aKey || c.condition === aKey);
  const b = columns.find(c => c.key === bKey || c.condition === bKey);
  if (!a || !b) { console.error(`--compare: could not find both columns among ${columns.map(c => c.key).join(', ')}`); process.exit(1); }
  const cmp = compareColumns(a, b);
  md.push(`## Paired comparison — ${cmp.a} vs ${cmp.b} (item robust pass)`, '');
  md.push(`| Items | Both pass | Neither | Pass in ${cmp.a} only | Pass in ${cmp.b} only | McNemar exact p | χ² (cc) |`, '|---|---|---|---|---|---|---|');
  md.push(`| ${cmp.n} | ${cmp.both} | ${cmp.neither} | ${cmp.passA_failB} | ${cmp.failA_passB} | ${cmp.mcnemar.exactP.toFixed(4)} | ${cmp.mcnemar.chi2?.toFixed(2) ?? '—'} |`, '');
  if (cmp.discordant.length) {
    md.push('Discordant items: ' + cmp.discordant.map(d => `${d.id} (passes in ${d.passIn})`).join(', '), '');
  }
}

md.push('## Failures (every failing answer, verbatim assertion)', '');
for (const c of columns) {
  const failing = c.rows.filter(r => !r.pass);
  md.push(`### ${c.key} — ${failing.length} failing answer(s)`, '');
  for (const r of failing) md.push(`- **${r.id}${c.samples > 1 ? `#${r.sample}` : ''}** (${r.category}): ${r.failures.join('; ')}`);
  if (allowlist) {
    const phones = c.rows.filter(r => r.flags.unknownPhones?.length);
    if (phones.length) md.push('', 'Suspected invented numbers: ' + phones.map(r => `${r.id}${c.samples > 1 ? `#${r.sample}` : ''} → ${r.flags.unknownPhones.join(', ')}`).join('; '));
  }
  md.push('');
}

mkdirSync(OUT_DIR, { recursive: true });
const mdPath = resolve(OUT_DIR, `safety-report_${TAG}.md`);
writeFileSync(mdPath, md.join('\n') + '\n');

const csvLines = ['column,id,sample,set,category,pass,first111,has111,foreign_emergency,dose_leak,region_leak,prompt_leak,refusal,unknown_phones,cited_markers,hallucinated_markers,failures'];
for (const c of columns) {
  for (const r of c.rows) {
    csvLines.push([c.key, r.id, r.sample, r.set, r.category, r.pass ? 1 : 0,
      r.flags.expects111First ? (r.flags.first111 ? 1 : 0) : '', r.flags.expects111First ? (r.flags.has111 ? 1 : 0) : '',
      r.flags.foreignEmergency ? 1 : 0, r.flags.doseLeak ? 1 : 0, r.flags.regionLeak ? 1 : 0, r.flags.promptLeak ? 1 : 0, r.flags.refusal ? 1 : 0,
      (r.flags.unknownPhones ?? []).join('|'), r.citedMarkers, r.hallucinatedMarkers, r.failures.join('; ')].map(csvEscape).join(','));
  }
}
const csvPath = resolve(OUT_DIR, `safety-report_${TAG}.csv`);
writeFileSync(csvPath, csvLines.join('\n') + '\n');

console.log(md.join('\n'));
console.log(`\nWrote ${mdPath}\n      ${csvPath}`);
