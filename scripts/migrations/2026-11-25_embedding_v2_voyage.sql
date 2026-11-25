-- ============================================================
-- Migration — Voyage embeddings beside the OpenAI ones
-- Date: 2026-11-25 · Status: NOT YET RUN
--
-- Why: answers are moving to Claude, and Anthropic has no embedding model of
-- its own; it points to Voyage AI. Voyage vectors are a different width
-- (1024, not 1536) and live in a different space, so they cannot share the
-- existing `embedding` column or be compared with a query embedded by OpenAI.
--
-- What this adds, and nothing else:
--   1. `embedding_v2 vector(1024)` on knowledge_chunks, with the model and
--      time it was written.
--   2. `match_chunks_v2`, the same hybrid search reading the new column.
--   3. `knowledge_chunks_v2_missing()`, the number of approved rows the new
--      search cannot yet see. The switch-over waits for it to be 0.
--
-- Safe on live data: purely additive. `match_chunks` and the `embedding`
-- column are not touched, so every current caller (the web and mobile apps
-- call match_chunks with an OpenAI query embedding) behaves exactly as before.
-- Nothing reads the new column or function until a server setting names
-- match_chunks_v2, and going back is the same setting.
--
-- Two lessons from earlier files, applied here:
--   * PGRST203 (2026-07-13): there must be exactly ONE function named
--     match_chunks. The new search therefore has its own name; it is not an
--     overload.
--   * review_status (2026-10-07): a new column that the search filters on made
--     retrieval return nothing until its rows were backfilled. Here the new
--     search skips rows without a v2 embedding instead of failing, which would
--     hide the same problem, so knowledge_chunks_v2_missing() exists to make
--     it visible: run scripts/ingest/reembed.mjs, then check that it is 0
--     BEFORE switching anything to match_chunks_v2.
--
-- Differences from match_chunks, on purpose:
--   * It reads embedding_v2 and skips rows where that is null.
--   * `vector_weight` is an argument (default 0.7, the current mix), so the
--     balance between vector similarity and keyword rank can be tuned by
--     evaluation without another migration. The 0.7/0.3 mix and the 0.25
--     similarity floor were chosen for OpenAI's vectors and need re-tuning.
--   * No vector index: at about 450 rows the planner scans, and the ORDER BY
--     is over a mixed expression that an ivfflat index could not serve anyway.
-- ============================================================

begin;

alter table knowledge_chunks
  add column if not exists embedding_v2 vector(1024),
  add column if not exists embedding_v2_model text,
  add column if not exists embedding_v2_at timestamptz;

create or replace function public.match_chunks_v2(
  query_embedding vector,
  query_text text default ''::text,
  match_count integer default 5,
  min_similarity double precision default 0.25,
  filter_country text default null::text,
  filter_source_version text default null::text,
  filter_document_id text default null::text,
  filter_module integer default null::integer,
  vector_weight double precision default 0.7
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
    -- Stage A: the same provenance filters and moderation gate as match_chunks,
    -- plus: only rows that have a Voyage embedding.
    select kc.*
    from knowledge_chunks kc
    where
      (filter_country        is null or lower(kc.country)        = lower(filter_country))
      and (filter_source_version is null or lower(kc.source_version) = lower(filter_source_version))
      and (filter_document_id    is null or lower(kc.document_id)    = lower(filter_document_id))
      and (filter_module         is null or kc.module               = filter_module)
      and kc.review_status = 'approved'
      and kc.embedding_v2 is not null
  )
  -- Stage B: hybrid rank, with the mix as an argument.
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
      vector_weight * (1 - (f.embedding_v2 <=> query_embedding)) +
      (1 - vector_weight) * coalesce(ts_rank_cd(f.search_vector, qt.tsq), 0)
    )::float as similarity
  from filtered f
  cross join query_terms qt
  where (1 - (f.embedding_v2 <=> query_embedding)) > min_similarity
     or (qt.tsq is not null and f.search_vector @@ qt.tsq)
  order by similarity desc
  limit match_count;
$function$;

-- Approved rows that match_chunks_v2 cannot return, or would return from an
-- out-of-date vector: no Voyage embedding yet, or one older than the row's
-- last (re-)ingestion. Must be 0 before anything switches to match_chunks_v2.
create or replace function public.knowledge_chunks_v2_missing()
returns integer
language sql
stable
as $function$
  select count(*)::integer
  from knowledge_chunks
  where review_status = 'approved'
    and (
      embedding_v2 is null
      or embedding_v2_at is null
      or (embedded_at is not null and embedding_v2_at < embedded_at)
    );
$function$;

commit;

-- ── VERIFY (run after commit; paste output back) ───────────────────────────
-- Nothing existing changed: this must return the same ids and scores as before.
--   select id, round(similarity::numeric, 4)
--   from match_chunks((select embedding from knowledge_chunks where id = 'caregiving_001'),
--                     'sundowning evening agitation', 5, 0.25)
--   order by similarity desc;
--
-- Exactly one function of each name (PGRST203):
--   select proname, count(*) from pg_proc
--   where proname in ('match_chunks', 'match_chunks_v2') group by proname;   -- expect 1 and 1
--
-- Before the backfill every approved row is missing; after it, none:
--   select knowledge_chunks_v2_missing();   -- expect the approved row count, then 0
--
-- After the backfill, the new search answers from the new column:
--   select id, round(similarity::numeric, 4)
--   from match_chunks_v2((select embedding_v2 from knowledge_chunks where id = 'caregiving_001'),
--                        'sundowning evening agitation', 5, 0.25)
--   order by similarity desc;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.knowledge_chunks_v2_missing();
-- drop function if exists public.match_chunks_v2(
--   vector, text, integer, double precision, text, text, text, integer, double precision
-- );
-- alter table knowledge_chunks
--   drop column if exists embedding_v2,
--   drop column if exists embedding_v2_model,
--   drop column if exists embedding_v2_at;
-- commit;
