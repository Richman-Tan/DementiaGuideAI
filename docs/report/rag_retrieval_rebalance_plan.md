# RAG Retrieval Rebalance Plan — recovering the iSupport-displaced misses

**Context.** The RAG grounding evaluation (§6.9 of the results draft) retrieved an expected chunk for 29 of 32 in-scope questions. All three misses (A12 agitation, A13 hallucinations, A17 validation) were displaced by WHO/NZ **iSupport** course chunks: 387 of the 449 knowledge-base chunks are iSupport material, all filed under the `caregiving` category, so for behaviour-phrased queries they crowd the top five and push hand-authored `best-practices` / `communication` chunks out.

This is a **corpus-balance and ranking problem, not a retrieval-method failure** — every answer was still judged fully grounded, including the three misses (they were grounded in the iSupport chunks that were retrieved).

## Diagnosis (measured 2026-07-13, top-50 retrieval)

| Q | Expected chunk | Rank of expected in top-50 | Recoverable by re-ranking? |
|---|---|---|---|
| A12 | bestpractices_003 (de-escalation) | 7 | **Yes** |
| A13 | bestpractices_004 (hallucinations) | 6 | **Yes** |
| A17 | communication_003 (validation therapy) | > 50 | **No** — target not competitive |

The iSupport chunks carry a `document_id:isupport-nz` / `document_id:isupport-who` tag; the hand-authored chunks do not. That tag is the lever for a fix.

## Options

**A. Source-family diversity cap in retrieval (recommended).** Retrieve a wider candidate set (e.g. 50), then cap the number of chunks from the iSupport family (any `document_id` starting `isupport`) at two before taking the top five. Purely re-ranking; no data changes; no re-embedding.
*Verified:* recovers A12 and A13 (both enter the top five). Does not recover A17.

**B. Curated-source boost.** Add a small constant to the similarity of non-iSupport ("curated") chunks, or a `priority` column. Simple, but a magic weight to tune and it distorts raw similarity.

**C. Re-categorise the iSupport corpus.** Move the 387 iSupport chunks out of `caregiving` into a dedicated category (e.g. `isupport-course`). This only changes ranking if retrieval becomes category-aware (it currently searches the whole table), so it must be paired with a category filter or exclusion — more invasive.

**D. Chunk-level filter.** iSupport chunks are tagged `chunk_level:parent` / `child`. Restricting to `parent` (section summaries) shrinks the competing set. Helps, but does not by itself guarantee curated chunks surface.

**Recommendation: A now, C later.** The diversity cap is the smallest change that recovers the recoverable misses and generalises to any future bulk import. Re-categorising (C) is the durable data fix but is a larger task; do it when the corpus is next curated.

## A17 — not a defect to force

A17's target (`communication_003`, validation therapy) is beyond rank 50: the curated chunk is simply not a strong match for "should I correct her?", whereas the iSupport validation content is. The retrieved content was on-topic and the answer was grounded. Treat A17 as either (i) an acceptable result to record as-is, or (ii) motivation to strengthen the curated communication chunks (better titles/keywords) — **not** something to force with an aggressive cap that would degrade genuinely good iSupport retrieval elsewhere.

## Recommended implementation (option A, client-side)

A re-ranking pass in `openaiService.search()` — retrieve `TOP_K * over` candidates, cap the iSupport family, return `TOP_K`. No DB change; testable via `scripts/rag-eval.mjs`.

```js
// src/services/openaiService.js — inside search(), after the RPC returns `data`
const OVERSAMPLE = 10;               // retrieve TOP_K * OVERSAMPLE candidates
const MAX_PER_SOURCE_FAMILY = 2;     // cap bulk-source dominance in the final list

function familyOf(chunk) {
  const t = (chunk.tags || []).find(x => x.startsWith('document_id:'));
  const doc = t ? t.split(':')[1] : 'curated';
  return doc.startsWith('isupport') ? 'isupport' : doc;
}

function capBySourceFamily(rows, k, maxPerFamily) {
  const counts = {}; const out = [];
  for (const r of rows) {
    const fam = familyOf(r);
    counts[fam] = (counts[fam] || 0) + 1;
    if (fam === 'isupport' && counts[fam] > maxPerFamily) continue;
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}
// call the RPC with match_count = TOP_K * OVERSAMPLE, then:
//   return capBySourceFamily(data, TOP_K, MAX_PER_SOURCE_FAMILY);
```

Cost: one retrieval of ~50 rows instead of 5 (negligible latency; the vector index already ranks them). Keep the cap loose (2) so iSupport still contributes where it is genuinely best.

### Server-side alternative
If preferred in-database, add a re-ranked variant of the 8-arg `match_chunks` that keeps at most N rows per `document_id` via a window function (`row_number() over (partition by document_id order by similarity desc)`). This needs the current deployed function body (dump it with `pg_get_functiondef`) so the hybrid ranking and filters are preserved — do not rewrite it blind.

## Verification

After applying option A, re-run the harness and confirm retrieval rises from 29/32 to **31/32** with A12 and A13 recovered and A17 unchanged (expected):
```bash
node scripts/rag-eval.mjs
```
Then update §6.9 / Table 4 with the new counts.

## Status
**Applied and verified (2026-07-13).** Option A (source-family cap, `RETRIEVAL_OVERSAMPLE = 10`, `MAX_PER_SOURCE_FAMILY = 2`) is implemented in `openaiService.search()` and mirrored in `scripts/rag-eval.mjs`. Re-running the full eval raised in-scope retrieval from 29/32 to 31/32: A12 and A13 recovered; A17 unchanged (its target is beyond the candidate set, and its answer was grounded in the iSupport content retrieved instead). Groundedness on the post-cap answers remained 32/32.

**Durable fix also applied (2026-07-13):** option C run — the 377 `isupport%` chunks were moved out of `caregiving` into a dedicated `isupport-course` category (`scripts/migrations/2026-07-13_recategorise_isupport.sql`). `caregiving` is back to its 10 curated chunks. Retrieval verified unchanged at 31/32 afterwards (the cap keys off the `document_id` tag, not category).
