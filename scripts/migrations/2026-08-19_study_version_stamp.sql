-- Record which version of the instrument set each session ran under.
--
-- RUN AFTER 2026-08-18_study_tables.sql. Run it BEFORE deploying the API change
-- that populates the column — this migration is purely additive with a default,
-- so the currently-deployed code (which does not send the field) keeps working
-- against it unchanged, and there is no window in which either half is broken.
--
-- Why this exists
-- ---------------
-- STUDY_VERSION already existed in packages/core/study/studyConfig.mjs and was
-- already returned to the client in the session response — but it was never
-- written anywhere. The value that identifies which instruments a participant
-- answered lived only in a JSON reply that nothing kept.
--
-- That was harmless while there had only ever been one version. Version 1.1 adds
-- two Likert items (personalisation, actionability) and turn modality, so from
-- now on "was this participant asked the same questions as that one?" is a real
-- question, and the answer has to be in the row rather than inferred.
--
-- Inferring it does not work. A 1.0 session and a 1.1 session where the
-- participant skipped both new items are indistinguishable in sus.csv: every
-- item is skippable by design, so a null means "not asked" and "asked, declined"
-- equally. Pooling those two under one heading is exactly the kind of quiet
-- error the study's reporting discipline exists to prevent.
--
-- The default is '1.0' rather than the current version on purpose: any row that
-- already exists was created before this column did, which is precisely what 1.0
-- means. Backfilling them to 1.1 would assert they carried items that had not
-- been written yet.

alter table public.study_sessions
  add column if not exists study_version text not null default '1.0';

comment on column public.study_sessions.study_version is
  'Instrument-set version from packages/core/study/studyConfig.mjs at session '
  'start. Sessions on different versions are not poolable; see '
  'docs/study/instruments.md §5.';

-- VERIFY -----------------------------------------------------------------------
--
-- 1. The column exists, is NOT NULL, and defaults to 1.0:
--
--      select column_name, data_type, is_nullable, column_default
--      from information_schema.columns
--      where table_schema = 'public'
--        and table_name = 'study_sessions'
--        and column_name = 'study_version';
--
--    Expect: text | NO | '1.0'::text
--
-- 2. Existing rows were stamped 1.0, not left null:
--
--      select study_version, count(*)
--      from public.study_sessions
--      group by study_version;
--
-- 3. After the API is deployed, a NEW session must come back as 1.1. Start one
--    and check the row rather than trusting the response body — the response
--    reported this value correctly for months while nothing stored it:
--
--      select participant_code, study_version, started_at
--      from public.study_sessions
--      order by started_at desc
--      limit 5;
--
--    A new row still reading 1.0 means the deploy has not landed.
