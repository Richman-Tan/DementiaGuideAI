-- ============================================================
-- Migration — accounts (profiles) + AI usage metering
-- Date: 2026-08-10 · Status: NOT YET RUN
--
-- Why: the app currently has no user accounts — everyone reads
-- knowledge_chunks anonymously and supplies their own OpenAI/ElevenLabs/
-- Azure key on-device. Moving to a centralized-key model (real users pay
-- through us, not their own API key) needs (a) an identity to attach usage
-- to and (b) somewhere to record that usage. This migration adds both.
-- Usage is track-and-display only for now — no enforcement/blocking is
-- built on top of this yet (see docs/rag-target-architecture.md's backend
-- proxy note). The schema is intentionally shaped so a hard cap can be
-- added later without another migration (just a check against the
-- usage_monthly_summary view before an Edge Function proxies a request).
--
-- Safe on live data: additive only, single transaction. Run in the
-- Supabase SQL editor, same as every other file in this directory.
-- ============================================================

begin;

-- ── 1. profiles ──────────────────────────────────────────────────────────
-- One row per auth.users row. Kept separate from auth.users (which Supabase
-- owns) so app-specific fields don't require touching the auth schema.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up. Runs as the function
-- owner (postgres), so it can insert into profiles despite the RLS policy
-- below only allowing owners to read/write their own row.
create or replace function handle_new_user()
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
  for each row execute function handle_new_user();

alter table profiles enable row level security;

create policy "Read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Update own profile"
  on profiles for update
  using (auth.uid() = id);

-- No insert policy for authenticated/anon — rows are created only by the
-- handle_new_user() trigger (security definer, bypasses RLS).

-- ── 2. usage_events ──────────────────────────────────────────────────────
-- Append-only log. One row per proxied AI call. `units` means different
-- things per `kind` (tokens for chat/embedding, characters for tts, seconds
-- for whisper) — it's a raw meter reading, not a cost; cost is computed
-- when displayed, not stored, so a pricing change doesn't require a backfill.
create table if not exists usage_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('chat', 'embedding', 'tts', 'whisper')),
  units      numeric not null check (units >= 0),
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_month_idx
  on usage_events (user_id, created_at);

alter table usage_events enable row level security;

create policy "Read own usage"
  on usage_events for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated/anon — only service_role
-- (the Edge Function proxies, using the service-role key server-side) can
-- write. Same pattern as knowledge_chunks in scripts/supabase-setup.sql.

-- ── 3. usage_monthly_summary ─────────────────────────────────────────────
-- Lets the client read its own usage directly (no Edge Function needed for
-- reads — RLS on the underlying table already scopes it to auth.uid()).
create or replace view usage_monthly_summary
with (security_invoker = true)
as
select
  user_id,
  kind,
  date_trunc('month', created_at) as month,
  sum(units) as total_units,
  count(*)   as event_count
from usage_events
group by user_id, kind, date_trunc('month', created_at);

commit;

-- ── VERIFY (run after commit; paste output back) ───────────────────────────
-- -- Confirm a profile row appears for a freshly signed-up test user:
-- select id, email, created_at from profiles order by created_at desc limit 5;
--
-- -- Confirm RLS is on and no stray write policies exist:
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('profiles', 'usage_events');
--
-- -- After a test chat-proxy call, confirm a usage_events row landed and the
-- -- summary view aggregates it:
-- select * from usage_events order by created_at desc limit 5;
-- select * from usage_monthly_summary order by month desc limit 5;

-- ── ROLLBACK (only if needed) ───────────────────────────────────────────────
-- begin;
-- drop view if exists usage_monthly_summary;
-- drop table if exists usage_events;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists handle_new_user();
-- drop table if exists profiles;
-- commit;
