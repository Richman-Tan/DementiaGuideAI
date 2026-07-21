-- ============================================================
-- Migration A — provenance columns for knowledge_chunks
-- Date: 2026-07-17 · Status: NOT YET RUN
--
-- Why: document_id / module / chunk_level currently live as strings inside
-- tags[] (e.g. 'document_id:isupport-nz', 'module:3', 'chunk_level:child'),
-- and there is no record of source version, licence, content hash, or when a
-- chunk was embedded (audit F-13). This migration adds first-class columns and
-- backfills them from tags. tags[] is left untouched (dual-read window: the
-- app keeps reading tags until Stage 10 switches it to the columns).
--
-- Safe on live data: additive columns only, single transaction, no writes to
-- existing columns other than the new ones. Run in Supabase SQL editor.
-- ============================================================

begin;

alter table knowledge_chunks
  add column if not exists document_id     text,
  add column if not exists source_version  text,
  add column if not exists country         text,
  add column if not exists module          int,
  add column if not exists chunk_level     text,
  add column if not exists content_hash    text,
  add column if not exists embedding_model text,
  add column if not exists embedded_at     timestamptz,
  add column if not exists licence         text;

-- chunk_level sanity (allow null for chunks without the concept)
alter table knowledge_chunks
  drop constraint if exists knowledge_chunks_chunk_level_check;
alter table knowledge_chunks
  add constraint knowledge_chunks_chunk_level_check
  check (chunk_level is null or chunk_level in ('parent', 'child'));

-- ── Backfill from tags[] ────────────────────────────────────────────────────
-- document_id: from 'document_id:<value>' tag; hand-authored chunks (no tag)
-- become the 'curated' document.
update knowledge_chunks kc
set document_id = coalesce(
  (select split_part(t, ':', 2) from unnest(kc.tags) t where t like 'document_id:%' limit 1),
  'curated'
)
where kc.document_id is null;

-- module: from 'module:<n>' tag (iSupport course structure).
update knowledge_chunks kc
set module = (select nullif(split_part(t, ':', 2), '')::int
              from unnest(kc.tags) t where t like 'module:%' limit 1)
where kc.module is null
  and exists (select 1 from unnest(kc.tags) t where t like 'module:%');

-- chunk_level: from 'chunk_level:parent|child' tag.
update knowledge_chunks kc
set chunk_level = (select split_part(t, ':', 2)
                   from unnest(kc.tags) t where t like 'chunk_level:%' limit 1)
where kc.chunk_level is null
  and exists (select 1 from unnest(kc.tags) t
              where t in ('chunk_level:parent', 'chunk_level:child'));

-- country: from 'country:<cc>' tag where present; iSupport-NZ implies NZ,
-- iSupport-WHO is global. Curated chunks intentionally left NULL until the
-- Stage 9 NZ content review assigns them.
update knowledge_chunks kc
set country = coalesce(
  (select upper(split_part(t, ':', 2)) from unnest(kc.tags) t where t like 'country:%' limit 1),
  case
    when kc.document_id like 'isupport-nz%'  then 'NZ'
    when kc.document_id like 'isupport-who%' then 'GLOBAL'
  end
)
where kc.country is null;

-- All existing rows were embedded with text-embedding-3-small at unknown
-- times; record the model, leave embedded_at NULL (honest: unknown).
update knowledge_chunks
set embedding_model = 'text-embedding-3-small'
where embedding_model is null and embedding is not null;

-- Metadata index for filtered retrieval + inventory queries.
create index if not exists knowledge_chunks_doc_country_idx
  on knowledge_chunks (document_id, country);

commit;

-- ── VERIFY (run after commit; paste output back) ───────────────────────────
-- select document_id, country, count(*),
--        count(*) filter (where module is not null)      as with_module,
--        count(*) filter (where chunk_level is not null) as with_level
-- from knowledge_chunks group by 1, 2 order by 3 desc;
--
-- select count(*) filter (where document_id is null) as missing_doc  -- expect 0
-- from knowledge_chunks;

-- ── ROLLBACK (only if needed) ───────────────────────────────────────────────
-- begin;
-- drop index if exists knowledge_chunks_doc_country_idx;
-- alter table knowledge_chunks
--   drop column if exists document_id,
--   drop column if exists source_version,
--   drop column if exists country,
--   drop column if exists module,
--   drop column if exists chunk_level,
--   drop column if exists content_hash,
--   drop column if exists embedding_model,
--   drop column if exists embedded_at,
--   drop column if exists licence;
-- commit;
