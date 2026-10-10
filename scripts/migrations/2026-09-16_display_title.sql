-- ============================================================
-- Migration — display_title column for knowledge_chunks
-- Date: 2026-09-16 · Status: NOT YET RUN · DEPENDS ON: Migration B
-- (2026-07-17_b_canonical_match_chunks.sql must run first)
--
-- Why: `title` does two jobs at once — it's embedded (`${title}. ${content}`,
-- see scripts/ingest/ingest.mjs) where a specific, section-scoped string
-- genuinely helps retrieval, AND it's what the citation card shows the user
-- verbatim (packages/core/rag/citations.js → ChatScreen/VoiceScreen citation
-- modal). For PDF-derived chunks `title` is built from the source document
-- name + heading path + part number (see chunkDocument in
-- scripts/ingest/chunking.js), which reads as technical PDF furniture to a
-- caregiver. Client demo feedback: reference names were too technical.
--
-- Fix: a separate `display_title` column holds a short plain-language title,
-- generated at ingest time (see ingest.mjs simplifyTitle()) for EVERY chunk
-- regardless of source — none of the existing titles (including the
-- "curated" ones) are guaranteed to already be caregiver-friendly, so all of
-- them get run through the same simplifier rather than special-casing by
-- loader. `title` itself is untouched, so retrieval/embeddings do not change.
--
-- match_chunks gains display_title in its RETURNS TABLE. Adding a column
-- changes the return type, which CREATE OR REPLACE cannot do — same
-- PGRST203 constraint as Migration B, so DROP + CREATE with the identical
-- input signature (existing 4-arg app calls keep resolving to defaults).
--
-- Safe on live data: additive column only; existing rows start NULL and
-- citations.js falls back to `title` until backfilled with
-- `node scripts/ingest/ingest.mjs --doc <id> --backfill-titles` (no
-- re-embedding — display_title is patched in isolation).
-- ============================================================

begin;

alter table knowledge_chunks
  add column if not exists display_title text;

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
    -- Stage A: provenance-column pre-filter — UNCHANGED from Migration B.
    select kc.*
    from knowledge_chunks kc
    where
      (filter_country        is null or lower(kc.country)        = lower(filter_country))
      and (filter_source_version is null or lower(kc.source_version) = lower(filter_source_version))
      and (filter_document_id    is null or lower(kc.document_id)    = lower(filter_document_id))
      and (filter_module         is null or kc.module               = filter_module)
  )
  -- Stage B: hybrid rank — UNCHANGED from Migration B (0.7 vector / 0.3 keyword).
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
-- Exactly one function, new return arity (11 OUT columns):
--   select p.oid::regprocedure,
--          (select count(*) from unnest(p.proargnames)) as total_args
--   from pg_proc p where p.proname = 'match_chunks';
-- Smoke test (retrieved ids/order must match the Migration B baseline exactly
-- — only a column was added, scoring/filters are untouched):
--   select id, round(similarity::numeric, 4)
--   from match_chunks((select embedding from knowledge_chunks where id = 'caregiving_001'),
--                     'sundowning evening agitation', 5, 0.25)
--   order by similarity desc;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.match_chunks(
--   vector, text, integer, double precision, text, text, text, integer
-- );
-- <re-run the 10-column CREATE from 2026-07-17_b_canonical_match_chunks.sql>
-- alter table knowledge_chunks drop column if exists display_title;
-- commit;
