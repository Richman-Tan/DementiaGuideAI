# Database migrations

Run order and status. All migrations are executed manually in the Supabase SQL
editor (the app's anon key is read-only). Every file carries its own VERIFY and
ROLLBACK blocks. **Keep exactly one `match_chunks` function at all times** —
multiple overloads with defaulted extra args make the app's 4-named-arg call
ambiguous (PostgREST PGRST203) and break all retrieval (see 2026-07-13 fix).

| File | Status | Purpose |
|---|---|---|
| `2026-07-13_fix_match_chunks_overload.sql` | ✅ run 2026-07-13 | Dropped ambiguous overloads (PGRST203 outage) |
| `2026-07-13_recategorise_isupport.sql` | ✅ run 2026-07-13 | iSupport chunks out of `caregiving` → `isupport-course` |
| `2026-07-16_production_snapshot_request.sql` | ✅ run 2026-07-17 | Read-only dump of production `match_chunks` + trigger + indexes + policy |
| `2026-07-16_production_snapshot.sql` | 📄 reference (do NOT run) | Verbatim capture of the live objects from that dump — the source of truth for F-14 |
| `2026-07-17_a_provenance_columns.sql` | ✅ run 2026-07-17 | Added provenance columns; backfilled from tags[] (0 NULL document_id; iSupport → country/module/chunk_level; curated → document_id='curated') |
| `2026-07-17_b_canonical_match_chunks.sql` | ✅ run 2026-07-17 | Canonical `match_chunks`: production scoring verbatim (0.7 cosine / 0.3 ts_rank_cd), filters on provenance columns, returns document_id/chunk_level. **Verified: all 32 labelled eval questions return byte-identical retrieved ids vs the frozen baseline.** |

After any corpus replacement (Stage 9), rebuild the ivfflat index so its
training clusters match the new data: `reindex index knowledge_chunks_embedding_idx;`
