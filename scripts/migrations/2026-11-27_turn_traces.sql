-- ============================================================
-- Migration — a trace of each answered turn
-- Date: 2026-11-27 · Status: NOT YET RUN
--
-- Why: once answers are written on the server (POST /api/turn), the only
-- record of a turn is a token count in usage_events. That cannot answer the
-- questions worth asking of a retrieval system: how long did people wait for
-- the first word, how often did the search find nothing, which passages are
-- actually cited, how often did the safety check fire.
--
-- What this adds, and nothing else:
--   1. `turn_traces`: one row per turn, written by the server when the turn
--      ends (apps/api/src/trace.ts).
--   2. `turn_traces_daily`: the same, summed by day.
--
-- WHAT A TRACE HOLDS IS WHAT THE SYSTEM DID, NOT WHAT WAS SAID. There is no
-- question, no answer and no account id: a length where there was text, and
-- the ids of the knowledge-base passages that were found and cited. The time
-- is kept to the hour, which is enough to chart a day and stops a trace being
-- matched to a usage_events row by its timestamp. Do not add a text column or
-- a user id here without changing the privacy page first.
--
-- Tokens are stored, not dollars, as in usage_events: cost is worked out when
-- it is displayed, so a price change never needs a backfill.
--
-- Safe on live data: purely additive. Nothing reads these. Until it is run
-- the server logs one warning per turn and answers as before; a trace that
-- cannot be written never costs anyone their answer.
--
-- Run in the Supabase SQL editor.
-- ============================================================

begin;

create table if not exists public.turn_traces (
  id                 bigint generated always as identity primary key,
  -- To the hour, on purpose (see above).
  created_at         timestamptz not null default date_trunc('hour', now()),

  -- Which code and prompt answered, so a number can be tied to what produced it.
  pipeline_version   text not null,
  prompt_version     text,
  model              text,
  modality           text not null check (modality in ('text', 'voice')),

  -- How it ended: end_turn, max_tokens, refusal, aborted (the caller left or
  -- interrupted), or error, with which one.
  stop_reason        text not null,
  error_code         text,

  -- Sizes, where there was text.
  history_turns      integer not null default 0 check (history_turns >= 0),
  question_chars     integer not null default 0 check (question_chars >= 0),
  answer_chars       integer check (answer_chars >= 0),

  -- Retrieval: fresh, prefetched, none (nothing cleared the bar) or failed;
  -- the passages found, as [{ "id": "...", "similarity": 0.71 }], best first;
  -- and the ids of those the answer cited, in order of first use.
  retrieval_mode     text,
  retrieved          jsonb not null default '[]'::jsonb,
  cited              text[] not null default '{}',

  -- The safety verdict, and whether the model or the keyword floor gave it.
  safety_level       text,
  safety_source      text,

  input_tokens       integer check (input_tokens >= 0),
  output_tokens      integer check (output_tokens >= 0),
  cache_read_tokens  integer check (cache_read_tokens >= 0),
  cache_write_tokens integer check (cache_write_tokens >= 0),

  -- Milliseconds. The search alone, then from the start of the turn to the
  -- first word, to the last, and to the end.
  retrieval_ms       integer check (retrieval_ms >= 0),
  first_token_ms     integer check (first_token_ms >= 0),
  stream_end_ms      integer check (stream_end_ms >= 0),
  total_ms           integer check (total_ms >= 0)
);

create index if not exists turn_traces_created_idx
  on public.turn_traces (created_at desc);

-- The server only. Row-level security with no policy shuts everyone else out;
-- the revoke means a policy added by mistake would still not open it.
alter table public.turn_traces enable row level security;
revoke all on table public.turn_traces from anon, authenticated;

-- A day at a time. `security_invoker` makes the view obey the table's rules
-- for whoever is asking, so it is no way round them.
create or replace view public.turn_traces_daily
with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date                          as day,
  modality,
  model,
  pipeline_version,
  count(*)                                                       as turns,
  count(*) filter (where stop_reason = 'error')                  as failed,
  count(*) filter (where stop_reason = 'aborted')                as interrupted,
  count(*) filter (where retrieval_mode in ('none', 'failed'))   as without_passages,
  count(*) filter (where safety_level = 'emergency')             as emergencies,
  -- Whole milliseconds: a percentile between two readings is interpolated.
  round(percentile_cont(0.5)  within group (order by first_token_ms))::integer
                                                                 as first_token_p50_ms,
  round(percentile_cont(0.95) within group (order by first_token_ms))::integer
                                                                 as first_token_p95_ms,
  round(percentile_cont(0.5)  within group (order by total_ms))::integer
                                                                 as total_p50_ms,
  coalesce(sum(input_tokens), 0)                                 as input_tokens,
  coalesce(sum(output_tokens), 0)                                as output_tokens,
  coalesce(sum(cache_read_tokens), 0)                            as cache_read_tokens,
  coalesce(sum(cache_write_tokens), 0)                           as cache_write_tokens
from public.turn_traces
group by 1, 2, 3, 4;

revoke all on table public.turn_traces_daily from anon, authenticated;

commit;
