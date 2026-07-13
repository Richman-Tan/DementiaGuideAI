-- ============================================================================
-- Migration: resolve ambiguous match_chunks() overloads (PGRST203)
-- Date: 2026-07-13
-- ============================================================================
--
-- PROBLEM
-- -------
-- The app calls the RPC with four named args:
--     match_chunks(query_embedding, query_text, match_count, min_similarity)
-- but the database has THREE functions named match_chunks (confirmed via STEP 1
-- on 2026-07-13):
--
--   (Z) match_chunks(query_embedding vector, match_count int,
--                    min_similarity double precision)                    -- 3 args, legacy pure-vector
--
--   (A) match_chunks(query_embedding vector, query_text text,
--                    match_count int, min_similarity double precision)   -- 4 args
--
--   (B) match_chunks(query_embedding vector, query_text text,
--                    match_count int, min_similarity double precision,
--                    filter_country text, filter_source_version text,
--                    filter_document_id text, filter_module int)         -- 8 args (extras default)
--
-- Because (B)'s extra four parameters have DEFAULT values, the app's four-argument
-- call matches BOTH (A) and (B). PostgREST cannot choose and returns:
--     PGRST203 "Could not choose the best candidate function ..."
-- The practical effect: openaiService.search() throws on EVERY query, so RAG
-- retrieval (and therefore the whole chat/voice response) is currently broken.
-- (Z) is the stale definition from the old committed supabase-setup.sql; it does
-- not match the app's call but is dead clutter and is dropped too.
--
-- FIX
-- ---
-- Keep exactly ONE match_chunks. Function (B) is the intended one — it supports
-- hybrid vector + full-text search (query_text against the search_vector column)
-- and optional iSupport filters (country / source_version / document_id / module),
-- and its extra params default to NULL, so the app's four-arg call still works.
-- Drop the redundant four-arg overload (A).
--
-- >>> Run this in Supabase → SQL Editor. Review STEP 1 output before STEP 2. <<<
-- ============================================================================

-- STEP 1 — inspect what is actually deployed (run first; confirm two rows).
select
  p.oid::regprocedure                as signature,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'match_chunks'
  and n.nspname = 'public'
order by p.pronargs;

-- STEP 2 — drop the two legacy overloads (Z) and (A), keeping the 8-arg (B).
-- Types must match the deployed signatures exactly.
drop function if exists public.match_chunks(
  vector,            -- query_embedding
  integer,           -- match_count
  double precision   -- min_similarity
);                   -- (Z) legacy pure-vector, 3 args
drop function if exists public.match_chunks(
  vector,            -- query_embedding
  text,              -- query_text
  integer,           -- match_count
  double precision   -- min_similarity
);                   -- (A) redundant, 4 args

-- STEP 3 — verify only ONE match_chunks remains (expect a single row, the 8-arg).
select
  p.oid::regprocedure as signature,
  p.pronargs          as n_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'match_chunks' and n.nspname = 'public';

-- STEP 4 — (optional) capture the surviving definition so the repo can be kept
-- in sync. Paste the output into scripts/supabase-setup.sql, replacing the
-- placeholder function block there.
--   select pg_get_functiondef('public.match_chunks(vector,text,int,float,text,text,text,int)'::regprocedure);

-- ============================================================================
-- ALTERNATIVE (only if the filtered/hybrid function (B) is NOT wanted):
-- drop (B) instead and keep the simpler 4-arg (A). Do NOT run both branches.
--   drop function if exists public.match_chunks(
--     vector, text, integer, double precision,
--     text, text, text, integer
--   );
-- ============================================================================
