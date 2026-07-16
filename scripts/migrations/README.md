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
| `2026-07-16_production_snapshot_request.sql` | ⏳ **awaiting user** | Read-only: dump production `match_chunks` + schema state; paste results back so the definition can be committed |
| `2026-07-17_a_provenance_columns.sql` | ⏳ **awaiting user** | Add document_id / source_version / country / module / chunk_level / content_hash / embedding_model / embedded_at / licence columns; backfill from tags[] |
| `2026-07-17_b_canonical_match_chunks.sql` | 🚧 blocked on snapshot | Canonical `match_chunks` under version control: production body verbatim, filters moved from tag-parsing to the new columns, returns document_id/chunk_level. **No scoring change.** Written once the snapshot arrives. |

After any corpus replacement (Stage 9), rebuild the ivfflat index so its
training clusters match the new data: `reindex index knowledge_chunks_embedding_idx;`
