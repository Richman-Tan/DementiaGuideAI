-- claim_participant_number() must skip numbers that already have a row.
--
-- RUN AFTER 2026-08-18_participant_allocation.sql (it replaces its function).
--
-- Why this exists
-- ---------------
-- The original function is a bare nextval. Its collision guard — seed the
-- sequence above max(participant_number) — runs only when the MIGRATION runs,
-- not on each claim. But rows can appear at numbers ahead of the sequence at
-- any time: session.js inserts a typed participant code verbatim (the
-- cross-device resume path), and test rows/manual resets move the two out of
-- step. Once a future number is occupied, the sequence eventually reaches it,
-- the insert hits study_sessions' unique index, and that participant's
-- enrolment fails with a 500 at the Start button.
--
-- Observed for real on 2026-09-02: a P05 row existed (a tester's session)
-- while the sequence handed out 2 — on course to collide at 5.
--
-- nextval stays the source of numbers, so concurrency is unchanged: two
-- simultaneous claims still cannot receive the same value. The loop only
-- discards values that are already taken. A number skipped this way is burned,
-- which is exactly the old migration's stance ("never move backwards").

create or replace function public.claim_participant_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  loop
    n := nextval('public.study_participant_seq')::integer;
    exit when not exists (
      select 1 from public.study_sessions where participant_number = n
    );
  end loop;
  return n;
end
$$;

-- create or replace preserves ACLs, but restate them so this file also stands
-- alone on a fresh database.
revoke execute on function public.claim_participant_number() from public, anon, authenticated;
grant execute on function public.claim_participant_number() to service_role;

-- ============================================================
-- VERIFY (service role)
-- ============================================================
--
-- With a row at some number N ahead of the sequence:
--
--   select public.claim_participant_number();  -- repeat until just below N
--   select public.claim_participant_number();  -- must return N+1, not N
--
-- Then put the sequence back where enrolment should continue from:
--
--   select setval('public.study_participant_seq', <next number>, false);
-- ============================================================
