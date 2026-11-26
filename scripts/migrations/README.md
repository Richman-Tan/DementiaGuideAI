# Database migrations

Run order and status. All migrations are executed manually in the Supabase SQL
editor (the app's anon key is read-only). Every file carries its own VERIFY and
ROLLBACK blocks. **Keep exactly one `match_chunks` function at all times** —
multiple overloads with defaulted extra args make the app's 4-named-arg call
ambiguous (PostgREST PGRST203) and break all retrieval (see 2026-07-13 fix).

On a **fresh database** run `000_supabase-setup.sql` first — it creates the
schema, the `match_chunks` function, the indexes and the RLS policy in one go,
reproducing production 1:1. Then apply anything below it that is not already
folded in. On an existing database it has already been run; start from the
dated files.

**The run order is `order.json`, not the filenames.** Two files share a date and
depend on each other the other way round from how they sort: `study_tables`
creates a table that `backend_v1` alters, so on a fresh database `study_tables`
runs first. The table below is in that order.

## These files are tested

`apps/api/tests/migrations.test.ts` applies the whole chain, in `order.json`'s
order, to a Postgres running inside the test (PGlite, with pgvector), on every
run of `npm test`. It then checks what the server relies on:

- exactly one `match_chunks` and one `match_chunks_v2` (the PGRST203 outage);
- rows that exist before `review_status` arrives come out approved and
  searchable (the 2026-10-07 outage);
- `match_chunks_v2` returns only approved rows with a Voyage embedding, ranks
  them, and takes its vector/keyword balance as an argument;
- `knowledge_chunks_v2_missing()` counts what the new search cannot yet see;
- `bump_study_usage` allows up to its limit, and visitors cannot call it;
- who can read and write each table.

A new `.sql` file that is not added to `order.json` fails the test. What the
test cannot show is that production is configured as its stand-in for Supabase
assumes (the three roles and their default privileges), so the VERIFY block in
each file still applies after a real run.

| File | Status | Purpose |
|---|---|---|
| `000_supabase-setup.sql` | 🏁 fresh databases only | Full schema: `knowledge_chunks`, pgvector + tsvector indexes, `match_chunks`, `search_vector` trigger, RLS policy |
| `2026-07-13_fix_match_chunks_overload.sql` | ✅ run 2026-07-13 | Dropped ambiguous overloads (PGRST203 outage) |
| `2026-07-13_recategorise_isupport.sql` | ✅ run 2026-07-13 | iSupport chunks out of `caregiving` → `isupport-course` |
| `2026-07-16_production_snapshot_request.sql` | ✅ run 2026-07-17 | Read-only dump of production `match_chunks` + trigger + indexes + policy |
| `2026-07-16_production_snapshot.sql` | 📄 reference (do NOT run) | Verbatim capture of the live objects from that dump — the source of truth for F-14 |
| `2026-07-17_a_provenance_columns.sql` | ✅ run 2026-07-17 | Added provenance columns; backfilled from tags[] (0 NULL document_id; iSupport → country/module/chunk_level; curated → document_id='curated') |
| `2026-07-17_b_canonical_match_chunks.sql` | ✅ run 2026-07-17 | Canonical `match_chunks`: production scoring verbatim (0.7 cosine / 0.3 ts_rank_cd), filters on provenance columns, returns document_id/chunk_level. **Verified: all 32 labelled eval questions return byte-identical retrieved ids vs the frozen baseline.** |
| `2026-08-18_study_tables.sql` | ✅ run (verified 2026-08-24) | `study_sessions`, `study_events`, `study_usage` + `bump_study_usage()`; RLS on with no policies, `service_role` only |
| `2026-08-18_backend_v1.sql` | ✅ run (verified 2026-08-24) | Identity, server-side `conversations`, `usage_events` |
| `2026-08-18_participant_allocation.sql` | ⏳ apply with study_tables | `study_participant_seq` + `claim_participant_number()`. Not verifiable with the anon key — check with the service role before enrolling |
| `2026-08-19_study_version_stamp.sql` | ⏳ verify before enrolling | Adds `study_sessions.study_version`. `apps/api/api/study/session.js` selects **and** inserts this column, so if it is missing every session create fails |
| `2026-09-16_display_title.sql` | ✅ confirmed live 2026-10-07 | Adds `knowledge_chunks.display_title` (caregiver-facing plain-language title, separate from the embedding-input `title`) and returns it from `match_chunks`. The row above was stale — a direct check against production (`pg_get_function_result`) found this version already live, 11-column return shape, before the review_status migration below was written against it |
| `2026-10-07_review_status.sql` | ✅ run 2026-10-07 (corrected live, see below) | Adds `knowledge_chunks.review_status` (`pending`/`approved`/`rejected`, default `pending`, existing rows backfilled to `approved`) and gates `match_chunks` on `review_status = 'approved'`. Lets the new admin intake tool (`apps/admin` + `apps/api/api/admin/ingest.js`) write submissions that aren't retrievable until a reviewer approves them in the table editor |
| `2026-10-07_study_protocol.sql` | ⏳ apply before enabling the feedback round | Adds `study_sessions.protocol` (`tasks` \| `feedback`) and lets a feedback session have no arm/set order. `session.js` uses the column only when `STUDY_PROTOCOLS` includes `feedback`, so run this first |
| `2026-11-25_embedding_v2_voyage.sql` | ⏳ not yet run on production (runs clean in the test) | Adds `knowledge_chunks.embedding_v2` (`vector(1024)`, Voyage) with its model and time, a separately named `match_chunks_v2` reading it (the vector/keyword mix is an argument), and `knowledge_chunks_v2_missing()`. Additive: `match_chunks` and `embedding` are untouched. After running it, backfill with `npm run kb:reembed`, and switch nothing to `match_chunks_v2` until `npm run kb:reembed -- --check` passes |
| `2026-11-27_turn_traces.sql` | ⏳ not yet run on production (runs clean in the test) | Adds `turn_traces`, one row per answered turn written by `POST /api/turn` (what the pipeline did: versions, retrieval ids and scores, the safety verdict, tokens, timings, lengths; no question, no answer, no account id, time to the hour), and the `turn_traces_daily` summary. Server-only: row-level security with no policy, and privileges revoked from `anon` and `authenticated`. Additive, and nothing depends on it: until it is run the server logs one warning and answers as before |
| `2026-11-27_daily_spend.sql` | ⏳ not yet run on production (runs clean in the test) | Adds `daily_spend` and the functions `spend_reserve` / `spend_settle`: a day's budget in dollars for `POST /api/turn`, set aside before each model call and settled after it, in whole millionths of a dollar. Server-only, like the request counters. Additive, and unused until `DAILY_BUDGET_USD` is set on the server; once it is set this must have been run, because a turn is refused when the budget cannot be reached |

After any corpus replacement (Stage 9), rebuild the ivfflat index so its
training clusters match the new data: `reindex index knowledge_chunks_embedding_idx;`

- `2026-09-02_claim_skips_existing.sql` — ✅ applied to production 2026-09-02 via the
  management API and verified with live claims (skipped an occupied number 5 → returned 6).
  Replaces `claim_participant_number()` so a claim can never collide with a row that
  already holds that number (typed participant codes insert rows ahead of the sequence).

- `2026-09-09_backfill_isupport_source_urls.sql` — ✅ run 2026-09-09 (via the service
  role, supabase-js). Preflight found production ahead of the 2026-07 snapshot: the 152
  `isupport-who` chunks already carried the WHO IRIS URL (WHO block = verified no-op), and
  the 176 `isupport-nz` chunks already had `source_org='Alzheimers NZ'` — so the NZ block
  stamps the org-level `https://alzheimers.org.nz/` (matching the curated convention).
  After it: zero chunks corpus-wide with a NULL source_url. Deep links remain content work.

- `2026-10-07_review_status.sql` — ✅ applied 2026-10-07, but the version first run against
  production had a bug: it added `review_status` with `default 'pending'` in the same
  statement as the backfill target, and Postgres backfills an `ADD COLUMN ... DEFAULT` onto
  every existing row immediately — none were left `NULL`. The `update ... where
  review_status is null` backfill therefore matched 0 of 454 rows, and since `match_chunks`
  was already live filtering on `review_status = 'approved'`, production retrieval returned
  **zero results** until caught and corrected live with `update knowledge_chunks set
  review_status = 'approved' where review_status = 'pending';`. The committed file now adds
  the column without a default, backfills the real NULLs, then attaches the default — a
  fresh database cannot repeat the bug, and re-running it against production today is a
  no-op (454/454 already `approved`, confirmed via `match_chunks` smoke test returning the
  expected 5 ranked ids for 'sundowning evening agitation').
