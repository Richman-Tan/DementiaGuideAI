-- ============================================================
-- Supabase schema for the DementiaGuide AI knowledge base.
-- Run this entire file once in Supabase → SQL Editor before seeding.
--
-- ⚠️  FRESH DATABASE ONLY. Do NOT re-run against the existing production
--     database: the `create or replace function` below would overwrite the
--     richer hybrid match_chunks() that production actually uses (see note in
--     section 4 and scripts/migrations/2026-07-13_fix_match_chunks_overload.sql).
--
-- Updated 2026-07-13 to reflect the live schema: the table has a `search_vector`
-- column for full-text search and match_chunks takes a `query_text` argument, so
-- retrieval is hybrid (vector similarity + keyword). Production also carries a
-- larger corpus (~449 chunks incl. WHO/NZ iSupport material) and an 8-argument
-- match_chunks overload with iSupport filters; that overload is the source of
-- truth in production and should be dumped from there with pg_get_functiondef().
-- ============================================================

-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Knowledge base table
--    embedding is vector(1536) to match text-embedding-3-small output.
--    search_vector powers the keyword half of hybrid retrieval.
--
--    ⚠️  KNOWN DIVERGENCE (verified 2026-07-17): production declares
--    search_vector as a PLAIN tsvector column (information_schema reports
--    is_generated = NEVER), not GENERATED ALWAYS as written below, and
--    maintains it by other means (trigger presumed — confirm via
--    scripts/migrations/2026-07-16_production_snapshot_request.sql). The stored
--    VALUES do match this expression: title lexemes occupy positions 1..n
--    followed by content. Fresh databases created from this file get the
--    generated column, which is equivalent for reads but NOT identical DDL.
create table if not exists knowledge_chunks (
  id             text primary key,
  category       text        not null,
  title          text        not null,
  content        text        not null,
  tags           text[]      default '{}',
  source_url     text,
  source_org     text,
  embedding      vector(1536),
  search_vector  tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored
);

-- 3. Indexes
--    ivfflat for approximate nearest-neighbour vector search; raise `lists` as the
--    table grows (rule of thumb ~sqrt(rows); ~449 rows today → lists ≈ 20).
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 20);

--    GIN index for the full-text half of hybrid search.
create index if not exists knowledge_chunks_search_vector_idx
  on knowledge_chunks
  using gin (search_vector);

-- 4. Server-side retrieval function — called by the app via
--    supabase.rpc('match_chunks', { query_embedding, query_text, match_count, min_similarity }).
--
--    IMPORTANT: keep exactly ONE function named match_chunks. Two overloads whose
--    extra args all default make the app's 4-arg call ambiguous (PostgREST PGRST203)
--    and break retrieval entirely — see the migration referenced above.
--
--    This minimal definition accepts query_text (so the app's call resolves) and
--    ranks by vector similarity. Production additionally blends the search_vector
--    keyword match and supports filter_country / filter_source_version /
--    filter_document_id / filter_module; treat the production definition as
--    authoritative and reconcile this block with pg_get_functiondef() output.
create or replace function match_chunks(
  query_embedding vector(1536),
  query_text      text  default '',
  match_count     int   default 5,
  min_similarity  float default 0.25
)
returns table (
  id         text,
  category   text,
  title      text,
  content    text,
  tags       text[],
  source_url text,
  source_org text,
  similarity float
)
language sql stable as $$
  select
    id,
    category,
    title,
    content,
    tags,
    source_url,
    source_org,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where 1 - (embedding <=> query_embedding) > min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Row Level Security
--    The anon key used in the app can only READ.
--    The service_role key used in the seeding script can write.
alter table knowledge_chunks enable row level security;

create policy "Public read access"
  on knowledge_chunks for select
  using (true);

-- No insert/update/delete policy for anon — only service_role (bypasses RLS) can write.
