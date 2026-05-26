-- ============================================================
-- Run this entire file once in Supabase → SQL Editor
-- before running the migration script.
-- ============================================================

-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Knowledge base table
--    embedding is vector(1536) to match text-embedding-3-small output
create table if not exists knowledge_chunks (
  id          text primary key,
  category    text        not null,
  title       text        not null,
  content     text        not null,
  tags        text[]      default '{}',
  source_url  text,
  source_org  text,
  embedding   vector(1536)
);

-- 3. Index for fast approximate nearest-neighbour search
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);  -- for ~70 rows, lists=10 is fine; raise for larger tables

-- 4. Server-side similarity search function
--    Called by the app via supabase.rpc('match_chunks', {...})
create or replace function match_chunks(
  query_embedding vector(1536),
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
--    The service_role key used in the migration script can write.
alter table knowledge_chunks enable row level security;

create policy "Public read access"
  on knowledge_chunks for select
  using (true);

-- No insert/update/delete policy for anon — only service_role (bypasses RLS) can write.
