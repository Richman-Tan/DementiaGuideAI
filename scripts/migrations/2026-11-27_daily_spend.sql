-- ============================================================
-- Migration — a cap on what a day can cost, in dollars
-- Date: 2026-11-27 · Status: NOT YET RUN
--
-- Why: the live demo answers on the project's own model key. Until now the
-- only cap counted requests (bump_study_usage), which bounds a day at "the
-- limit times the most one turn can cost": about ten times what a day of
-- typical turns costs. This lets the cap be the number that matters.
--
-- How it works: before a turn calls the model, the server sets aside the most
-- that turn could cost (`spend_reserve`). If today's spending plus everything
-- set aside would pass the limit, the turn is refused before it costs
-- anything. When the turn ends, what it really cost replaces what was set
-- aside (`spend_settle`). Both are single statements on one row, so two turns
-- arriving together cannot both take the last of the budget.
--
-- A turn that never settles (the function was killed mid-answer) keeps its
-- reservation for the rest of the day. That errs towards stopping early, which
-- is the right way for a spending cap to be wrong.
--
-- Amounts are whole millionths of a US dollar, so there is no rounding to
-- argue about. The day is the UTC day, as for the request counters.
--
-- What this adds, and nothing else: the table `daily_spend` and the two
-- functions. Server only. Nothing uses them until DAILY_BUDGET_USD is set on
-- the server; once it is, a turn is refused if they cannot be reached.
--
-- Run in the Supabase SQL editor.
-- ============================================================

begin;

create table if not exists public.daily_spend (
  day             date primary key,
  -- Set aside for turns in progress.
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  -- What finished turns cost.
  spent_micros    bigint not null default 0 check (spent_micros >= 0),
  updated_at      timestamptz not null default now()
);

-- Sets `p_micros` aside from today's budget. Returns the day it was set aside
-- under (which `spend_settle` needs: a turn can end after midnight), or null
-- if today's spending and reservations leave no room for it.
create or replace function public.spend_reserve(p_micros bigint, p_limit_micros bigint)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_reserved date;
begin
  if p_micros is null or p_micros < 0 or p_limit_micros is null then
    raise exception 'spend_reserve: amount and limit are required, and the amount cannot be negative';
  end if;

  insert into daily_spend (day) values (v_day) on conflict (day) do nothing;

  -- One statement: the check and the reservation cannot be separated.
  update daily_spend
     set reserved_micros = reserved_micros + p_micros,
         updated_at = now()
   where day = v_day
     and spent_micros + reserved_micros + p_micros <= p_limit_micros
  returning day into v_reserved;

  return v_reserved;
end;
$$;

-- Replaces a reservation with what the turn really cost. The reservation is
-- released in full whatever was spent; spending more than was set aside is
-- recorded as it is, because it happened.
create or replace function public.spend_settle(p_day date, p_reserved_micros bigint, p_spent_micros bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reserved_micros < 0 or p_spent_micros < 0 then
    raise exception 'spend_settle: amounts cannot be negative';
  end if;

  update daily_spend
     set reserved_micros = greatest(0, reserved_micros - p_reserved_micros),
         spent_micros = spent_micros + p_spent_micros,
         updated_at = now()
   where day = p_day;
end;
$$;

-- The server only (see 2026-08-18_study_tables.sql for why each is explicit).
alter table public.daily_spend enable row level security;
revoke all on table public.daily_spend from anon, authenticated;
revoke all on function public.spend_reserve(bigint, bigint) from public, anon, authenticated;
revoke all on function public.spend_settle(date, bigint, bigint) from public, anon, authenticated;
grant select, insert, update on table public.daily_spend to service_role;
grant execute on function public.spend_reserve(bigint, bigint) to service_role;
grant execute on function public.spend_settle(date, bigint, bigint) to service_role;

commit;
