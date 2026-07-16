// Post-retrieval candidate filtering shared by the app and the eval scripts.
// Plain CommonJS — no React Native imports (see ragConfig.js header).

// Group a chunk by its bulk-source family: the iSupport course (tagged
// document_id:isupport-*) is one family; everything else keeps its own document
// id, or 'curated' for hand-authored chunks with no document_id tag.
function sourceFamilyOf(chunk) {
  const tag = (chunk.tags || []).find(t => t.startsWith('document_id:'));
  const doc = tag ? tag.split(':')[1] : 'curated';
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
