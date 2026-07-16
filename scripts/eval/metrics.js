// Deterministic retrieval metrics — pure functions over ranked id lists.
// No LLM involvement anywhere in this module (see docs/rag-evaluation-plan.md).
// Plain CommonJS so Jest and the .mjs runners share one implementation.
//
// Conventions:
//   retrieved  — ranked array of chunk ids (rank 1 first)
//   relevant   — ids labelled fully relevant (nDCG gain 2)
//   acceptable — ids labelled partially relevant (nDCG gain 1)
// A question with no relevant labels contributes null (excluded from means).

function recallAtK(retrieved, relevant, k) {
  if (!relevant || relevant.length === 0) return null;
  const top = new Set(retrieved.slice(0, k));
  const found = relevant.filter(id => top.has(id)).length;
  return found / relevant.length;
}

// Precision counts relevant AND acceptable ids as useful results.
function precisionAtK(retrieved, relevant, acceptable, k) {
  if ((!relevant || relevant.length === 0) && (!acceptable || acceptable.length === 0)) return null;
  const useful = new Set([...(relevant || []), ...(acceptable || [])]);
  const top = retrieved.slice(0, k);
  if (top.length === 0) return 0;
  const hits = top.filter(id => useful.has(id)).length;
  return hits / k;
}

// Reciprocal rank of the first relevant-or-acceptable id (0 when absent).
function reciprocalRank(retrieved, relevant, acceptable) {
  if ((!relevant || relevant.length === 0) && (!acceptable || acceptable.length === 0)) return null;
  const useful = new Set([...(relevant || []), ...(acceptable || [])]);
  const idx = retrieved.findIndex(id => useful.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

// Graded nDCG@k: gain 2 for relevant, 1 for acceptable, 0 otherwise.
// IDCG is computed from the ideal ordering of the labelled ids (capped at k).
function ndcgAtK(retrieved, relevant, acceptable, k) {
  const rel = relevant || [];
  const acc = acceptable || [];
  if (rel.length === 0 && acc.length === 0) return null;
  const gain = (id) => (rel.includes(id) ? 2 : acc.includes(id) ? 1 : 0);
  const discount = (i) => 1 / Math.log2(i + 2); // i is 0-based rank

  const dcg = retrieved.slice(0, k).reduce((s, id, i) => s + gain(id) * discount(i), 0);
  const idealGains = [...rel.map(() => 2), ...acc.map(() => 1)].sort((a, b) => b - a).slice(0, k);
  const idcg = idealGains.reduce((s, g, i) => s + g * discount(i), 0);
  return idcg === 0 ? null : dcg / idcg;
}

// Per-question metric row.
function scoreQuestion({ retrieved, relevant, acceptable }, ks = [1, 3, 5]) {
  const row = {};
  for (const k of ks) row[`recall@${k}`] = recallAtK(retrieved, relevant, k);
  row['precision@5'] = precisionAtK(retrieved, relevant, acceptable, 5);
  row['mrr'] = reciprocalRank(retrieved, relevant, acceptable);
  row['ndcg@5'] = ndcgAtK(retrieved, relevant, acceptable, 5);
  return row;
}

// Mean of non-null values per metric across question rows.
function aggregate(rows) {
  const out = {};
  const keys = rows.length ? Object.keys(rows[0]) : [];
  for (const key of keys) {
    const vals = rows.map(r => r[key]).filter(v => v !== null && v !== undefined);
    out[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    out[`${key}#n`] = vals.length;
  }
  return out;
}

module.exports = { recallAtK, precisionAtK, reciprocalRank, ndcgAtK, scoreQuestion, aggregate };
