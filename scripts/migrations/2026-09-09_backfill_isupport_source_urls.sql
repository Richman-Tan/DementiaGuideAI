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
-- Expected from the 2026-07 snapshot: isupport-who 148, isupport-nz 229.
-- If the WHO count or spelling differs, STOP and reconcile before updating.
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

-- ── isupport-nz — NEEDS CONFIRMATION, do not run as-is ────────────────────────
-- The NZ adaptation's publisher is still unidentified (registry.js:
-- 'TBD — NZ adaptation publisher', enabled: false, licence gate). Linking 229
-- chunks to a guessed URL would misattribute them; leave these unlinked (the
-- drawer now says a source has no public link) until the publisher and an
-- official distribution page are confirmed with the research team.
--
-- update knowledge_chunks
-- set source_url = '<CONFIRMED NZ ADAPTATION URL>',
--     source_org = '<CONFIRMED PUBLISHER>'
-- where document_id = 'isupport-nz'
--   and source_url is null;

-- ── VERIFY ────────────────────────────────────────────────────────────────────
-- Expect: isupport-who → 148 chunks, 148 with_url, 148 with_org;
--         isupport-nz untouched (0 with_url until its block runs).
select document_id, count(*) as chunks,
       count(*) filter (where source_url = 'https://iris.who.int/handle/10665/324794') as with_who_url,
       count(*) filter (where source_org = 'World Health Organization') as with_who_org
from knowledge_chunks
where document_id like 'isupport%'
group by document_id;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- The legacy chunks had NULL in both columns (that absence is finding F-13), so
-- rollback is a plain un-set of exactly what this file wrote.
-- update knowledge_chunks
-- set source_url = null
-- where document_id = 'isupport-who'
--   and source_url = 'https://iris.who.int/handle/10665/324794';
-- update knowledge_chunks
-- set source_org = null
-- where document_id = 'isupport-who'
--   and source_org = 'World Health Organization';
