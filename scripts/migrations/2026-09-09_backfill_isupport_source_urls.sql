-- 2026-09-09 — backfill source_url (and source_org where absent) on the live
-- iSupport chunks, so citations can link to their original source.
--
-- Why: the source drawer offers "View original source" only when a chunk
-- carries a source_url, and none of the ~377 live iSupport chunks do (audit
-- finding F-13: they predate the ingestion registry and exist only in the DB).
-- 85% of the corpus therefore cites with no way through to the publisher —
-- pilot feedback: "not all of them had links". The WHO manual's canonical URL
-- is recorded in scripts/ingest/registry.js (isupport-who-v2026) and
-- content/sources/MANIFEST.md; this stamps it onto the legacy WHO chunks.
--
-- Retrieval is untouched: match_chunks does not read source_url.
-- Run manually in the Supabase SQL editor (anon key is read-only).

-- ── PREFLIGHT — check the live document_id spellings and counts first ─────────
-- 2026-09-09 preflight against production found the DB ahead of the 2026-07
-- snapshot: isupport-who = 152 rows, ALL already carrying the WHO IRIS
-- bitstream URL + org (the WHO block below is a verified no-op), and
-- isupport-nz = 176 rows with source_org already 'Alzheimers NZ' (the
-- registry's 'TBD' was stale) and source_url NULL.
select document_id, count(*) as chunks,
       count(*) filter (where source_url is not null) as with_url,
       count(*) filter (where source_org is not null) as with_org
from knowledge_chunks
where document_id like 'isupport%'
group by document_id;

-- ── UPDATE — WHO manual chunks ────────────────────────────────────────────────
update knowledge_chunks
set source_url = 'https://iris.who.int/handle/10665/324794'
where document_id = 'isupport-who'
  and source_url is null;

update knowledge_chunks
set source_org = 'World Health Organization'
where document_id = 'isupport-who'
  and source_org is null;

-- ── isupport-nz — org-level URL ───────────────────────────────────────────────
-- The live rows already attribute these chunks to Alzheimers NZ (source_org
-- set at ingest), which settles the publisher question the registry left TBD.
-- Backfill the org-level URL, matching the 18 curated Alzheimers NZ chunks
-- that link the same page. Deep links remain a content task.
update knowledge_chunks
set source_url = 'https://alzheimers.org.nz/'
where document_id = 'isupport-nz'
  and source_url is null;

-- ── VERIFY ────────────────────────────────────────────────────────────────────
-- Expect: isupport-who → 152 with the IRIS URL; isupport-nz → 176 with the
-- Alzheimers NZ URL; zero corpus-wide rows with source_url NULL.
select document_id, count(*) as chunks,
       count(*) filter (where source_url = 'https://iris.who.int/handle/10665/324794') as with_who_url,
       count(*) filter (where source_org = 'World Health Organization') as with_who_org
from knowledge_chunks
where document_id like 'isupport%'
group by document_id;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- Un-set exactly what this file wrote (the WHO block was a no-op in prod).
-- update knowledge_chunks
-- set source_url = null
-- where document_id = 'isupport-nz'
--   and source_url = 'https://alzheimers.org.nz/';
