-- Separate the feedback round's sessions from the tasks study's.
--
-- RUN AFTER 2026-08-19_study_version_stamp.sql, and BEFORE setting
-- STUDY_PROTOCOLS=tasks,feedback on the API. The API reads and writes this
-- column only when that variable enables the feedback round, so until then the
-- deployed code ignores it and this migration changes nothing it depends on.
-- Purely additive for existing rows: every one of them is a tasks session,
-- which is what the default says.
--
-- Why this exists
-- ---------------
-- The feedback round (docs/study/protocol-feedback.md) runs through the same
-- tables: carers use the app freely, flag answers and answer open questions.
-- It has no arms and no task sets, so its sessions must be told apart from the
-- tasks study's in every export, and must not carry a Latin-square cell they
-- were never assigned. STUDY_VERSION is deliberately not bumped for it: doing so
-- would mark the existing 1.1 tasks sessions as unpoolable for no reason.

begin;

alter table public.study_sessions
  add column if not exists protocol text not null default 'tasks';

alter table public.study_sessions
  drop constraint if exists study_sessions_protocol_chk;
alter table public.study_sessions
  add constraint study_sessions_protocol_chk check (protocol in ('tasks', 'feedback'));

-- A feedback session has no arm or set order. Null rather than a placeholder
-- 'AB', so nothing downstream can mistake it for a tasks session; the existing
-- checks still pass for null, and a tasks session must still have both.
alter table public.study_sessions
  alter column arm_order drop not null,
  alter column set_order drop not null;
alter table public.study_sessions
  drop constraint if exists study_sessions_tasks_assignment_chk;
alter table public.study_sessions
  add constraint study_sessions_tasks_assignment_chk
  check (protocol <> 'tasks' or (arm_order is not null and set_order is not null));

comment on column public.study_sessions.protocol is
  '''tasks'' (the evaluated within-subjects study) or ''feedback'' (the Oct 2026 '
  'user-experience round, docs/study/protocol-feedback.md).';

commit;

-- VERIFY -----------------------------------------------------------------------
--
-- Every existing session is a tasks session, and still has its assignment:
--
--   select protocol, count(*), count(arm_order) as with_arm_order
--   from public.study_sessions group by protocol;
--
-- Expected: one row, protocol = 'tasks', count = with_arm_order.
