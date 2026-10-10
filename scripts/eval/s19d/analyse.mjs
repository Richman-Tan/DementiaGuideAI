#!/usr/bin/env node
// §19D analysis (docs/eval/plan-19d-neutral-prompt.md, E3-N). Deterministic: no
// LLM, no network. Scores every answer with the unchanged checkRow()
// (scripts/eval/lib/checks.js, via lib/aggregate.js, as §19A did) and with the
// §19D locality measures (scripts/eval/s19d/locality.js), runs the paired tests,
// and prints the pre-registered expectation verdicts and the decision on
// contribution 1.
//
//   node scripts/eval/s19d/analyse.mjs \
//     --a  docs/report/eval/safety/generation_33e1aa5_v2_s19a.json \
//     --c  docs/report/eval/safety/generation_33e1aa5_v2-nohelplines_s19a.json \
//     --d  docs/report/eval/safety/generation_33e1aa5_v2-nopersona-nohelplines_s19a.json \
//     --n  docs/report/eval/safety/generation_<P>_v2-neutral_s19d.json \
//     --n0 docs/report/eval/safety/generation_<P>_v2-neutral_none_s19d.json \
//     --corpus docs/report/eval/safety/s19d_corpus-locality_before-generation.json \
//     --tag <P>
// --n0 is optional (the no-retrieval condition); everything that needs it is
// then reported as not run. Never computes or reports any LLM-judge score.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, csvEscape, gitSha } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('../questions.js');
const { HELDOUT_QUESTIONS } = require('../questions.heldout.js');
const { S19A_QUESTIONS, S19A_SHA256 } = require('../questions.s19a.js');
const { aggregateRun } = require('../lib/aggregate.js');
const { FAMILIES } = require('../s19a/categories.js');
const { localityOf, questionHasNzCue } = require('./locality.js');
const { pairedTest, holmFamily, expectationVerdicts, contributionVerdict, THRESHOLDS } = require('./decide.js');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/safety');
const TAG = argVal('--tag') ?? gitSha();
const PRICES = JSON.parse(readFileSync(resolve(ROOT, 'scripts/eval/pricing.2026-09.json'), 'utf8')).openai;
const ALLOWLIST = JSON.parse(readFileSync(resolve(ROOT, 'scripts/eval/fixtures/phone-allowlist.json'), 'utf8')).numbers;

const load = (p) => { const abs = resolve(ROOT, p); if (!existsSync(abs)) { console.error(`missing ${p}`); process.exit(1); } return { path: p, run: JSON.parse(readFileSync(abs, 'utf8')) }; };
for (const k of ['a', 'c', 'd', 'n']) if (!argVal(`--${k}`)) { console.error(`--${k} is required`); process.exit(1); }
const files = Object.fromEntries(['a', 'c', 'd', 'n', 'n0'].filter(k => argVal(`--${k}`)).map(k => [k, load(argVal(`--${k}`))]));
const corpus = argVal('--corpus') ? load(argVal('--corpus')).run : null;
const KEYS = Object.keys(files);
const LABEL = { a: '(a) v2', c: '(c) − helplines, 111', d: '(d) − persona, warmth, helplines, 111', n: '(n) neutral', n0: '(n0) neutral, no retrieval' };

const pool = [...QUESTIONS, ...HELDOUT_QUESTIONS, ...S19A_QUESTIONS];
const byId = Object.fromEntries(pool.map(q => [q.id, q]));
const NEW_IDS = new Set(S19A_QUESTIONS.map(q => q.id));
const ORIGINAL_HELDOUT_IDS = new Set(HELDOUT_QUESTIONS.map(q => q.id));

const cols = Object.fromEntries(KEYS.map(k => [k, aggregateRun(files[k].run, byId)]));
const inScope = (id) => NEW_IDS.has(id) || ORIGINAL_HELDOUT_IDS.has(id);
const ids = [...cols.a.items.keys()].filter(id => inScope(id) && KEYS.every(k => cols[k].items.has(id)));
const missing = {};
for (const k of KEYS) missing[k] = [...cols.a.items.keys()].filter(id => inScope(id) && !cols[k].items.has(id));
const rowOf = (k, id) => files[k].run.rows.find(r => r.id === id && (r.sample ?? 0) === 0);
const answerOf = (k, id) => rowOf(k, id)?.answer ?? '';
const loc = Object.fromEntries(KEYS.map(k => [k, Object.fromEntries(ids.map(id => [id, localityOf(answerOf(k, id), { phoneAllowlist: ALLOWLIST })]))]));
const passOf = (k, id) => cols[k].items.get(id).robustPass;

const famIds = (fam) => ids.filter(id => FAMILIES[fam].includes(byId[id].category));
const EMERGENCY = ids.filter(id => cols.a.items.get(id).expects111First);
const SIGNPOST = famIds('signposting');
const CRISIS = ids.filter(id => byId[id].category === 'carer-crisis');

// Retrieved-passage context (metadata only, from the corpus snapshot).
const idSet = (name) => new Set(corpus?.chunkIdsWith?.[name] ?? []);
const CH111 = idSet('has111'), CHFS = idSet('foreignSignpost'), CHFO = idSet('foreignOrg');
const retrievedIds = (k, id) => (rowOf(k, id)?.retrieved ?? []).map(x => x.id);
const retrievedHas = (set, id) => retrievedIds('n', id).some(x => set.has(x));

// ── Measures (binary per item) ──────────────────────────────────────────────
const MEASURES = {
  M1: { name: 'Item passes every gate (checkRow)', ids, of: (k, id) => passOf(k, id) },
  M2: { name: 'Answer is foreign (000/911/999, an Australian service, or a NEW foreign signpost)', ids, of: (k, id) => loc[k][id].foreign },
  M3: { name: '111 named anywhere, emergency items', ids: EMERGENCY, of: (k, id) => loc[k][id].has111 },
  M4: { name: '111 in the first sentence, emergency items', ids: EMERGENCY, of: (k, id) => loc[k][id].first111 },
  M5: { name: 'NZ helpline or 111 named, signposting family (carer-crisis + nz-services)', ids: SIGNPOST, of: (k, id) => loc[k][id].helplineNamed },
};
const count = (m, k) => MEASURES[m].ids.filter(id => MEASURES[m].of(k, id)).length;

// ── Paired tests: exact McNemar, Holm within each family per measure ────────
const FAMILY_DEFS = {
  F1: { name: 'primary', pairs: [['n', 'd'], ['n', 'n0']] },
  F2: { name: 'secondary', pairs: [['a', 'n'], ['c', 'n']] },
};
const tests = {};
for (const m of Object.keys(MEASURES)) {
  tests[m] = {};
  for (const [f, def] of Object.entries(FAMILY_DEFS)) {
    const list = def.pairs.filter(([x, y]) => files[x] && files[y]).map(([x, y]) => pairedTest(x, y, MEASURES[m].ids, MEASURES[m].of));
    tests[m][f] = holmFamily(list);
  }
}
const testOf = (m, x, y) => Object.values(tests[m]).flat().find(t => t.x === x && t.y === y) ?? null;

// ── Expectations and decision ───────────────────────────────────────────────
const counts = Object.fromEntries(Object.keys(MEASURES).map(m => [m, Object.fromEntries(KEYS.map(k => [k, count(m, k)]))]));
const sizes = Object.fromEntries(Object.keys(MEASURES).map(m => [m, MEASURES[m].ids.length]));
const catCount = (cat, k) => ids.filter(id => byId[id].category === cat && passOf(k, id)).length;
const catN = (cat) => ids.filter(id => byId[id].category === cat).length;
const ctx = {
  counts, sizes, testOf, hasN0: !!files.n0,
  keptRules: ['dosing', 'diagnosis'].map(c => ({ category: c, n: catN(c), a: catCount(c, 'a'), n_: catCount(c, 'n') })),
};
const expectations = expectationVerdicts(ctx);
const decision = contributionVerdict(ctx, expectations);

// ── Descriptives ────────────────────────────────────────────────────────────
const pct = (k, n) => (n ? `${(100 * k / n).toFixed(1)} % (${k}/${n})` : '—');
const p4 = (p) => (p == null ? '—' : p < 0.0001 ? '< 0.0001' : p.toFixed(4));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
function spendOf(run) {
  const pt = run.rows.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  const ct = run.rows.reduce((s, r) => s + (r.completionTokens ?? 0), 0);
  const p = PRICES[run.model] ?? PRICES['gpt-4o'];
  return { calls: run.rows.length, promptTokens: pt, completionTokens: ct, usd: (pt * p.input + ct * p.output) / 1e6 };
}
const per = Object.fromEntries(KEYS.map(k => {
  const L = (pred, list = ids) => list.filter(id => pred(loc[k][id], id)).length;
  const scored = cols[k].rows.filter(r => ids.includes(r.id));
  return [k, {
    pass: ids.filter(id => passOf(k, id)).length,
    passOrig: ids.filter(id => ORIGINAL_HELDOUT_IDS.has(id) && passOf(k, id)).length,
    passNew: ids.filter(id => NEW_IDS.has(id) && passOf(k, id)).length,
    foreign: L(x => x.foreign), foreignEmergency: L(x => x.foreignEmergency), auService: L(x => x.auService), foreignSignpost: L(x => x.foreignSignpost),
    foreignOrg: L(x => x.foreignOrg), emergency112: L(x => x.emergency112),
    unknownPhones: L(x => (x.unknownPhones ?? []).length > 0),
    nz: L(x => x.locality === 'nz'), unanchored: L(x => x.locality === 'unanchored'), foreignLoc: L(x => x.locality === 'foreign'),
    escalation: Object.fromEntries(['111', '111+foreign', 'foreign-number', 'generic', 'none'].map(c => [c, L(x => x.escalation === c, EMERGENCY)])),
    crisisHelpline: L(x => x.helplineNamed, CRISIS),
    nzAnchorSignpost: L(x => x.nzAnchor, SIGNPOST),
    dose: scored.filter(r => r.flags.doseLeak).length, leak: scored.filter(r => r.flags.promptLeak).length,
    words: median(ids.map(id => answerOf(k, id).split(/\s+/).filter(Boolean).length)),
    fingerprints: [...new Set(files[k].run.rows.map(r => r.systemFingerprint).filter(Boolean))],
    spend: spendOf(files[k].run),
  }];
}));
const sameRetrievalND = ids.filter(id => JSON.stringify(retrievedIds('n', id)) === JSON.stringify(retrievedIds('d', id))).length;
const cueIds = ids.filter(id => questionHasNzCue(byId[id].question));

// ── Report ──────────────────────────────────────────────────────────────────
const md = [];
md.push('# §19D (E3-N) — jurisdiction-neutral prompt over the NZ knowledge base', '');
md.push(`Generated ${new Date().toISOString()} by \`scripts/eval/s19d/analyse.mjs\` at \`${gitSha()}\` (tag \`${TAG}\`). Plan: \`docs/eval/plan-19d-neutral-prompt.md\`.`);
md.push(`Items: the 56 original held-out items and the frozen §19A set (\`scripts/eval/s19a/questions.s19a.frozen.json\`, sha256 \`${S19A_SHA256}\`), ${ids.length} in all${Object.values(missing).some(l => l.length) ? `; missing: ${Object.entries(missing).filter(([, l]) => l.length).map(([k, l]) => `${k}: ${l.join(', ')}`).join('; ')}` : ''}. One seeded answer per item per condition.`);
md.push(`Scoring: the unchanged deterministic gates (\`checkRow\`) and the §19D locality measures (\`scripts/eval/s19d/locality.js\`; patterns marked NEW were written for §19D before any §19D answer existed). **No LLM judge.** Prices: gpt-4o US$${PRICES['gpt-4o'].input} / ${PRICES['gpt-4o'].output} per 1M input / output tokens (\`scripts/eval/pricing.2026-09.json\`).`, '');
md.push(`Regenerate: \`node scripts/eval/s19d/analyse.mjs ${args.join(' ')}\``, '');
md.push('| Run | File | Condition | Retrieval | Model | Temp | Seed | sha label / actual | Generated | System-prompt sha256 | Fingerprints |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of KEYS) { const r = files[k].run; md.push(`| ${LABEL[k]} | \`${files[k].path}\` | ${r.condition} | ${r.retrievalMode} | ${r.model} | ${r.temperature} | ${r.seed} | ${r.gitSha} / ${r.actualGitSha} | ${r.generatedAt} | ${r.systemPromptSha256?.slice(0, 12)} | ${per[k].fingerprints.join(', ')} |`); }
md.push('');
if (corpus) md.push(`Corpus snapshot used for the retrieved-passage context: \`${argVal('--corpus')}\` (${corpus.chunks} chunks, sha256 \`${corpus.sha256}\`, taken ${corpus.takenAt}). Retrieved passages identical (same ids, same order) under (n) and (d) for **${sameRetrievalND} of ${ids.length}** items.`, '');

md.push('## Results by condition', '');
md.push(`| Measure | ${KEYS.map(k => LABEL[k]).join(' | ')} |`, `|---|${KEYS.map(() => '---:').join('|')}|`);
const row = (name, f) => md.push(`| ${name} | ${KEYS.map(f).join(' | ')} |`);
row(`Items passing every gate (of ${ids.length})`, k => per[k].pass);
row('— original held-out (of 56) / §19A (of 111)', k => `${per[k].passOrig} / ${per[k].passNew}`);
row(`**Foreign answers** (any of the next three)`, k => `**${per[k].foreign}**`);
row('— foreign emergency number 000 / 911 / 999', k => per[k].foreignEmergency);
row('— Australian service (AU_REGION_LEAK)', k => per[k].auService);
row('— foreign signpost (NEW)', k => per[k].foreignSignpost);
row(`**111 named, emergency items (of ${EMERGENCY.length})**`, k => `**${per[k].escalation['111'] + per[k].escalation['111+foreign']}**`);
row(`**111 in the first sentence, emergency items (of ${EMERGENCY.length})**`, k => `**${count('M4', k)}**`);
row(`**NZ helpline or 111 named, signposting family (of ${SIGNPOST.length})**`, k => `**${count('M5', k)}**`);
row(`— carer-crisis only (of ${CRISIS.length})`, k => per[k].crisisHelpline);
row(`Emergency answers: 111 / 111 + foreign / foreign number only / generic "emergency services" or "ambulance", no number / none`, k => Object.values(per[k].escalation).join(' / '));
row(`Answers naming a foreign organisation (NEW, descriptive; often as a source)`, k => per[k].foreignOrg);
row(`Locality of all ${ids.length} answers: NZ-anchored / unanchored / foreign`, k => `${per[k].nz} / ${per[k].unanchored} / ${per[k].foreignLoc}`);
row(`NZ anchor named, signposting family (of ${SIGNPOST.length})`, k => per[k].nzAnchorSignpost);
row('Answers with a phone number not in the verified NZ list', k => per[k].unknownPhones);
row('Answers naming 112 (descriptive; accepted from NZ mobiles)', k => per[k].emergency112);
row('Answers stating a dose / leaking system-prompt text', k => `${per[k].dose} / ${per[k].leak}`);
row('Median words per answer', k => per[k].words);
const S19A_PASS = { a: 163, c: 151, d: 148 }; // as reported in docs/eval/results-2026-10-10-s19.md §19A.3
md.push('', `(a), (c) and (d) are the committed §19A answers, rescored here: items passing every gate ${['a', 'c', 'd'].filter(k => files[k]).map(k => `${k} ${per[k].pass}`).join(', ')} (§19A reported ${Object.entries(S19A_PASS).map(([k, v]) => `${k} ${v}`).join(', ')}). Items whose question itself carries an NZ cue (place, NZ service, Māori kinship word): ${cueIds.length} of ${ids.length}.`, '');

md.push('## Paired tests — exact McNemar, Holm within each family per measure', '');
md.push('F1 (primary, as commissioned): (n) vs (d), (n) vs (n0). F2 (secondary): (a) vs (n), the full effect of every jurisdiction cue; (c) vs (n), the only single-factor contrast (the two prompts differ by the words "New Zealand" alone). "Only x" counts items where the outcome holds under x and not under the other condition.', '');
for (const m of Object.keys(MEASURES)) {
  md.push(`### ${m}. ${MEASURES[m].name} (n = ${MEASURES[m].ids.length})`, '', '| Family | Comparison | x count | y count | Only x | Only y | Exact p | Holm p |', '|---|---|---:|---:|---:|---:|---:|---:|');
  for (const [f, list] of Object.entries(tests[m])) for (const t of list) md.push(`| ${f} | ${LABEL[t.x]} vs ${LABEL[t.y]} | ${t.xCount} | ${t.yCount} | ${t.xOnly} | ${t.yOnly} | ${p4(t.p)} | ${p4(t.pHolm)} |`);
  md.push('');
}

md.push('## Expectations (pre-registered, plan §19D.7)', '', '| # | Expectation | Result | Verdict |', '|---|---|---|---|');
for (const e of expectations) md.push(`| ${e.id} | ${e.text} | ${e.result} | **${e.verdict}** |`);
md.push('', '## Decision on contribution 1 (pre-registered rule, plan §19D.8)', '', `**${decision.verdict}.** ${decision.reason}`, '');

// Mechanism breakdown (descriptive): 111 under (n) by whether a retrieved passage contains 111.
if (corpus) {
  const w = EMERGENCY.filter(id => retrievedHas(CH111, id)), wo = EMERGENCY.filter(id => !retrievedHas(CH111, id));
  md.push('## Where the 111 comes from (descriptive)', '');
  md.push(`Emergency items whose retrieved passages include a chunk that itself contains "111": ${w.length} of ${EMERGENCY.length}.`, '');
  md.push(`| Condition | 111 named, passage has 111 (n ${w.length}) | 111 named, no passage has 111 (n ${wo.length}) |`, '|---|---:|---:|');
  for (const k of KEYS) md.push(`| ${LABEL[k]} | ${w.filter(id => loc[k][id].has111).length} | ${wo.filter(id => loc[k][id].has111).length} |`);
  const fsItems = ids.filter(id => retrievedHas(CHFS, id)), foItems = ids.filter(id => retrievedHas(CHFO, id));
  md.push('', `Items whose retrieved passages name a foreign signpost: ${fsItems.length} (${fsItems.join(', ') || '—'}); a foreign organisation: ${foItems.length} of ${ids.length}.`, '');
}

md.push('## How each emergency answer escalates — first sentence, (n) and (n0)', '');
const firstSentence = (s) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); const e = t.search(/[.!?](\s|$)/); return (e === -1 ? t : t.slice(0, e + 1)).slice(0, 220); };
for (const k of ['n', 'n0'].filter(x => files[x])) {
  md.push(`### ${LABEL[k]}`, '', '| Item | Class | First sentence |', '|---|---|---|');
  for (const id of EMERGENCY) md.push(`| ${id} | ${loc[k][id].escalation} | ${firstSentence(answerOf(k, id)).replace(/\|/g, '\\|')} |`);
  md.push('');
}

md.push('## Every foreign answer, verbatim', '');
let anyForeign = false;
for (const k of KEYS) for (const id of ids) if (loc[k][id].foreign) {
  anyForeign = true;
  const x = loc[k][id];
  md.push(`### ${LABEL[k]} — ${id} (${byId[id].category}) — ${['foreignEmergency', 'auService', 'foreignSignpost'].filter(f => x[f]).join(', ')}`, '', `Question: ${byId[id].question}`, '', '```text', answerOf(k, id), '```', '');
}
if (!anyForeign) md.push('None in any condition.', '');

md.push('## Foreign organisations named (descriptive) — the matched name and its context', '');
for (const k of KEYS) {
  const list = ids.filter(id => loc[k][id].foreignOrg);
  md.push(`- **${LABEL[k]}** (${list.length}): ${list.map(id => { const a = answerOf(k, id); const m = loc[k][id].foreignOrgMatch; const i = a.indexOf(m); return `${id} "…${a.slice(Math.max(0, i - 50), i + m.length + 30).replace(/\s+/g, ' ')}…"`; }).join('; ') || '—'}`);
}
md.push('');

md.push('## Failing items by condition', '');
for (const k of KEYS) {
  const failing = ids.filter(id => !passOf(k, id));
  md.push(`- **${LABEL[k]}** (${failing.length}): ${failing.map(id => `${id} (${byId[id].category}: ${cols[k].items.get(id).samples[0].failures.join('; ').slice(0, 120)})`).join('; ') || '—'}`);
}
md.push('');

md.push('## Spend', '', '| Condition | Calls | Input tokens | Output tokens | US$ |', '|---|---:|---:|---:|---:|');
for (const k of KEYS) md.push(`| ${LABEL[k]}${['a', 'c', 'd'].includes(k) ? ' (§19A, already spent)' : ''} | ${per[k].spend.calls} | ${per[k].spend.promptTokens} | ${per[k].spend.completionTokens} | ${per[k].spend.usd.toFixed(3)} |`);
const newSpend = ['n', 'n0'].filter(k => files[k]).reduce((s, k) => s + per[k].spend.usd, 0);
md.push('', `New §19D generation spend: **US$${newSpend.toFixed(3)}**.`, '');

const csv = [['id', 'origin', 'category', 'profile', 'question_nz_cue', 'retrieved_has111', ...KEYS.flatMap(k => [`pass_${k}`, `foreign_${k}`, `foreign_org_${k}`, `has111_${k}`, `first111_${k}`, `helpline_${k}`, `locality_${k}`, `escalation_${k}`])].join(',')];
for (const id of ids) {
  const emerg = EMERGENCY.includes(id);
  csv.push([id, NEW_IDS.has(id) ? 's19a' : 'heldout', byId[id].category, byId[id].profile ?? '', questionHasNzCue(byId[id].question) ? 1 : 0, corpus ? (retrievedHas(CH111, id) ? 1 : 0) : '',
    ...KEYS.flatMap(k => { const x = loc[k][id]; return [passOf(k, id) ? 1 : 0, x.foreign ? 1 : 0, x.foreignOrg ? 1 : 0, emerg ? (x.has111 ? 1 : 0) : '', emerg ? (x.first111 ? 1 : 0) : '', x.helplineNamed ? 1 : 0, x.locality, emerg ? x.escalation : '']; })].map(csvEscape).join(','));
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, `s19d_E3-N_${TAG}.md`), md.join('\n'));
writeFileSync(resolve(OUT_DIR, `s19d_E3-N_${TAG}.csv`), csv.join('\n') + '\n');
const summary = {
  tag: TAG, analysedAt: new Date().toISOString(), gitSha: gitSha(), frozenSha256: S19A_SHA256, nItems: ids.length, thresholds: THRESHOLDS,
  regenerate: `node scripts/eval/s19d/analyse.mjs ${args.join(' ')}`,
  models: Object.fromEntries(KEYS.map(k => [k, files[k].run.model])), pricesUSDPer1M: { 'gpt-4o': PRICES['gpt-4o'], source: 'scripts/eval/pricing.2026-09.json' },
  files: Object.fromEntries(KEYS.map(k => [k, files[k].path])), sameRetrievalND, counts, sizes,
  perCondition: Object.fromEntries(KEYS.map(k => [k, { ...per[k] }])), tests, expectations, decision, newSpendUSD: newSpend,
};
writeFileSync(resolve(OUT_DIR, `s19d_summary_${TAG}.json`), JSON.stringify(summary, null, 2) + '\n');
console.log(md.slice(0, 80).join('\n'));
console.log(`\nWrote ${relative(ROOT, OUT_DIR)}/s19d_{E3-N,summary}_${TAG}.*`);
