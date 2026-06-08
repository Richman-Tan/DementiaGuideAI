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
  search_vector tsvector,
  source_url  text,
  source_org  text,
  embedding   vector(1536)
);

-- Backward-compatible migration for existing tables created before search_vector.
alter table knowledge_chunks
  add column if not exists search_vector tsvector;

-- 3. Index for fast approximate nearest-neighbour search
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);  -- for ~70 rows, lists=10 is fine; raise for larger tables

-- 3b. Maintain full-text search vector for hybrid keyword ranking
create or replace function knowledge_chunks_search_vector_update()
returns trigger
language plpgsql
as $$
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
for each row
execute function knowledge_chunks_search_vector_update();

-- Backfill for existing rows
update knowledge_chunks
set search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' ||
  coalesce(content, '') || ' ' ||
  coalesce(array_to_string(tags, ' '), '')
)
where search_vector is null;

-- Index for full-text keyword ranking in hybrid search
create index if not exists knowledge_chunks_search_idx
  on knowledge_chunks
  using gin (search_vector);

-- 4. Server-side similarity search function
--    Called by the app via supabase.rpc('match_chunks', {...})
create or replace function match_chunks(
  query_embedding vector(1536),
  query_text     text  default '',
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
  with query_terms as (
    select case
      when query_text is null or btrim(query_text) = '' then null::tsquery
      else websearch_to_tsquery('english', query_text)
    end as tsq
  )
  select
    kc.id,
    kc.category,
    kc.title,
    kc.content,
    kc.tags,
    kc.source_url,
    kc.source_org,
    (
      0.7 * (1 - (kc.embedding <=> query_embedding)) +
      0.3 * coalesce(ts_rank_cd(
        kc.search_vector,
        qt.tsq
      ), 0)
    )::float as similarity
  from knowledge_chunks kc
  cross join query_terms qt
  where (1 - (kc.embedding <=> query_embedding)) > min_similarity
     or (
       qt.tsq is not null
       and kc.search_vector @@ qt.tsq
     )
  order by similarity desc
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
