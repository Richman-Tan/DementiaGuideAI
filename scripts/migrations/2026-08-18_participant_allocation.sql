-- Auto-allocated participant numbers.
--
-- RUN AFTER 2026-08-18_study_tables.sql (it reads study_sessions).
--
-- Why this exists
-- ---------------
-- The study is distributed through one shared access code passed around by the
-- supervisor, rather than an individually addressed invitation. Nobody is
-- handing each participant their own number, so two people will eventually type
-- the same one.
--
-- That is not a validation error the application can catch. study_sessions has a
-- unique index on participant_code, so session.js finds the existing row and
-- returns it as a RESUME: the second person is dropped into the first person's
-- session at whatever step they had reached, and their events append to the same
-- session_id. One row, two participants, interleaved data, and no error raised
-- anywhere — the failure is silent and only visible at analysis, if at all.
--
-- nextval is atomic under concurrency. Two people pressing Start in the same
-- second cannot receive the same number, which is the one property that has to
-- hold and the one that application-level "pick max + 1" cannot give.

create sequence if not exists public.study_participant_seq as integer start 1;

-- Never hand out a number that already exists, and never move backwards. This
-- runs on every re-run of the migration, so it must be safe to repeat: rewinding
-- the sequence mid-study would reissue live participant numbers.
select setval(
  'public.study_participant_seq',
  greatest(
    (select coalesce(max(participant_number), 0) from public.study_sessions),
    (select last_value from public.study_participant_seq)
  ) + 1,
  false                                    -- false: the next nextval RETURNS this value
);

-- security definer so the sequence itself needs no direct grants, and the
-- function stays the only way to advance it.
create or replace function public.claim_participant_number()
returns integer
language sql
security definer
set search_path = public
as $$
  select nextval('public.study_participant_seq')::integer
$$;

-- Same posture as the rest of the study schema: service_role only. A participant
-- must not be able to burn through numbers from the browser.
revoke execute on function public.claim_participant_number() from public, anon, authenticated;
grant execute on function public.claim_participant_number() to service_role;

-- ============================================================
-- VERIFY
-- ============================================================
--
-- 1. Consecutive calls never repeat, and start above anything already assigned:
--
--    select public.claim_participant_number();   -- e.g. 1
--    select public.claim_participant_number();   -- e.g. 2
--
--    Then put them back so the study does not start at 3:
--
--    select setval('public.study_participant_seq',
--      greatest((select coalesce(max(participant_number),0) from public.study_sessions), 0) + 1,
--      false);
--
-- 2. THE ONE THAT MUST BE TESTED FROM OUTSIDE THE SQL EDITOR.
--    The editor runs as superuser, so it proves nothing about who can actually
--    call this. The anon key the browser ships must be refused:
--
--    curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/claim_participant_number" \
--         -H "apikey: $VITE_SUPABASE_ANON_KEY" \
--         -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
--
--    Expect a permission error. Then the same call with the service-role key,
--    which must return a number — if it cannot, every participant is refused a
--    session and the study cannot run at all.
-- ============================================================
