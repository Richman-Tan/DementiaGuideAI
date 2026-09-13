#!/usr/bin/env node
// Join generation runs, judge CSVs and pairwise results into the report
// tables (docs/eval/evaluation-plan.md §5 E2 / §14). Deterministic; no network.
//
//   node scripts/eval/report-tables.mjs docs/report/eval/generation_<sha>_v2.json docs/report/eval/generation_<sha>_p0.json ... \
//        [--judge docs/report/eval/judge_*.csv ...] [--pairwise docs/report/eval/pairwise_*.json ...] \
//        [--reference v2] [--heldout] [--tag final] [--out-dir docs/report/eval/final]
//
// Table A — deterministic per column: answers, refusal / leak / escalation rates,
//           citation precision, invented numbers, length, readability, jargon
//           definitions, helpline signposting, truncation.
// Table B — judge scores per (judge model, column, dimension): n, mean, counts,
//           and a paired Wilcoxon signed-rank vs the reference column on the
//           shared (id, sample) rows with the matched-pairs rank-biserial r.
// Table C — pairwise win rates from judge-pairwise.mjs JSON summaries.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const { aggregateRun, flagRates, uniqueKeys } = require('./lib/aggregate.js');
const { textMetrics } = require('./lib/textMetrics.js');
const { parseCsv } = require('./lib/csv.js');
const { summary, wilson, wilcoxonSignedRank, mean } = require('./lib/stats.js');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const argAll = (name) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === name) { let j = i + 1; while (j < args.length && !args[j].startsWith('--')) out.push(args[j++]); } return out; };
const JUDGE = argAll('--judge'), PAIRWISE = argAll('--pairwise');
const consumed = new Set([...JUDGE, ...PAIRWISE, argVal('--reference'), argVal('--tag'), argVal('--out-dir')].filter(Boolean));
const GEN = args.filter(a => !a.startsWith('--') && !consumed.has(a));
const REFERENCE = argVal('--reference') ?? 'v2';
const TAG = argVal('--tag') ?? new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/final');
const ALLOWLIST = existsSync(resolve(ROOT, 'scripts/eval/fixtures/phone-allowlist.json')) ? JSON.parse(readFileSync(resolve(ROOT, 'scripts/eval/fixtures/phone-allowlist.json'), 'utf8')).numbers : null;

const pool = [...QUESTIONS];
if (args.includes('--heldout')) { const p = resolve(ROOT, 'scripts/eval/questions.heldout.js'); if (existsSync(p)) pool.push(...require(p).HELDOUT_QUESTIONS); }
const byId = Object.fromEntries(pool.map(q => [q.id, q]));

const pct = (w) => (w && w.p != null ? `${(100 * w.p).toFixed(1)}% (${w.k}/${w.n})` : '—');
const md = [`# Evaluation tables — ${TAG}`, ''];

// ── Table A ───────────────────────────────────────────────────────────────────
if (GEN.length) {
  const cols = uniqueKeys(GEN.map(f => { const run = JSON.parse(readFileSync(resolve(ROOT, f), 'utf8')); const c = aggregateRun(run, byId, { phoneAllowlist: ALLOWLIST }); c.run = run; c.file = f; return c; }));
  md.push('## Table A — deterministic measures per condition', '', 'Rates are per answer; brackets are counts. Length and readability are over citation-stripped text.', '');
  md.push(`| Measure | ${cols.map(c => c.key).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
  const flags = cols.map(c => flagRates(c));
  const tm = cols.map(c => c.run.rows.filter(r => byId[r.id]).map(r => ({ q: byId[r.id], m: textMetrics(r.answer), r })));
  const rowsA = [
    ['Answers (items × samples)', cols.map(c => `${c.rows.length} (${c.items.size} × ${c.samples})`)],
    ['Model / temperature', cols.map(c => `${c.run.model ?? ''} / ${c.run.temperature ?? ''}`)],
    ['Retrieval', cols.map(c => c.retrievalMode)],
    ['Knowledge-base refusal, in-scope items', flags.map(f => pct(f.refusalInScope))],
    ['111 in first sentence, emergency items', flags.map(f => pct(f.first111))],
    ['Foreign emergency number', flags.map(f => pct(f.foreignEmergency))],
    ['Dose stated (mg/mcg)', flags.map(f => pct(f.doseLeak))],
    ['Australian service named', flags.map(f => pct(f.regionLeak))],
    ['System-prompt leak', flags.map(f => pct(f.promptLeak))],
    ['Phone number not in the verified NZ list', flags.map(f => pct(f.unknownPhones))],
    ['Citation precision (markers)', flags.map(f => f.citationPrecision ? `${(100 * f.citationPrecision.p).toFixed(1)}% (${f.citationPrecision.k}/${f.citationPrecision.n})` : '— (no markers)')],
    ['Answers with any citation marker or Sources list', tm.map(t => pct(wilson(t.filter(x => x.m.citationMarkers > 0 || x.m.hasTrailingSources).length, t.length)))],
    ['Words per answer (median, p90)', tm.map(t => { const s = summary(t.map(x => x.m.words)); return `${Math.round(s.median)}, ${Math.round(s.p90)}`; })],
    ['Flesch–Kincaid grade (median)', tm.map(t => { const s = summary(t.map(x => x.m.fkGrade).filter(x => x != null)); return s.n ? s.median.toFixed(1) : '—'; })],
    ['Jargon definitions per answer (mean)', tm.map(t => mean(t.map(x => x.m.jargonDefinitions)).toFixed(2))],
    ['Mentions GP/doctor', tm.map(t => pct(wilson(t.filter(x => x.m.helplines.gp_or_doctor).length, t.length)))],
    ['Mentions Healthline', tm.map(t => pct(wilson(t.filter(x => x.m.helplines.healthline).length, t.length)))],
    ['Mentions Alzheimers NZ', tm.map(t => pct(wilson(t.filter(x => x.m.helplines.alzheimers_nz).length, t.length)))],
    ['Truncated at max_tokens', cols.map(c => pct(wilson(c.run.rows.filter(r => r.finishReason === 'length').length, c.run.rows.length)))],
  ];
  for (const [label, vals] of rowsA) md.push(`| ${label} | ${vals.join(' | ')} |`);
  md.push('');
}

// ── Table B ───────────────────────────────────────────────────────────────────
if (JUDGE.length) {
  const judgeRows = JUDGE.flatMap(f => parseCsv(readFileSync(resolve(ROOT, f), 'utf8')).map(r => ({ ...r, judge: basename(f).replace(/^judge_/, '').split('_')[0], score: r.score === '' ? null : Number(r.score) })));
  const judges = [...new Set(judgeRows.map(r => r.judge))];
  md.push('## Table B — judge scores per condition (0/1/2)', '', `Paired Wilcoxon signed-rank against the reference column (${REFERENCE}) on shared (id, sample) rows; r = matched-pairs rank-biserial (positive = reference scores higher). n < 10 pairs: statistic reported, defer to exact tables.`, '');
  md.push('| Judge | Column | Dimension | n | mean | 0 / 1 / 2 | vs reference: n pairs | Δ mean | W+ / W− | p | r |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const judge of judges) {
    const rows = judgeRows.filter(r => r.judge === judge && r.score != null);
    const columns = [...new Set(rows.map(r => r.column))];
    const dims = [...new Set(rows.map(r => r.dimension))];
    const refCol = columns.find(c => c === REFERENCE || c.startsWith(`${REFERENCE}:`)) ?? null;
    for (const col of columns) for (const dim of dims) {
      const rs = rows.filter(r => r.column === col && r.dimension === dim);
      if (!rs.length) continue;
      const counts = [0, 1, 2].map(s => rs.filter(r => r.score === s).length);
      let paired = '—', dmean = '—', w = '—', p = '—', rb = '—';
      if (refCol && col !== refCol) {
        const ref = new Map(rows.filter(r => r.column === refCol && r.dimension === dim).map(r => [`${r.id}#${r.sample}`, r.score]));
        const diffs = rs.filter(r => ref.has(`${r.id}#${r.sample}`)).map(r => ref.get(`${r.id}#${r.sample}`) - r.score);
        if (diffs.length) {
          const t = wilcoxonSignedRank(diffs);
          paired = String(diffs.length); dmean = mean(diffs).toFixed(2); w = `${t.wPlus} / ${t.wMinus}`; p = t.p.toFixed(4) + (t.note ? '*' : ''); rb = t.rankBiserial.toFixed(2);
        }
      }
      md.push(`| ${judge} | ${col} | ${dim} | ${rs.length} | ${mean(rs.map(r => r.score)).toFixed(2)} | ${counts.join(' / ')} | ${paired} | ${dmean} | ${w} | ${p} | ${rb} |`);
    }
  }
  md.push('', '* n < 10 pairs — normal approximation not reliable.', '');
}

// ── Table C ───────────────────────────────────────────────────────────────────
if (PAIRWISE.length) {
  md.push('## Table C — pairwise preference (position-swapped, blinded)', '', '| Judge | A | B | Dimension | A wins | B wins | ties | inconsistent | A win rate (decisive) | sign test p |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const f of PAIRWISE) {
    const j = JSON.parse(readFileSync(resolve(ROOT, f), 'utf8'));
    for (const [dim, s] of Object.entries(j.summary)) {
      md.push(`| ${j.judgeModel} | ${j.a.key} | ${j.b.key} | ${dim} | ${s.winsA} | ${s.winsB} | ${s.ties} | ${s.inconsistent} | ${s.winRateA.p == null ? '—' : `${(100 * s.winRateA.p).toFixed(1)}% [${(100 * s.winRateA.lo).toFixed(1)}–${(100 * s.winRateA.hi).toFixed(1)}]`} | ${s.signTest.p.toFixed(4)} |`);
    }
  }
  md.push('');
}

mkdirSync(OUT_DIR, { recursive: true });
const out = resolve(OUT_DIR, `tables_${TAG}.md`);
writeFileSync(out, md.join('\n') + '\n');
console.log(md.join('\n'));
console.log(`Wrote ${out}`);
