#!/usr/bin/env node
// Blinded human rating sheets. Samples a fixed, stratified subset of answers
// from one or more generation runs, shuffles them with a seed, numbers them,
// and writes (a) a CSV the rater fills in, (b) a readable Markdown companion
// with the rubric text, passages and reference material, and (c) a separate
// KEY file mapping item numbers back to condition/id/sample. Raters never open
// the key; scripts/eval/agreement.mjs joins on it.
//
// The sample is deterministic in (files, sets, per-condition, seed), so every
// rater gets the SAME items — required for inter-rater kappa.
//
//   node scripts/eval/human-sheet.mjs docs/report/eval/generation_<sha>_v2.json docs/report/eval/generation_<sha>_p0.json \
//        [--per-condition 10] [--sets A,A-neighbour,B,N,S,J] [--dims groundedness,correctness,helpfulness,tone,safety]
//        [--seed 42] [--tag round1] [--rater R1] [--out-dir docs/report/eval/human] [--no-passages] [--heldout]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, fetchChunks, sleep, ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const { DIMENSIONS, applicableDimensions } = require('./judges/rubrics.js');
const { columnKey } = require('./lib/aggregate.js');
const { seededShuffle } = require('./lib/stats.js');
const { toCsv } = require('./lib/csv.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const flagArgs = new Set(['--per-condition', '--sets', '--dims', '--seed', '--tag', '--rater', '--out-dir']);
const files = args.filter((a, i) => !a.startsWith('--') && !flagArgs.has(args[i - 1]));
if (!files.length) { console.error('Usage: node scripts/eval/human-sheet.mjs <generation.json> [...]'); process.exit(1); }

const PER_CONDITION = Number(argVal('--per-condition') ?? 10);
const SETS = (argVal('--sets') ?? 'A,A-neighbour,B,N,S,J').split(',');
const DIMS = (argVal('--dims') ?? 'groundedness,correctness,helpfulness,tone,safety').split(',');
const SEED = Number(argVal('--seed') ?? 42);
const TAG = argVal('--tag') ?? 'round1';
const RATER = argVal('--rater') ?? 'rater';
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/human');
const NO_PASSAGES = args.includes('--no-passages');
const CACHE_PATH = resolve(ROOT, '.cache/eval/chunks.json');

const pool = [...QUESTIONS];
if (args.includes('--heldout')) {
  const p = resolve(ROOT, 'scripts/eval/questions.heldout.js');
  if (existsSync(p)) pool.push(...require(p).HELDOUT_QUESTIONS);
}
const byId = Object.fromEntries(pool.map(q => [q.id, q]));

let chunkCache = {};
if (existsSync(CACHE_PATH)) { try { chunkCache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { chunkCache = {}; } }

// Every k-th row after sorting by id within each set, quota proportional to set size.
function stratifiedSample(rows, quota) {
  const bySet = {};
  for (const r of rows) (bySet[byId[r.id].set] ??= []).push(r);
  const total = rows.length;
  const picked = [];
  const sets = Object.keys(bySet).sort();
  let remaining = quota;
  sets.forEach((set, i) => {
    const group = bySet[set].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) || (a.sample ?? 0) - (b.sample ?? 0));
    const share = i === sets.length - 1 ? remaining : Math.max(1, Math.round(quota * group.length / total));
    const n = Math.min(share, group.length, remaining);
    const step = Math.max(1, Math.floor(group.length / n));
    const chosen = group.filter((_, j) => j % step === 0).slice(0, n);
    picked.push(...chosen);
    remaining -= chosen.length;
  });
  return picked;
}

async function main() {
  const items = [];
  for (const f of files) {
    const run = JSON.parse(readFileSync(resolve(ROOT, f), 'utf8'));
    const column = columnKey(run);
    const rows = run.rows.filter(r => byId[r.id] && SETS.includes(byId[r.id].set));
    for (const r of stratifiedSample(rows, PER_CONDITION)) items.push({ column, file: basename(f), row: r, q: byId[r.id], dims: applicableDimensions(byId[r.id], r, DIMS) });
  }
  const shuffled = seededShuffle(items, SEED).map((it, i) => ({ ...it, item: i + 1 }));

  if (!NO_PASSAGES) {
    const ids = [...new Set(shuffled.flatMap(it => [...it.row.retrieved.map(c => c.id), ...(it.q.relevant ?? []), ...(it.q.acceptable ?? [])]))].filter(id => !id.startsWith('INJECT:') && !chunkCache[id]);
    if (ids.length) {
      try {
        requireEnv({ openai: false });
        for (let i = 0; i < ids.length; i += 40) {
          const got = await fetchChunks(ids.slice(i, i + 40));
          for (const c of got) chunkCache[c.id] = { title: c.title, content: c.content, source_org: c.source_org ?? null };
          await sleep(100);
        }
        mkdirSync(resolve(CACHE_PATH, '..'), { recursive: true });
        writeFileSync(CACHE_PATH, JSON.stringify(chunkCache));
      } catch (e) { console.warn(`passages unavailable (${e.message.slice(0, 80)}) — sheet written without them`); }
    }
  }
  const passage = (id, q) => {
    if (id.startsWith('INJECT:')) { const p = q.injectedPassages?.[Number(id.split(':')[2])]; return p ? `**${p.title}** — ${p.source_org}\n\n${p.content}` : ''; }
    const c = chunkCache[id];
    return c ? `**${c.title}**${c.source_org ? ` — ${c.source_org}` : ''}\n\n${c.content}` : `*${id}* (text not available offline)`;
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const sheetRows = shuffled.map(it => ({ item: it.item, set: it.q.set, question: it.row.question, answer: it.row.answer, ...Object.fromEntries(DIMS.map(d => [d, it.dims.includes(d) ? '' : 'n/a'])), notes: '' }));
  const sheetPath = resolve(OUT_DIR, `human-sheet_${TAG}_${RATER}.csv`);
  writeFileSync(sheetPath, toCsv(sheetRows, ['item', 'set', 'question', 'answer', ...DIMS, 'notes']));

  const md = [`# Human rating sheet — ${TAG} — rater ${RATER}`, '',
    'Score each item on every dimension that is not marked n/a, using ONLY the rubric below (0, 1 or 2). Record scores in the CSV of the same name. Do not open the KEY file. Citation markers such as [1]/[S2] and "Sources:" lists should be ignored for every dimension except groundedness.',
    '', '## Rubric', ''];
  for (const d of DIMS) md.push(`### ${DIMENSIONS[d].label}`, '', DIMENSIONS[d].rubric, '');
  md.push('---', '');
  for (const it of shuffled) {
    md.push(`## Item ${it.item}`, '', `**Dimensions:** ${it.dims.join(', ') || '(none)'}`, '', `**Question:** ${it.row.question}`, '');
    md.push('<details><summary>Passages the assistant was given</summary>', '');
    md.push(it.row.retrieved.length ? it.row.retrieved.map(c => passage(c.id, it.q)).join('\n\n---\n\n') : '(none — the assistant answered without passages)', '', '</details>', '');
    const refIds = [...(it.q.relevant ?? []), ...(it.q.acceptable ?? [])];
    if (refIds.length && it.dims.includes('correctness')) {
      md.push('<details><summary>Reference material (human-labelled correct guidance)</summary>', '', refIds.map(id => passage(id, it.q)).join('\n\n---\n\n'), '', '</details>', '');
    }
    md.push('**Answer:**', '', it.row.answer.split('\n').map(l => `> ${l}`).join('\n'), '');
  }
  const mdPath = resolve(OUT_DIR, `human-sheet_${TAG}_${RATER}.md`);
  writeFileSync(mdPath, md.join('\n') + '\n');

  const keyPath = resolve(OUT_DIR, `human-sheet_${TAG}_KEY.csv`);
  writeFileSync(keyPath, toCsv(shuffled.map(it => ({ item: it.item, column: it.column, id: it.row.id, sample: it.row.sample ?? 0, set: it.q.set, file: it.file })), ['item', 'column', 'id', 'sample', 'set', 'file']));

  const perColumn = {};
  for (const it of shuffled) perColumn[it.column] = (perColumn[it.column] ?? 0) + 1;
  console.log(`${shuffled.length} items (${Object.entries(perColumn).map(([k, v]) => `${k}: ${v}`).join(', ')}), seed ${SEED}`);
  console.log(`Wrote ${sheetPath}\n      ${mdPath}\n      ${keyPath}  ← keep closed until scoring is done`);
}
main().catch(e => { console.error(e); process.exit(1); });
