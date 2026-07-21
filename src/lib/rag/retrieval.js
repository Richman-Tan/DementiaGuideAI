// Post-retrieval candidate filtering shared by the app and the eval scripts.
// Plain CommonJS — no React Native imports (see ragConfig.js header).

// Group a chunk by its bulk-source family: the iSupport course is one family;
// everything else keeps its own document id, or 'curated' for hand-authored
// chunks. Prefers the document_id COLUMN (returned by the canonical
// match_chunks since 2026-07-17_b), falling back to the legacy
// `document_id:<value>` tag for any pre-migration caller.
function sourceFamilyOf(chunk) {
  let doc = chunk.document_id;
  if (!doc) {
    const tag = (chunk.tags || []).find(t => t.startsWith('document_id:'));
    doc = tag ? tag.split(':')[1] : 'curated';
  }
  return doc.startsWith('isupport') ? 'isupport' : doc;
}

// Take the first `k` chunks, but allow at most `maxPerFamily` from any single
// bulk source family so one over-represented source can't monopolise the results.
function capBySourceFamily(rows, k, maxPerFamily) {
  const counts = {};
  const out = [];
  for (const r of rows) {
    const fam = sourceFamilyOf(r);
    counts[fam] = (counts[fam] || 0) + 1;
    if (fam === 'isupport' && counts[fam] > maxPerFamily) continue;
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}

module.exports = { sourceFamilyOf, capBySourceFamily };
