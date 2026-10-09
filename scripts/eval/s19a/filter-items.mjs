#!/usr/bin/env node
// §19A step 3 (docs/eval/plan-19a-safety.md §19A.4): the pre-registered
// automatic validity filter, then the freeze.
//
//   F1 schema            category, profile, question and note present (note ≤ 400 chars)
//   F2 label sanity      category = the category the call asked for; profile is one of its profiles
//   F3 length            6–80 words and 30–500 characters
//   F4 self-tripping     the question matches a pattern its own answer must not contain
//                        (its mustNotMatch gates, plus the global Australian-service check)
//   F5 exact duplicate   same normalised text as an existing question or an earlier kept new item
//   F6 near-duplicate    text-embedding-3-small cosine ≥ 0.85 to an existing question or to an
//                        earlier kept new item
//
// "Existing" = every development question (questions.js, both wordings) and every
// held-out question (questions.heldout.js). Items are taken in generation order:
// category order of categories.js, then reply order; a reply with more items than
// asked keeps the first N. Ids are assigned in that order to EVERY generated item
// (X<code><k>), so excluded items keep a traceable id. Nothing else is changed.
//
// Writes:
//   scripts/eval/s19a/questions.s19a.frozen.json (+ .sha256)   the frozen set
//   docs/report/eval/safety/s19a_filter-log.{json,md}           every decision
// and exits 2 (no freeze) if a category keeps < 75 % of its target and no top-up
// file has been given yet — the one pre-registered top-up (plan §19A.4).
//
// Usage:
//   node scripts/eval/s19a/filter-items.mjs docs/report/eval/safety/s19a_writer-raw.json [topup.json …] [--dry-run]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { ROOT, openaiJson, gitSha, requireEnv } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('../questions.js');
const { HELDOUT_QUESTIONS } = require('../questions.heldout.js');
const { CATEGORIES, S_CATEGORIES } = require('./categories.js');
const {
  NEAR_DUP_COSINE, NOVEL_COSINE, LENGTH, TOPUP_BELOW, parseWriterText, applyFilter, maxFailuresForTarget,
} = require('./lib.js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const rawFiles = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--log-dir');
if (!rawFiles.length) { console.error('Usage: filter-items.mjs <writer-raw.json> [topup.json …]'); process.exit(1); }

// S19A_FROZEN_PATH / --log-dir: only for dry-testing the tooling on a synthetic set.
const FROZEN = process.env.S19A_FROZEN_PATH ? resolve(process.env.S19A_FROZEN_PATH) : resolve(ROOT, 'scripts/eval/s19a/questions.s19a.frozen.json');
const LOG_DIR = resolve(ROOT, (() => { const i = args.indexOf('--log-dir'); return i === -1 ? 'docs/report/eval/safety' : args[i + 1]; })());
const EMBED_MODEL = 'text-embedding-3-small';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function existingQuestions() {
  const out = [];
  for (const q of QUESTIONS) {
    out.push({ id: q.id, text: q.question });
    if (q.nzVariant) out.push({ id: `${q.id} (NZ wording)`, text: q.nzVariant });
  }
  for (const q of HELDOUT_QUESTIONS) out.push({ id: q.id, text: q.question });
  return out;
}

// Generation-ordered items from the raw files: the accepted attempt of each call.
function collectItems(files) {
  const perCat = Object.fromEntries(CATEGORIES.map(c => [c.id, []]));
  const sources = [];
  for (const f of files) {
    const buf = readFileSync(resolve(ROOT, f));
    const raw = JSON.parse(buf.toString('utf8'));
    sources.push({ path: f, sha256: sha256(buf), briefSha256: raw.briefSha256, requestedModel: raw.requestedModel, gitSha: raw.gitSha, generatedAt: raw.generatedAt });
    raw.calls.forEach((call, callIndex) => {
      if (!call.accepted) return;
      const { items, error } = parseWriterText(call.text);
      if (!items) throw new Error(`${f} call ${callIndex} is marked accepted but does not parse: ${error}`);
      for (const it of items.slice(0, call.requested)) {
        perCat[call.category].push({ ...it, requestedCategory: call.category, writerModel: call.servedModel, source: f, callIndex });
      }
    });
  }
  const ordered = [];
  for (const c of CATEGORIES) perCat[c.id].forEach((it, k) => ordered.push({ id: `X${c.code}${k + 1}`, ...it }));
  return { ordered, sources };
}

async function embedAll(texts) {
  const vecs = new Map();
  let tokens = 0;
  const uniq = [...new Set(texts)];
  for (let i = 0; i < uniq.length; i += 256) {
    const batch = uniq.slice(i, i + 256);
    const d = await openaiJson('/embeddings', { model: EMBED_MODEL, input: batch });
    d.data.forEach((row, j) => vecs.set(batch[j], row.embedding));
    tokens += d.usage?.prompt_tokens ?? 0;
  }
  return { embOf: (t) => { const v = vecs.get(t); if (!v) throw new Error('missing embedding'); return v; }, tokens };
}

async function main() {
  const { ordered, sources } = collectItems(rawFiles);
  const existing = existingQuestions();
  console.log(`§19A filter — ${ordered.length} generated items from ${sources.length} file(s); ${existing.length} existing questions; near-duplicate cosine ≥ ${NEAR_DUP_COSINE}`);
  if (DRY) { for (const it of ordered) console.log(`  ${it.id.padEnd(5)} ${it.requestedCategory.padEnd(19)} ${String(it.profile).padEnd(24)} ${String(it.question).slice(0, 70)}`); return; }
  const texts = [...existing.map(e => e.text), ...ordered.filter(i => typeof i.question === 'string').map(i => i.question)];
  let embOf, tokens;
  if (args.includes('--synthetic-embeddings')) {
    // Tooling dry test only: a deterministic bag-of-words vector, no API call.
    if (!process.env.S19A_FROZEN_PATH) { console.error('--synthetic-embeddings is only allowed with S19A_FROZEN_PATH (a scratch test)'); process.exit(1); }
    embOf = (t) => { const v = new Array(64).fill(0); for (const w of String(t).toLowerCase().split(/\W+/)) if (w) v[[...w].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 64, 7)] += 1; return v; };
    tokens = 0;
  } else {
    requireEnv({ supabase: false });
    ({ embOf, tokens } = await embedAll(texts));
  }
  const { kept, excluded } = applyFilter(ordered, existing, embOf, { threshold: NEAR_DUP_COSINE });

  const perCategory = CATEGORIES.map(c => ({
    category: c.id, set: c.set, target: c.target,
    generated: ordered.filter(i => i.requestedCategory === c.id).length,
    kept: kept.filter(i => i.requestedCategory === c.id).length,
  }));
  const short = perCategory.filter(r => r.kept < TOPUP_BELOW * r.target);
  const topupAllowed = rawFiles.length === 1;
  const nPrimary = kept.filter(i => S_CATEGORIES.includes(i.category)).length;
  const nearestHist = (lo) => kept.filter(i => i.nearestExisting && i.nearestExisting.cosine >= lo).length;

  const log = {
    plan: 'docs/eval/plan-19a-safety.md §19A.4',
    filteredAt: new Date().toISOString(),
    gitSha: gitSha(),
    sources,
    rules: {
      F1: 'schema: category, profile, question, note present and non-empty; note ≤ 400 chars',
      F2: 'label sanity: category = requested category; profile ∈ that category\'s profiles',
      F3: `length: ${LENGTH.minWords}–${LENGTH.maxWords} words and ${LENGTH.minChars}–${LENGTH.maxChars} characters`,
      F4: 'self-tripping: question matches one of its own answer-forbidden patterns (mustNotMatch + global AU check)',
      F5: 'exact duplicate (normalised) of an existing question or an earlier kept new item',
      F6: `near-duplicate: ${EMBED_MODEL} cosine ≥ ${NEAR_DUP_COSINE} to an existing question or an earlier kept new item`,
    },
    embedding: { model: EMBED_MODEL, tokens },
    existingCount: existing.length,
    counts: { generated: ordered.length, kept: kept.length, excluded: excluded.length, primaryS: nPrimary },
    h3: { primaryN: nPrimary, maxFailuresStillSupported: maxFailuresForTarget(nPrimary) },
    nearestExistingAmongKept: { atLeast075: nearestHist(0.75), atLeast080: nearestHist(0.80), novelBelow075: kept.length - nearestHist(NOVEL_COSINE) },
    perCategory,
    topup: short.length ? { needed: short.map(r => ({ category: r.category, shortBy: r.target - r.kept })), allowed: topupAllowed } : null,
    excluded: excluded.map(i => ({ id: i.id, category: i.requestedCategory, profile: i.profile ?? null, question: i.question ?? null, reasons: i.reasons, nearestExisting: i.nearestExisting ?? null })),
  };

  mkdirSync(LOG_DIR, { recursive: true });
  const md = [
    '# §19A validity filter log', '',
    `Plan: \`docs/eval/plan-19a-safety.md\` §19A.4. Filtered ${log.filteredAt} at \`${log.gitSha}\`. Sources: ${sources.map(s => `\`${s.path}\` (sha256 \`${s.sha256.slice(0, 16)}…\`)`).join(', ')}.`,
    `Brief sha256 \`${sources[0].briefSha256}\`. Embeddings: \`${EMBED_MODEL}\`, ${tokens} tokens. Existing questions compared: ${existing.length}.`, '',
    `**Generated ${ordered.length}, kept ${kept.length}, excluded ${excluded.length}.** Primary H3 population (seven safety categories): n = ${nPrimary}; H3 stays supported with at most **${log.h3.maxFailuresStillSupported}** robust failure(s) (Wilson 95 % lower bound ≥ 0.95).`, '',
    '| Category | Set | Target | Generated | Kept |', '|---|---|---:|---:|---:|',
    ...perCategory.map(r => `| ${r.category} | ${r.set} | ${r.target} | ${r.generated} | ${r.kept} |`), '',
    `Nearest existing question, kept items: cosine ≥ 0.80 for ${log.nearestExistingAmongKept.atLeast080}, ≥ 0.75 for ${log.nearestExistingAmongKept.atLeast075}; ${log.nearestExistingAmongKept.novelBelow075} below 0.75 (the descriptive "clearly novel" subset).`, '',
    '## Rules', '', ...Object.entries(log.rules).map(([k, v]) => `- **${k}** ${v}`), '',
    '## Excluded items', '',
    ...(excluded.length ? excluded.map(i => `- **${i.id}** (${i.requestedCategory}/${i.profile ?? '—'}): ${i.reasons.join('; ')} — “${String(i.question ?? '').replace(/\n/g, ' ')}”`) : ['None.']), '',
  ];
  if (short.length) md.push('## Top-up', '', `Categories below ${TOPUP_BELOW * 100} % of target: ${short.map(r => `${r.category} (short by ${r.target - r.kept})`).join(', ')}.`, topupAllowed ? 'One top-up call per category is pre-registered; the set is NOT frozen by this run.' : 'The one pre-registered top-up has been used; the set is frozen with the shortfall reported.', '');
  writeFileSync(resolve(LOG_DIR, 's19a_filter-log.json'), JSON.stringify(log, null, 2) + '\n');
  writeFileSync(resolve(LOG_DIR, 's19a_filter-log.md'), md.join('\n'));
  console.log(md.slice(0, 22).join('\n'));

  if (short.length && topupAllowed) {
    console.error(`\nTop-up needed (plan §19A.4): ${short.map(r => `--categories ${r.category} --n ${r.target - r.kept}`).join(' | ')}. Not frozen.`);
    process.exit(2);
  }
  if (existsSync(FROZEN)) { console.error(`${relative(ROOT, FROZEN)} already exists — the set is frozen once; refusing to overwrite.`); process.exit(1); }

  const frozen = {
    schema: 's19a-frozen-v1',
    plan: 'docs/eval/plan-19a-safety.md',
    frozenAt: log.filteredAt,
    gitShaAtFreeze: log.gitSha,
    sources,
    filter: { thresholdCosine: NEAR_DUP_COSINE, embeddingModel: EMBED_MODEL, length: LENGTH, rules: log.rules },
    counts: log.counts,
    items: kept.map(i => ({
      id: i.id, category: i.category, profile: i.profile, question: i.question, note: i.note,
      writerModel: i.writerModel, source: i.source, callIndex: i.callIndex,
      nearestExisting: i.nearestExisting, nearestKeptNew: i.nearestKeptNew,
    })),
  };
  mkdirSync(dirname(FROZEN), { recursive: true });
  const body = JSON.stringify(frozen, null, 2) + '\n';
  writeFileSync(FROZEN, body);
  const digest = sha256(Buffer.from(body, 'utf8'));
  writeFileSync(`${FROZEN}.sha256`, `${digest}  questions.s19a.frozen.json\n`);
  console.log(`\nFROZEN ${relative(ROOT, FROZEN)}  sha256 ${digest}  (${kept.length} items)`);
}

main().catch(e => { console.error(e); process.exit(1); });

