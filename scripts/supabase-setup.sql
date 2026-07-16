-- ============================================================
-- Supabase schema for the DementiaGuide AI knowledge base — FRESH DATABASE.
-- Run this entire file once in Supabase → SQL Editor before seeding.
--
-- ⚠️  FRESH DATABASE ONLY. Do NOT run against the existing production database.
--     For an existing DB, apply the dated files in scripts/migrations/ instead
--     (see scripts/migrations/README.md). This file reproduces the CANONICAL
--     post-migration schema so a new project matches production 1:1.
--
-- Reconciled 2026-07-17 with the verified production snapshot
-- (scripts/migrations/2026-07-16_production_snapshot.sql):
--   • search_vector is a PLAIN tsvector column maintained by a TRIGGER (NOT a
--     generated column), and it indexes title + content + TAGS.
--   • provenance columns (document_id, source_version, country, module,
--     chunk_level, content_hash, embedding_model, embedded_at, licence).
--   • ivfflat lists = 10; GIN index named knowledge_chunks_search_idx.
--   • match_chunks is the 8-arg weighted-sum hybrid (0.7 vector / 0.3 keyword)
--     filtering on the provenance columns.
-- ============================================================

-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Knowledge base table
--    embedding is vector(1536) to match text-embedding-3-small output.
--    search_vector (populated by the trigger in section 4) powers the keyword
--    half of hybrid retrieval.
create table if not exists knowledge_chunks (
  id              text primary key,
  category        text        not null,
  title           text        not null,
  content         text        not null,
  tags            text[]      default '{}',
  source_url      text,
  source_org      text,
  embedding       vector(1536),
  search_vector   tsvector,
  -- provenance (see docs/rag-target-architecture.md)
  document_id     text,
  source_version  text,
  country         text,
  module          int,
  chunk_level     text check (chunk_level is null or chunk_level in ('parent', 'child')),
  content_hash    text,
  embedding_model text,
  embedded_at     timestamptz,
  licence         text
);

-- 3. Indexes
--    ivfflat for approximate nearest-neighbour vector search. lists=10 matches
--    production; at this corpus size (~450 rows) index choice is near-moot —
--    revisit (raise lists, or move to HNSW) only past ~10k rows. Rebuild after
--    a full corpus replacement so cluster centroids match the new data:
--    reindex index knowledge_chunks_embedding_idx;
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

--    GIN index for the full-text half of hybrid search.
create index if not exists knowledge_chunks_search_idx
  on knowledge_chunks
  using gin (search_vector);

--    Metadata index for provenance-filtered retrieval + inventory queries.
create index if not exists knowledge_chunks_doc_country_idx
  on knowledge_chunks (document_id, country);

-- 4. search_vector trigger — keeps the keyword vector in sync with
--    title + content + tags on every insert/update of those columns.
create or replace function knowledge_chunks_search_vector_update()
returns trigger
language plpgsql as $$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.content, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists trg_knowledge_chunks_search_vector on knowledge_chunks;
create trigger trg_knowledge_chunks_search_vector
  before insert or update of title, content, tags
  on knowledge_chunks
  for each row execute function knowledge_chunks_search_vector_update();

-- 5. Server-side retrieval function — called by the app via
--    supabase.rpc('match_chunks', { query_embedding, query_text, match_count, min_similarity }).
--
--    IMPORTANT: keep exactly ONE function named match_chunks. Multiple overloads
--    whose extra args all default make the app's 4-arg call ambiguous (PostgREST
--    PGRST203) and break retrieval entirely — see
--    scripts/migrations/2026-07-13_fix_match_chunks_overload.sql.
--
--    Hybrid score = 0.7 * cosine similarity + 0.3 * ts_rank_cd(keyword).
--    Stage A pre-filters on the provenance columns (all NULL for the app's
--    4-arg call → no filtering). Canonical version — see
--    scripts/migrations/2026-07-17_b_canonical_match_chunks.sql.
create or replace function match_chunks(
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
language sql stable as $$
  with query_terms as (
    select case
      when query_text is null or btrim(query_text) = '' then null::tsquery
      else websearch_to_tsquery('english', query_text)
    end as tsq
  ),
  filtered as (
    select kc.*
    from knowledge_chunks kc
    where
      (filter_country        is null or lower(kc.country)        = lower(filter_country))
      and (filter_source_version is null or lower(kc.source_version) = lower(filter_source_version))
      and (filter_document_id    is null or lower(kc.document_id)    = lower(filter_document_id))
      and (filter_module         is null or kc.module               = filter_module)
  )
  select
    f.id, f.category, f.title, f.content, f.tags, f.source_url, f.source_org,
    f.document_id, f.chunk_level,
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
$$;

-- 6. Row Level Security
--    The anon key used in the app can only READ.
--    The service_role key used in the ingestion scripts can write.
alter table knowledge_chunks enable row level security;

create policy "Public read access"
  on knowledge_chunks for select
  using (true);

-- No insert/update/delete policy for anon — only service_role (bypasses RLS) can write.
