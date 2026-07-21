-- ============================================================
-- Migration B — canonical match_chunks under version control
-- Date: 2026-07-17 · Status: NOT YET RUN · DEPENDS ON: Migration A
-- (2026-07-17_a_provenance_columns.sql must run first)
--
-- What changes vs the production snapshot (2026-07-16_production_snapshot.sql):
--   1. Stage A filters read the new PROVENANCE COLUMNS instead of parsing tags.
--   2. The RETURNS table gains document_id + chunk_level, so the app's
--      source-family diversity logic can stop tag-parsing.
-- What does NOT change: the hybrid SCORING (0.7 * cosine + 0.3 * ts_rank_cd),
-- the WHERE clause, ordering, and limit — retrieval ranking is byte-identical.
--
-- Why this is behaviour-identical for every current caller: the app and the
-- eval harness call match_chunks with only the first 4 arguments, leaving all
-- four filters NULL. With NULL filters the `filtered` CTE returns every row in
-- BOTH the tag-based and column-based versions, so retrieved ids are identical.
-- Verify after running: `npm run rag:eval:retrieval -- --questions v1` must
-- reproduce docs/report/baseline/ exactly.
--
-- PGRST203 invariant: there must remain EXACTLY ONE function named
-- match_chunks. Adding columns to RETURNS changes the return type, which
-- CREATE OR REPLACE cannot do, so we DROP the single 8-arg overload and
-- recreate it with the same input signature (the app's 4-arg call still
-- resolves — the extra 4 args keep their defaults).
-- ============================================================

begin;

drop function if exists public.match_chunks(
  vector, text, integer, double precision, text, text, text, integer
);

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
  id text, category text, title text, content text, tags text[],
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
    -- Stage A: provenance-column pre-filter (was tag membership pre-Migration B).
    -- Case-insensitive to tolerate mixed-case backfilled values.
    select kc.*
    from knowledge_chunks kc
    where
      (filter_country        is null or lower(kc.country)        = lower(filter_country))
      and (filter_source_version is null or lower(kc.source_version) = lower(filter_source_version))
      and (filter_document_id    is null or lower(kc.document_id)    = lower(filter_document_id))
      and (filter_module         is null or kc.module               = filter_module)
  )
  -- Stage B: hybrid rank — UNCHANGED from production (0.7 vector / 0.3 keyword).
  select
    f.id,
    f.category,
    f.title,
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
-- Exactly one function, new return arity (10 OUT columns):
--   select p.oid::regprocedure,
--          (select count(*) from unnest(p.proargnames)) as total_args
--   from pg_proc p where p.proname = 'match_chunks';
-- Smoke test (NULL filters → same rows as before):
--   select id, round(similarity::numeric, 4)
--   from match_chunks((select embedding from knowledge_chunks where id = 'caregiving_001'),
--                     'sundowning evening agitation', 5, 0.25)
--   order by similarity desc;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Re-run the match_chunks definition from
-- scripts/migrations/2026-07-16_production_snapshot.sql (drop this 10-column
-- version first, as above, then create the 8-column tag-filtering version).
