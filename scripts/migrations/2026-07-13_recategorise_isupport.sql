-- ============================================================================
-- Migration (OPTIONAL / data-hygiene): move the iSupport corpus out of the
-- `caregiving` category into its own category.
-- Date: 2026-07-13
-- ============================================================================
--
-- WHY THIS IS OPTIONAL
-- --------------------
-- The knowledge base holds ~387 WHO/NZ iSupport course chunks, all currently
-- categorised `caregiving`, versus ~10 hand-authored chunks per category. That
-- imbalance let iSupport chunks crowd the top-K for behaviour-phrased queries.
--
-- The FUNCTIONAL fix for retrieval ranking is already applied in the app: a
-- source-family cap in openaiService.search() (retrieval 29/32 → 31/32). It keys
-- off the `document_id:isupport*` tag, NOT the category, so this migration does
-- NOT change retrieval ranking on its own.
--
-- What this migration DOES buy you:
--   * an honest category taxonomy (caregiving returns to ~10 curated chunks);
--   * the ability to add category-scoped retrieval or filters later (e.g. exclude
--     or prefer the course material) using the 8-arg match_chunks filters.
-- Run it only if you want those; otherwise the cap alone is sufficient.
--
-- REQUIRES WRITE ACCESS: run in Supabase → SQL Editor (postgres role) or with the
-- service_role key. The app's anon key is read-only and cannot UPDATE.
-- ============================================================================

-- STEP 1 — see the current spread (expect ~387 iSupport rows under caregiving).
select
  category,
  count(*)                                             as total,
  count(*) filter (where id like 'isupport%')          as isupport,
  count(*) filter (where id not like 'isupport%')      as curated
from knowledge_chunks
group by category
order by total desc;

-- STEP 2 — re-categorise the iSupport course chunks. Their ids are prefixed
-- `isupport_` (e.g. isupport_nz_p004, isupport_who_c109), which is the reliable
-- selector. (Equivalent tag test:
--   exists (select 1 from unnest(tags) t where t like 'document_id:isupport%') )
update knowledge_chunks
set category = 'isupport-course'
where id like 'isupport%'
  and category <> 'isupport-course';

-- STEP 3 — verify: caregiving should drop to the ~10 curated chunks, and a new
-- `isupport-course` category should hold the ~387 course chunks.
select category, count(*) as total
from knowledge_chunks
group by category
order by total desc;

-- ROLLBACK (if needed): the iSupport chunks were previously category 'caregiving'.
--   update knowledge_chunks set category = 'caregiving'
--   where id like 'isupport%' and category = 'isupport-course';

-- ALTERNATIVE (non-destructive): instead of changing category, add a boolean/tier
-- column and keep category as-is, e.g.
--   alter table knowledge_chunks add column if not exists is_bulk_source boolean
--     generated always as (id like 'isupport%') stored;
-- then filter on is_bulk_source in a category-scoped retrieval path.
