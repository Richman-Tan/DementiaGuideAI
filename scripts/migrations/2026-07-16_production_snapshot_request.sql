-- ============================================================
-- PRODUCTION SNAPSHOT REQUEST — read-only, safe to run as-is.
--
-- Purpose: the production `match_chunks` hybrid function is the load-bearing
-- retrieval logic but its body is NOT in this repo (supabase-setup.sql holds
-- only a vector-only placeholder). We also need to know what maintains
-- `search_vector`: production reports is_generated = NEVER, yet every row has
-- a populated vector matching to_tsvector('english', title || ' ' || content),
-- so a trigger (or a manual backfill) must be doing it. Ingestion correctness
-- depends on knowing which.
--
-- ⚠️  HOW TO RUN: the Supabase SQL editor returns only the LAST statement's
--     result set. This file is therefore ONE query returning everything as a
--     single table. Run it and paste the whole result back.
--
-- Nothing here modifies the database.
-- ============================================================

select 'function' as kind,
       p.oid::regprocedure::text as name,
       pg_get_functiondef(p.oid) as detail
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'match_chunks' and n.nspname = 'public'

union all
select 'trigger',
       t.tgname,
       pg_get_triggerdef(t.oid)
from pg_trigger t
where t.tgrelid = 'knowledge_chunks'::regclass
  and not t.tgisinternal

union all
select 'trigger_function',
       p.proname,
       pg_get_functiondef(p.oid)
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'knowledge_chunks'::regclass
  and not t.tgisinternal

union all
select 'column_default',
       a.attname,
       pg_get_expr(d.adbin, d.adrelid)
from pg_attribute a
join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'knowledge_chunks'::regclass

union all
select 'index',
       indexname,
       indexdef
from pg_indexes
where tablename = 'knowledge_chunks'

union all
select 'policy',
       polname,
       polcmd || ' USING ' || coalesce(pg_get_expr(polqual, polrelid), '(none)')
from pg_policy
where polrelid = 'knowledge_chunks'::regclass

union all
select 'category_count',
       category,
       count(*)::text
from knowledge_chunks
group by category

order by 1, 2;
