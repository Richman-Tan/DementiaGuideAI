-- ============================================================
-- PRODUCTION SNAPSHOT REQUEST — read-only, safe to run as-is.
--
-- Purpose: the production `match_chunks` hybrid function is the load-bearing
-- retrieval logic but its body is NOT in this repo (supabase-setup.sql holds
-- only a vector-only placeholder). Run each statement below in the Supabase
-- SQL editor and paste the full output back to Claude, so the definition can
-- be committed verbatim as scripts/migrations/2026-07-16_production_snapshot.sql.
--
-- Nothing here modifies the database.
-- ============================================================

-- 1. The full definition of every match_chunks overload (expect exactly one).
select p.oid::regprocedure as signature,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'match_chunks'
  and n.nspname = 'public';

-- 2. Corpus shape: rows per category.
select category, count(*) as chunks
from knowledge_chunks
group by category
order by chunks desc;

-- 3. Sample of iSupport metadata tags (document_id / module / chunk_level live in tags[]).
select id, tags
from knowledge_chunks
where exists (select 1 from unnest(tags) t where t like 'document_id:%')
limit 5;

-- 4. Distinct metadata tag keys in use across the corpus.
select split_part(t, ':', 1) as tag_key, count(*) as uses
from knowledge_chunks, unnest(tags) t
where t like '%:%'
group by 1
order by 2 desc;

-- 5. All indexes on the table.
select indexname, indexdef
from pg_indexes
where tablename = 'knowledge_chunks';

-- 6. RLS policies.
select polname, pg_get_expr(polqual, polrelid) as using_expr, polcmd
from pg_policy
where polrelid = 'knowledge_chunks'::regclass;

-- 7. Column list as deployed (to diff against supabase-setup.sql).
select column_name, data_type, is_nullable, is_generated
from information_schema.columns
where table_name = 'knowledge_chunks'
order by ordinal_position;
