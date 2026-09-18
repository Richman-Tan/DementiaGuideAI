#!/usr/bin/env node
// Import a second annotator's retrieval relevance labels (E1) and compute
// agreement with the existing labels in scripts/eval/questions.js.
//
//   node scripts/eval/import-labels.mjs --labels <export.json> --rater R2 [--pool data/labelpool/pool.json]
//
// <export.json> is what the Passage Labeller page exports (or what
// `ArtifactData list labels/<rater>` returns, wrapped as {questions:[{id,labels}]}):
//   { rater, questions: [ { id: "A1", labels: { "<chunkId>": "relevant"|"partial"|"not", ... } } ] }
//
// Agreement is computed on the candidate pool only (every candidate the
// annotator was shown). Existing labels map to the same scale:
//   relevant -> relevant, acceptable -> partial, anything else in the pool -> not.
// Outputs:
//   docs/report/eval/final/agreement_retrieval_R1_vs_<rater>.md
//   docs/report/eval/human/retrieval-labels_<rater>.json   (chunk ids only)
//   and prints the pooled label set (union with graded gains) for adoption.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, gitSha } from './lib.mjs';
import { cohenKappa } from './lib/stats.js';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const labelsPath = argVal('--labels');
const rater = argVal('--rater', 'R2');
const poolPath = resolve(ROOT, argVal('--pool', 'data/labelpool/pool.json'));
if (!labelsPath) { console.error('usage: --labels <export.json> [--rater R2] [--pool pool.json]'); process.exit(1); }

const exp = JSON.parse(readFileSync(resolve(ROOT, labelsPath), 'utf8'));
const pool = JSON.parse(readFileSync(poolPath, 'utf8'));
const poolQ = Object.fromEntries(pool.questions.map(q => [q.id, q]));
const r2 = Object.fromEntries((exp.questions ?? []).map(q => [q.id, q.labels ?? {}]));
const SCALE = { not: 0, partial: 1, relevant: 2 };

const pairs = []; // [r1, r2] on the 0/1/2 scale, per (question, candidate)
const perQ = [];
let missing = 0;
for (const q of QUESTIONS.filter(x => x.relevant?.length)) {
  const cands = poolQ[q.id]?.candidates ?? [];
  const mine = r2[q.id] ?? {};
  let agree = 0, n = 0;
  for (const cid of cands) {
    const a = q.relevant.includes(cid) ? 2 : (q.acceptable ?? []).includes(cid) ? 1 : 0;
    const m = mine[cid];
    if (m == null) { missing++; continue; }
    const b = SCALE[m] ?? 0;
    pairs.push([a, b]); n++; if (a === b) agree++;
  }
  perQ.push({ id: q.id, n, agree, r1Relevant: q.relevant, r2Relevant: cands.filter(c => mine[c] === 'relevant'), r2Partial: cands.filter(c => mine[c] === 'partial') });
}
if (!pairs.length) { console.error('no overlapping judgements found'); process.exit(1); }

const a1 = pairs.map(p => p[0]), a2 = pairs.map(p => p[1]);
const k3u = cohenKappa(a1, a2, { weights: "none" }).kappa;
const k3l = cohenKappa(a1, a2, { weights: "linear" }).kappa;
const k3q = cohenKappa(a1, a2, { weights: "quadratic" }).kappa;
const bin = (v) => (v === 2 ? 1 : 0);
const kbin = cohenKappa(a1.map(bin), a2.map(bin), { weights: "none" }).kappa;
const pct = pairs.filter(p => p[0] === p[1]).length / pairs.length;
const pctBin = pairs.filter(p => bin(p[0]) === bin(p[1])).length / pairs.length;
const conf = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const [a, b] of pairs) conf[a][b]++;

// Pooled labels: union with graded gains. relevant if either says relevant;
// acceptable if either says partial (and neither says relevant).
const pooled = QUESTIONS.filter(x => x.relevant?.length).map(q => {
  const mine = r2[q.id] ?? {};
  const cands = poolQ[q.id]?.candidates ?? [];
  const relevant = [...new Set([...q.relevant, ...cands.filter(c => mine[c] === 'relevant')])];
  const acceptable = [...new Set([...(q.acceptable ?? []), ...cands.filter(c => mine[c] === 'partial')])].filter(c => !relevant.includes(c));
  return { id: q.id, relevant, acceptable, added: { relevant: relevant.filter(c => !q.relevant.includes(c)), acceptable: acceptable.filter(c => !(q.acceptable ?? []).includes(c)) } };
});
const addedR = pooled.reduce((a, q) => a + q.added.relevant.length, 0);
const addedA = pooled.reduce((a, q) => a + q.added.acceptable.length, 0);
const r1OnlyRelevant = pooled.reduce((a, q) => a + QUESTIONS.find(x => x.id === q.id).relevant.filter(c => (r2[q.id] ?? {})[c] && (r2[q.id] ?? {})[c] !== 'relevant').length, 0);

// How the second annotator judged the first annotator's PRIMARY passage(s).
const prim = { relevant: 0, partial: 0, not: 0, unmarked: 0, total: 0 };
for (const q of QUESTIONS.filter(x => x.relevant?.length)) {
  for (const cid of q.relevant) { prim.total++; const m = (r2[q.id] ?? {})[cid]; if (m == null) prim.unmarked++; else prim[m] = (prim[m] ?? 0) + 1; }
}
const r2RelevantPerQ = QUESTIONS.filter(x => x.relevant?.length).map(q => (poolQ[q.id]?.candidates ?? []).filter(c => (r2[q.id] ?? {})[c] === 'relevant').length);
const meanR2Relevant = r2RelevantPerQ.reduce((a, b) => a + b, 0) / Math.max(1, r2RelevantPerQ.length);

const fmt = (x) => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(2));
const sha = gitSha();
const md = `# Retrieval relevance labels — first annotator vs ${rater} — snapshot ${sha}

Generated ${new Date().toISOString()} by \`scripts/eval/import-labels.mjs\` from \`${labelsPath}\`. Pool: ${pool.questions.length} questions, ${pairs.length} judged (question, passage) pairs out of ${pairs.length + missing} shown (${missing} left unmarked). The pool is the union of the hybrid top-10, the dense-only top-10 and the existing labels, shuffled; the second annotator saw no marks. Scale: relevant / partly (= existing "acceptable") / not.

| Agreement | Value |
|---|---:|
| Exact agreement, 3-level | ${(100 * pct).toFixed(1)} % |
| Cohen's κ, unweighted | ${fmt(k3u)} |
| Cohen's κ, linear weights | ${fmt(k3l)} |
| Cohen's κ, quadratic weights | ${fmt(k3q)} |
| Agreement on *relevant* vs not, binary | ${(100 * pctBin).toFixed(1)} % |
| Cohen's κ, binary relevant | ${fmt(kbin)} |

**Read the κ with the design in mind.** The first annotator's set marks ONE primary passage per question (plus an occasional alternate); every other passage in the pool counts as "not" for it, whether or not anyone judged it. ${rater} marked every passage shown. The 3-level κ therefore measures how exhaustive the July labels are, not whether the two people disagree about what is relevant. The statistic that answers the second question is the primary-confirmation rate: **${rater} marked the first annotator's primary passage relevant in ${prim.relevant} of ${prim.total}** (partly ${prim.partial}, not ${prim.not}, unmarked ${prim.unmarked}), and found on average ${meanR2Relevant.toFixed(1)} relevant passages per question. Recall@k against the single primary label is therefore a conservative measure; the pooled labels below give the fuller one.

Confusion (rows: first annotator; columns: ${rater}; not / partly / relevant):

| | not | partly | relevant |
|---|---:|---:|---:|
| not | ${conf[0][0]} | ${conf[0][1]} | ${conf[0][2]} |
| partly | ${conf[1][0]} | ${conf[1][1]} | ${conf[1][2]} |
| relevant | ${conf[2][0]} | ${conf[2][1]} | ${conf[2][2]} |

Pooled labels (union, graded): ${addedR} passages newly *relevant*, ${addedA} newly *acceptable*; ${r1OnlyRelevant} first-annotator relevant passages that ${rater} marked lower (kept, per the union rule; listed in the JSON).

Questions where the two disagree on what is relevant:

${perQ.filter(q => q.r1Relevant.join() !== q.r2Relevant.join()).map(q => `- ${q.id}: first = ${q.r1Relevant.join(', ') || '—'}; ${rater} = ${q.r2Relevant.join(', ') || '—'}${q.r2Partial.length ? ` (partly: ${q.r2Partial.join(', ')})` : ''}`).join('\n') || '- none'}

Adoption: re-run \`node scripts/eval/run-retrieval.mjs\` against the pooled labels to report recall@k with the second annotator's judgements included, and quote κ next to it.
`;
mkdirSync(resolve(ROOT, 'docs/report/eval/final'), { recursive: true });
mkdirSync(resolve(ROOT, 'docs/report/eval/human'), { recursive: true });
const outMd = resolve(ROOT, `docs/report/eval/final/agreement_retrieval_R1_vs_${rater}.md`);
writeFileSync(outMd, md);
const outJson = resolve(ROOT, `docs/report/eval/human/retrieval-labels_${rater}.json`);
writeFileSync(outJson, JSON.stringify({ rater, importedAt: new Date().toISOString(), gitSha: sha, poolSha: pool.gitSha, judged: pairs.length, unmarked: missing, labels: r2, pooled }, null, 1));
console.log(md.split('\n').slice(0, 14).join('\n'));
console.log(`→ ${outMd}\n→ ${outJson}`);
