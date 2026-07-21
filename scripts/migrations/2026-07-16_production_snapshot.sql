-- ============================================================
-- PRODUCTION SNAPSHOT — verbatim dump of the live schema, 2026-07-17.
-- REFERENCE ONLY — DO NOT RUN. This records the pre-migration state so the
-- load-bearing objects are under version control (audit F-14). The canonical,
-- forward-going definitions are in supabase-setup.sql (fresh DB) and the
-- 2026-07-17_* migration files (existing DB).
--
-- Captured via scripts/migrations/2026-07-16_production_snapshot_request.sql.
-- ============================================================

-- ── knowledge_chunks columns (information_schema) ───────────────────────────
--   id            text        NOT NULL
--   category      text        NOT NULL
--   title         text        NOT NULL
--   content       text        NOT NULL
--   tags          text[]      NULL      default '{}'::text[]
--   source_url    text        NULL
--   source_org    text        NULL
--   embedding     vector      NULL      (USER-DEFINED)
--   search_vector tsvector    NULL      is_generated = NEVER  ← NOT a generated
--                                       column; maintained by the trigger below
--   (no provenance columns yet — added by 2026-07-17_a_provenance_columns.sql)

-- ── corpus (category_count) ─────────────────────────────────────────────────
--   isupport-course 377 · clinical 12 · best-practices 10 · caregiving 10
--   communication 10 · home-safety 10 · prevention 10 · wellbeing 10  (= 449)
--   NB: clinical = 12 in production vs 10 in src/features/library/data/
--   knowledgeBase.js — 2 curated chunks exist only in the live DB. Reconcile
--   during the Stage 9 curated re-ingestion.

-- ── indexes ─────────────────────────────────────────────────────────────────
--   knowledge_chunks_pkey        UNIQUE btree (id)
--   knowledge_chunks_embedding_idx  ivfflat (embedding vector_cosine_ops) WITH (lists='10')
--   knowledge_chunks_search_idx     gin (search_vector)

-- ── RLS policy ──────────────────────────────────────────────────────────────
--   "Public read access"  cmd=r (SELECT)  USING true      (anon: read-only)

-- ── search_vector trigger + trigger function ────────────────────────────────
-- IMPORTANT: search_vector includes TAGS as well as title + content — so
-- keyword search matches tag terms (e.g. 'document_id:isupport-nz'). Slimming
-- tags later (Stage 9) therefore changes keyword-search content; re-run
-- ingestion so the trigger rebuilds every search_vector.

CREATE TRIGGER trg_knowledge_chunks_search_vector
  BEFORE INSERT OR UPDATE OF title, content, tags
  ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_search_vector_update();

CREATE OR REPLACE FUNCTION public.knowledge_chunks_search_vector_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.content, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$function$;

-- ── match_chunks (8-arg hybrid) — the actual production retrieval function ───
-- Hybrid scoring is a WEIGHTED SUM: 0.7 * cosine + 0.3 * ts_rank_cd, NOT RRF.
-- Stage A pre-filters by TAG membership (country/source_version/document_id/
-- module); Stage B ranks. The app calls it with only the first 4 args, so the
-- filters are inactive in production today.

CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector,
  query_text text DEFAULT ''::text,
  match_count integer DEFAULT 5,
  min_similarity double precision DEFAULT 0.25,
  filter_country text DEFAULT NULL::text,
  filter_source_version text DEFAULT NULL::text,
  filter_document_id text DEFAULT NULL::text,
  filter_module integer DEFAULT NULL::integer
)
 RETURNS TABLE(id text, category text, title text, content text, tags text[], source_url text, source_org text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  with query_terms as (
    select case
      when query_text is null or btrim(query_text) = '' then null::tsquery
      else websearch_to_tsquery('english', query_text)
    end as tsq
  ),
  filtered as (
    -- Stage A: tag-based pre-filter
    select kc.*
    from knowledge_chunks kc
    where
      (filter_country       is null or kc.tags @> array['country:'       || lower(filter_country)])
      and (filter_source_version is null or kc.tags @> array['source_version:' || lower(filter_source_version)])
      and (filter_document_id   is null or kc.tags @> array['document_id:'     || lower(filter_document_id)])
      and (filter_module        is null or kc.tags @> array['module:'           || filter_module::text])
  )
  -- Stage B: hybrid rank over filtered candidates
  select
    f.id,
    f.category,
    f.title,
    f.content,
    f.tags,
    f.source_url,
    f.source_org,
    (
      0.7 * (1 - (f.embedding <=> query_embedding)) +
      0.3 * coalesce(ts_rank_cd(
        f.search_vector,
        qt.tsq
      ), 0)
    )::float as similarity
  from filtered f
  cross join query_terms qt
  where (1 - (f.embedding <=> query_embedding)) > min_similarity
     or (
       qt.tsq is not null
       and f.search_vector @@ qt.tsq
     )
  order by similarity desc
  limit match_count;
$function$;
