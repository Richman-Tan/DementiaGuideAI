-- ============================================================
-- Migration — review_status gate for knowledge_chunks
-- Date: 2026-10-07 · Status: run 2026-10-07 (corrected after a live incident, see below)
--
-- Why: match_chunks has no moderation gate today — any row in
-- knowledge_chunks is immediately retrievable the moment it's inserted. That
-- was fine while the only way in was a developer running ingest.mjs against a
-- licence-gated registry entry (registry.js's `enabled` flag). The new admin
-- intake tool (apps/admin + apps/api/api/admin/ingest.js) lets a non-engineer
-- submit a PDF/URL/pasted-text resource directly, so new rows now land as
-- 'pending' and a reviewer must flip them to 'approved' (in the Supabase
-- table editor — no new approval UI) before match_chunks will return them.
--
-- INCIDENT (2026-10-07): the first version of this file added the column
-- with `default 'pending'` directly in the same ALTER TABLE as the backfill
-- target. Postgres backfills an ADD COLUMN ... DEFAULT onto every EXISTING
-- row immediately — they are never left NULL once a default is attached at
-- creation — so all 454 existing rows landed on 'pending', not NULL, and
-- `update ... where review_status is null` (matching the backfill pattern
-- every other additive-column migration in this repo uses, where the new
-- column has NO default) matched zero rows. match_chunks was already live
-- and filtering on review_status = 'approved', so production retrieval
-- returned nothing until this was caught and corrected live with
-- `update knowledge_chunks set review_status = 'approved' where
-- review_status = 'pending';`. Fixed below by adding the column WITHOUT a
-- default first, backfilling the real NULLs, THEN attaching the default —
-- a fresh database applying this file for the first time cannot repeat the
-- bug, and re-running it against the already-corrected production database
-- is a no-op (every `if exists`/`if not exists` guard is idempotent).
--
-- Safe on live data (once applied as below): additive column, backfilled to
-- 'approved' for every existing row (all of it already went through the
-- licence-gated CLI path), so retrieval is unaffected until the admin tool
-- starts writing 'pending' rows. match_chunks keeps its exact signature and
-- return type — the new condition is a WHERE clause, not an output column,
-- so (unlike Migrations B and display_title) this is a plain
-- `create or replace`, no drop/recreate.
-- ============================================================

begin;

alter table knowledge_chunks
  add column if not exists review_status text;

update knowledge_chunks set review_status = 'approved' where review_status is null;

alter table knowledge_chunks
  alter column review_status set default 'pending';

alter table knowledge_chunks
  drop constraint if exists knowledge_chunks_review_status_check;
alter table knowledge_chunks
  add constraint knowledge_chunks_review_status_check
  check (review_status in ('pending', 'approved', 'rejected'));

create or replace function public.match_chunks(
  query_embedding vector,
  query_text text default ''::text,
  match_count integer default 5,
  min_similarity double precision default 0.25,
  filter_country text default null::text,
  filter_source_version text default null::text,
  filter_document_id text default null::text,
  filter_module integer default null::integer
)
returns table(
  id text, category text, title text, display_title text, content text, tags text[],
  source_url text, source_org text,
  document_id text, chunk_level text,
  similarity double precision
)
language sql
stable
as $function$
  with query_terms as (
    select case
      when query_text is null or btrim(query_text) = '' then null::tsquery
      else websearch_to_tsquery('english', query_text)
    end as tsq
  ),
  filtered as (
    -- Stage A: provenance-column pre-filter, plus the new moderation gate.
    select kc.*
    from knowledge_chunks kc
    where
      (filter_country        is null or lower(kc.country)        = lower(filter_country))
      and (filter_source_version is null or lower(kc.source_version) = lower(filter_source_version))
      and (filter_document_id    is null or lower(kc.document_id)    = lower(filter_document_id))
      and (filter_module         is null or kc.module               = filter_module)
      and kc.review_status = 'approved'
  )
  -- Stage B: hybrid rank — UNCHANGED (0.7 vector / 0.3 keyword).
  select
    f.id,
    f.category,
    f.title,
    f.display_title,
    f.content,
    f.tags,
    f.source_url,
    f.source_org,
    f.document_id,
    f.chunk_level,
    (
      0.7 * (1 - (f.embedding <=> query_embedding)) +
      0.3 * coalesce(ts_rank_cd(f.search_vector, qt.tsq), 0)
    )::float as similarity
  from filtered f
  cross join query_terms qt
  where (1 - (f.embedding <=> query_embedding)) > min_similarity
     or (qt.tsq is not null and f.search_vector @@ qt.tsq)
  order by similarity desc
  limit match_count;
$function$;

commit;

-- ── VERIFY (run after commit; paste output back) ───────────────────────────
-- Every existing row is now 'approved', so retrieval must be byte-identical
-- to the pre-migration baseline:
--   select id, round(similarity::numeric, 4)
--   from match_chunks((select embedding from knowledge_chunks where id = 'caregiving_001'),
--                     'sundowning evening agitation', 5, 0.25)
--   order by similarity desc;
--
-- Confirm no row was left ungated:
--   select count(*) filter (where review_status is null) as missing_status  -- expect 0
--   from knowledge_chunks;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- begin;
-- create or replace function public.match_chunks(
--   query_embedding vector, query_text text default ''::text, match_count integer default 5,
--   min_similarity double precision default 0.25, filter_country text default null::text,
--   filter_source_version text default null::text, filter_document_id text default null::text,
--   filter_module integer default null::integer
-- )
-- returns table(
--   id text, category text, title text, display_title text, content text, tags text[],
--   source_url text, source_org text, document_id text, chunk_level text, similarity double precision
-- )
-- language sql stable as $function$
--   <re-run the filtered CTE from 2026-09-16_display_title.sql, i.e. without
--   the `and kc.review_status = 'approved'` line>
-- $function$;
-- alter table knowledge_chunks drop column if exists review_status;
-- commit;
