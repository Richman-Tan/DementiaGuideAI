-- ============================================================
-- Study tables — usability study session capture
-- Date: 2026-08-18 · Status: RUN (verified 2026-08-24 — the anon key gets
--   PostgreSQL 42501 "permission denied" on study_events and study_sessions,
--   which is VERIFY step 4's pass condition and pilot go/no-go gate 3)
--
-- Why: the usability study (docs/study/) is unmoderated and remote, so the
-- application itself has to record what happens. Today nothing is persisted
-- beyond localStorage, which means an unmoderated session would produce no
-- recoverable data at all.
--
-- THE CONTROL THAT MATTERS: none of these tables may be readable with the
-- anonymous key the web client uses for knowledge-base retrieval. RLS is
-- enabled with NO policies, and privileges are revoked from anon/authenticated,
-- so every read and write must go through the server-side endpoints using the
-- service role key (which bypasses RLS by design).
-- See docs/study/ethics/data-management-plan.md §4.
--
-- Additive only: creates new objects, touches nothing existing.
-- Run in the Supabase SQL editor.
-- ============================================================

begin;

-- ─── One row per participant ────────────────────────────────────────────────

create table if not exists public.study_sessions (
  id                   uuid primary key default gen_random_uuid(),
  participant_code     text        not null,
  participant_number   int         not null,
  participant_group    text,                      -- caregiver | worker | plwd | pilot
  arm_order            text        not null,      -- 'AB' | 'BA'
  set_order            text        not null,      -- '12' | '21'
  is_pilot             boolean     not null default false,
  consent              jsonb       not null default '{}'::jsonb,
  consent_transcripts  boolean     not null default false,
  -- Participants living with dementia take part with a support person present.
  -- Recorded because protocol.md §3.3 commits to it, and because a session
  -- without one should be visible in the data, not just refused in the UI.
  supporter_present    boolean,
  -- Resume checkpoint. localStorage is not enough: the case that most needs
  -- resume (cleared storage, private window, second device) is the one where
  -- localStorage is gone.
  step                 text        not null default 'background',
  stage_index          int         not null default 0,
  task_index           int         not null default 0,
  user_agent           text,
  browser              text,
  renderer             text,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  stopped_early        boolean     not null default false,
  constraint study_sessions_arm_order_chk check (arm_order in ('AB', 'BA')),
  constraint study_sessions_set_order_chk check (set_order in ('12', '21'))
);

-- One session per participant code; resuming returns the existing row.
create unique index if not exists study_sessions_participant_code_idx
  on public.study_sessions (participant_code);

-- ─── Append-only event log ──────────────────────────────────────────────────
-- Deliberately schemaless in `payload`: instruments change during piloting and
-- a column per question would mean a migration each time.

create table if not exists public.study_events (
  id                bigserial   primary key,
  -- Dedup key, generated on the client. NOT (session_id, seq): seq lives in
  -- localStorage, so a cleared browser restarts it at 1 and every subsequent
  -- event would collide with an existing row and be silently dropped.
  event_uuid        uuid        not null,
  session_id        uuid        not null references public.study_sessions(id) on delete cascade,
  participant_code  text        not null,
  seq               int         not null,   -- client-side monotonic ordering
  kind              text        not null,   -- see docs/study/README.md
  arm               text,                   -- 'A' | 'B' | null
  task_id           text,
  payload           jsonb       not null default '{}'::jsonb,
  client_ts         timestamptz,
  created_at        timestamptz not null default now(),
  constraint study_events_arm_chk check (arm is null or arm in ('A', 'B'))
);

-- Serves ordered reads per session; the unique index below is on a different
-- column, so this one is not redundant.
create index if not exists study_events_session_seq_idx
  on public.study_events (session_id, seq);
create index if not exists study_events_kind_idx
  on public.study_events (kind);

-- Idempotent replay: the client retries batches on network failure and flushes a
-- final batch via sendBeacon, so the same event can legitimately arrive twice.
create unique index if not exists study_events_uuid_uniq
  on public.study_events (event_uuid);

-- ─── Per-code request metering ──────────────────────────────────────────────
-- Serverless functions are stateless, so the cap is counted here. The real
-- backstop is the hard spend cap on the OpenAI account; this stops a leaked
-- access code quietly burning it.

create table if not exists public.study_usage (
  code   text not null,
  day    date not null default (now() at time zone 'utc')::date,
  count  int  not null default 0,
  primary key (code, day)
);

create or replace function public.bump_study_usage(p_code text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into study_usage (code, day, count)
  values (p_code, (now() at time zone 'utc')::date, 1)
  on conflict (code, day) do update set count = study_usage.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- ─── Lock everything down ───────────────────────────────────────────────────

alter table public.study_sessions enable row level security;
alter table public.study_events   enable row level security;
alter table public.study_usage    enable row level security;

-- No policies are created on purpose. With RLS on and no policy, anon and
-- authenticated can read nothing; service_role bypasses RLS.
revoke all on table public.study_sessions from anon, authenticated;
revoke all on table public.study_events   from anon, authenticated;
revoke all on table public.study_usage    from anon, authenticated;
revoke all on function public.bump_study_usage(text, int) from public, anon, authenticated;

-- service_role currently reaches these only because Supabase's ALTER DEFAULT
-- PRIVILEGES fired at create time. That is an implicit dependency: on a restored
-- project, a different creating role, or hardened defaults, it is absent — and
-- the failure is silent, because the request meter fails open. Grant explicitly.
grant select, insert, update on table public.study_sessions to service_role;
grant select, insert, update on table public.study_events   to service_role;
grant select, insert, update on table public.study_usage    to service_role;
grant usage, select on sequence public.study_events_id_seq  to service_role;
grant execute on function public.bump_study_usage(text, int) to service_role;

commit;

-- ============================================================
-- VERIFY — run after the migration, and check each line reads as described.
-- ============================================================
--
-- 1. All three tables exist with RLS enabled and ZERO policies:
--
--    select c.relname,
--           c.relrowsecurity                              as rls_enabled,
--           (select count(*) from pg_policies p
--             where p.schemaname = 'public' and p.tablename = c.relname) as policies
--      from pg_class c
--      join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public'
--       and c.relname in ('study_sessions', 'study_events', 'study_usage');
--
--    Expect: three rows, rls_enabled = true, policies = 0.
--
-- 2. anon and authenticated hold no privileges on them:
--
--    select grantee, table_name, privilege_type
--      from information_schema.role_table_grants
--     where table_schema = 'public'
--       and table_name in ('study_sessions', 'study_events', 'study_usage')
--       and grantee in ('anon', 'authenticated');
--
--    Expect: zero rows. Any row here is a hard stop — see
--    docs/study/pilot-checklist.md gate 3.
--
-- 3. The meter counts and enforces:
--
--    select public.bump_study_usage('verify-code', 2);   -- expect t (count 1)
--    select public.bump_study_usage('verify-code', 2);   -- expect t (count 2)
--    select public.bump_study_usage('verify-code', 2);   -- expect f (count 3)
--    delete from public.study_usage where code = 'verify-code';
--
--    NB this runs as the owning role and therefore proves nothing about
--    service_role. Step 5 is the one that does.
--
-- 5. THE METER IS REACHABLE BY THE ROLE THAT ACTUALLY CALLS IT.
--    If service_role cannot execute the function, the endpoints keep working and
--    the request cap silently disappears for the whole study (the meter fails
--    open on error, by design). Prove it from outside:
--
--    curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/bump_study_usage" \
--         -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--         -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--         -H "Content-Type: application/json" \
--         -d '{"p_code":"verify-code","p_limit":2}'
--
--    Expect `true`. Then the same call with $VITE_SUPABASE_ANON_KEY — expect a
--    permission error, never `true`. Clean up the row afterwards.
--
-- 4. THE ONE THAT MUST BE TESTED FROM OUTSIDE THE SQL EDITOR.
--    The SQL editor runs as a superuser and will happily read these tables, so
--    step 2 above is necessary but not sufficient. Prove it with the anon key
--    the web app actually ships:
--
--    curl -s "$VITE_SUPABASE_URL/rest/v1/study_events?select=*&limit=1" \
--         -H "apikey: $VITE_SUPABASE_ANON_KEY" \
--         -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
--
--    Expect a permission error or an empty result — never a row.
-- ============================================================
