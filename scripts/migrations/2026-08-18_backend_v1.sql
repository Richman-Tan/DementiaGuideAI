-- ============================================================
-- Backend v1 — identity, conversations, usage metering
-- Date: 2026-08-18 · Status: RUN (verified 2026-08-24 — `conversations` answers
--   an anon-key select with an empty set rather than PGRST205 "table not found")
--
-- Why: until now both clients held their own provider keys and kept
-- conversation history in device storage only (docs/architecture/backend-plan.md,
-- issue #48). Nobody without a paid API key could use the product, and nothing
-- a person said survived clearing their browser.
--
-- This adds the three things a server can own that a client cannot:
--   1. an identity to attach data to           → profiles (on auth.users)
--   2. conversations that outlive a browser    → conversations, messages
--   3. a record of what usage costs            → usage_events
--
-- IDENTITY IS ANONYMOUS BY DEFAULT. Supabase anonymous sign-in issues a durable
-- auth.uid() with no sign-up, so a caregiver who just wants an answer never
-- meets a registration wall — which for this audience is an accessibility
-- barrier, not a conversion metric. Linking an email later preserves the same
-- id, so nothing has to be migrated.
--
-- AUTHORISATION IS RLS, NOT APPLICATION CODE. A conversation row is unreadable
-- by anyone but its owner regardless of which code path asks, including a
-- mistake in ours. An `if` statement in an endpoint is one forgotten check away
-- from a leak; a policy is not.
--
-- LIVE-STATE NOTE (verified against production 2026-08-18): `profiles` and
-- `usage_events` ALREADY EXIST and are empty. They came from
-- scripts/migrations/2026-08-10_auth_and_usage.sql on the dormant
-- feat/auth-usage-metering branch, which still says "NOT YET RUN" — it was run.
-- That file is not on main, so this migration is the only record of them.
--
-- Consequence, and the reason this is not a plain re-run: the live
-- `usage_events` has NO `model` column, and `create table if not exists` would
-- silently skip it, so every metered insert would 400. The column is added
-- explicitly below. Check for the same drift before assuming any other table
-- here matches its definition.
--
-- Additive only. Run in the Supabase SQL editor.
-- Prerequisite: enable Anonymous Sign-ins in Auth → Providers.
-- ============================================================

begin;

-- ── 1. profiles ─────────────────────────────────────────────────────────────
-- One row per auth.users row, kept separate because Supabase owns that schema.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Runs as the function owner so it can insert despite the owner-only policies.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update using (auth.uid() = id);

-- No insert policy: rows come only from the trigger above.

-- ── 2. conversations + messages ─────────────────────────────────────────────

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  -- Which surface started it. Chat and Voice share a thread today; keeping the
  -- origin lets that change without a migration.
  surface    text not null default 'chat' check (surface in ('chat', 'voice')),
  -- Set for study sessions so each ARM gets its own conversation. Without this
  -- a within-subjects participant carries arm A's answers into arm B and can
  -- re-read them instead of searching, which would invalidate the comparison.
  study_arm  text check (study_arm is null or study_arm in ('A', 'B')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- Validated inline citations as rendered, so a reopened conversation shows the
  -- same sources without re-running retrieval.
  citations       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists "Own conversations" on public.conversations;
create policy "Own conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Messages are reached through their conversation, so ownership is checked
-- there. `exists` rather than a join keeps the policy usable as a filter.
drop policy if exists "Own messages" on public.messages;
create policy "Own messages" on public.messages
  for all
  using (exists (
    select 1 from public.conversations c
     where c.id = messages.conversation_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.conversations c
     where c.id = messages.conversation_id and c.user_id = auth.uid()
  ));

-- ── 3. usage_events ─────────────────────────────────────────────────────────
-- Append-only. `units` means different things per kind (tokens, characters,
-- seconds) — a raw meter reading, not a cost. Cost is computed when displayed,
-- so a pricing change never needs a backfill.

create table if not exists public.usage_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('chat', 'embedding', 'tts', 'whisper')),
  units      numeric not null check (units >= 0),
  model      text,
  created_at timestamptz not null default now()
);

-- The live table predates this file and lacks `model`. `create table if not
-- exists` above is a no-op there, so add it explicitly.
alter table public.usage_events
  add column if not exists model text;

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at);

alter table public.usage_events enable row level security;

drop policy if exists "Read own usage" on public.usage_events;
create policy "Read own usage" on public.usage_events
  for select using (auth.uid() = user_id);

-- No write policy: only service_role (the backend, apps/api) inserts.

create or replace view public.usage_monthly_summary
with (security_invoker = true) as
select
  user_id,
  kind,
  date_trunc('month', created_at) as month,
  sum(units) as total_units,
  count(*)   as event_count
from public.usage_events
group by user_id, kind, date_trunc('month', created_at);

-- ── 4. tie study sessions to an identity ────────────────────────────────────
-- The participant code stays the pseudonymous label used in analysis; user_id
-- is what stops a mistyped code attaching one participant's events to another's
-- session. Study tables keep their service-role-only posture — they are
-- researcher data, not user data — so no policy is added here.

alter table public.study_sessions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists study_sessions_user_idx
  on public.study_sessions (user_id);

grant select, insert, update on table public.profiles      to service_role;
grant select, insert, update on table public.conversations to service_role;
grant select, insert, update on table public.messages      to service_role;
grant select, insert         on table public.usage_events  to service_role;

commit;

-- ============================================================
-- VERIFY — work through every step. Step 5 is the one that matters.
-- ============================================================
--
-- 0. The drift check, first, because it is the one that fails silently:
--
--    select column_name from information_schema.columns
--     where table_schema='public' and table_name='usage_events'
--     order by ordinal_position;
--
--    Expect `model` to be present. If it is not, the alter above did not run and
--    every metered insert will fail with a 400 that only shows in the logs.
--
-- 1. Tables exist with RLS enabled, and the policy counts are as intended:
--
--    select c.relname, c.relrowsecurity as rls,
--           (select count(*) from pg_policies p
--             where p.schemaname='public' and p.tablename=c.relname) as policies
--      from pg_class c join pg_namespace n on n.oid=c.relnamespace
--     where n.nspname='public'
--       and c.relname in ('profiles','conversations','messages','usage_events');
--
--    Expect rls=true for all four. policies: profiles 2, conversations 1,
--    messages 1, usage_events 1.
--
-- 2. usage_events has NO write policy (only service_role inserts):
--
--    select policyname, cmd from pg_policies where tablename='usage_events';
--    Expect exactly one row, cmd = SELECT.
--
-- 3. A profile appears automatically for a new user. Sign in anonymously from
--    the app, then:
--
--    select id, email, created_at from public.profiles order by created_at desc limit 5;
--
-- 4. Anonymous sign-in is enabled: Auth → Providers → Anonymous. Without it the
--    client cannot obtain a session and every RLS check sees auth.uid() = null.
--
-- 5. THE ONE THAT MATTERS — prove isolation as an attacker, not as an owner.
--    The SQL editor runs as superuser and will read everything regardless, so
--    steps 1–2 are necessary but not sufficient. Create two anonymous sessions
--    in two private browser windows, note user A's conversation id, then from
--    user B's browser console:
--
--      await supabase.from('conversations').select('*')          // only B's rows
--      await supabase.from('conversations').select('*').eq('id', '<A_id>')  // []
--      await supabase.from('messages').select('*')               // only B's rows
--
--    An empty result is the pass. A row from A is a hard stop — do not enrol a
--    participant until it returns empty.
--
-- 6. Conversations survive a reload and a browser restart, and linking an email
--    identity preserves auth.uid() and the history attached to it.
-- ============================================================
--
-- ROLLBACK (only if needed)
-- begin;
--   alter table public.study_sessions drop column if exists user_id;
--   drop view if exists public.usage_monthly_summary;
--   drop table if exists public.usage_events;
--   drop table if exists public.messages;
--   drop table if exists public.conversations;
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_user();
--   drop table if exists public.profiles;
-- commit;
