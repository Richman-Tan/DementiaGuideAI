# RAG Target Architecture — DementiaGuideAI

Date: 2026-07-16. This is the end-state the staged overhaul converges on. Design principle: **the simplest architecture that produces a measurable improvement** — no new services, no backend, no additional models. Everything below runs in the existing three environments: the Expo app, Node scripts, and Supabase Postgres.

Binding product decisions this design implements:
1. **Region: New Zealand** (verified helplines; NZ-correct corpus).
2. **Grounding: augmentation + safety layer** — Aria answers from model knowledge, never refuses because retrieval missed; safety rules bound the risky output classes.
3. **iSupport corpus re-ingested from official WHO / iSupport NZ materials** under confirmed licence, with full provenance.
4. All DB changes ship as reviewed SQL migration files executed by the project owner (client uses anon key, read-only).

---

## 1. Component overview

```
                        ┌──────────────────────────────────────────────┐
                        │              content/sources/                │
                        │  official source files + MANIFEST (sha256,   │
                        │  URL, retrieval date, licence evidence)      │
                        └───────────────┬──────────────────────────────┘
                                        │  scripts/ingest/ingest.mjs
                                        │  (registry-driven, idempotent:
                                        │   extract → section-aware chunk →
                                        │   tag → embed w/ retry → upsert)
                                        ▼
   ┌─────────────────────────── Supabase Postgres ───────────────────────────┐
   │ knowledge_chunks(id, category, title, content, tags[],                  │
   │   source_url, source_org,                                               │
   │   document_id, source_version, country, module, chunk_level,           │
   │   content_hash, embedded_at, licence,          ← provenance columns     │
   │   embedding vector(1536), search_vector tsvector generated)            │
   │ ivfflat(cosine) + GIN(search_vector) + btree(document_id, country)     │
   │ match_chunks(…8 args) — SINGLE canonical hybrid function, committed    │
   │ RLS: anon SELECT only; writes via service_role in scripts only          │
   └───────────────┬─────────────────────────────────────────────────────────┘
                   │ PostgREST RPC (anon key)
                   ▼
   ┌──────────────────── src/lib/rag/  (shared CJS core) ────────────────────┐
   │ ragConfig.js   constants + PROMPT_VERSION / CITATION_MODE / RERANK_MODE │
   │ prompt.js      buildSystemPrompt (v1, v2-nz-safety), buildUserContent   │
   │ retrieval.js   capBySourceFamily (generalised), dedupParentChild        │
   │ citations.js   extractCitations — [S#] markers → {num,id,title,org,     │
   │                url,excerpt}, hallucinated markers stripped              │
   │ telemetry.js   dev-gated ring buffer (ids/scores/versions/latency —     │
   │                never message text)                                      │
   └──────┬──────────────────────────────────────────────┬───────────────────┘
          │ imported by                                   │ imported by
          ▼                                               ▼
   src/lib/openaiService.js                        scripts/eval/*  scripts/ingest/*
   (embed → rpc → cap/dedup → prompt →             (same prompt, same config —
    gpt-4o → extractCitations)                      eval tests what prod runs)
          │
          ▼
   ChatScreen (text + citation cards)  /  useAvatarConversation (voice,
   marker-stripped TTS, structured sources via onSources callback)
```

## 2. Data flow — one question

1. User asks; client throttles (min-interval) and caps input length (text 500 chars, voice transcript ~1000).
2. `search()`: LRU-cached query embedding → `match_chunks(query_embedding, query_text, match_count=50, min_similarity)` → generalised source-family cap + parent/child + near-dup suppression → top 5.
3. `buildUserContent()`: passages as `[S1] Title — Org\n<content>`, wrapped in delimiters with a data-not-instructions clause; bare question when zero passages.
4. `buildSystemPrompt('v2-nz-safety', settings)`: augmentation philosophy + SAFETY block (111-first escalation, no dosing/diagnosis, uncertainty, cite-only-what-you-used) + style/personality rules.
5. gpt-4o generates; text path parses inline `[S#]` → `extractCitations()` validates markers against the supplied set, renumbers to `[1..n]`, returns structured sources feeding the existing CitationText UI; voice path strips markers stream-safely before TTS and delivers the same structured sources at stream end.
6. Telemetry ring buffer records ids, scores, versions, stage latencies.

## 3. Contracts and invariants

- **Exactly one `match_chunks` function** in the DB (PGRST203 outage class); its definition lives in `scripts/migrations/` and `supabase-setup.sql` is generated from it for fresh databases.
- **One prompt, one config** — `src/lib/rag/` is the only definition; eval scripts import it; a Jest snapshot trips on drift.
- **Every chunk carries provenance**: document_id, source_version, country, licence, content_hash, embedded_at. `tags[]` returns to being folksonomy, not a metadata store.
- **Ingestion is idempotent**: unchanged content (by hash) is skipped; changed content re-embeds; removed content is pruned only with an explicit flag; every run is reproducible from the registry + MANIFEST.
- **Behaviour changes are measured**: any retrieval/prompt change ships with a before/after run of the deterministic eval; safety assertions are a hard gate (non-zero exit).
- **Corpus replacement protocol**: new document_ids ingested alongside old; eval passes on the new corpus; only then are old document_ids pruned (and ivfflat reindexed).

## 4. Failure handling

| Failure | Behaviour |
|---|---|
| Supabase RPC error / timeout | `search()` throws → chat proceeds **without passages** (augmentation philosophy degrades gracefully); telemetry records empty retrieval |
| Zero retrievals | Bare question; no fabricated context |
| OpenAI 401 / 429 | Typed errors → existing UI banners; scripts retry with backoff (ingestion) |
| Hallucinated citation marker | Stripped from text, logged, absent from sources — never rendered as a real source |
| Judge/model drift in eval | Deterministic metrics + safety assertions unaffected; judge output always paired with human spot-check file |
| Prod/repo function drift | Snapshot migration + eval regression run after any SQL change (retrieved-id lists compared) |

## 5. Content refresh

The source registry (`scripts/ingest/registry.js`) is the single list of what the KB should contain. Refresh = update the registry entry (new source_version / URL), re-run `kb:ingest` (hash-diff re-embeds only changes), re-run eval, prune superseded versions. The source inventory doc records per-source review dates and retain/update/remove verdicts; stale sources are visible by inspection rather than discovered by accident.

## 6. Explicitly out of scope (and why)

- **Backend proxy service** — would centralise key custody, moderation, and rate limits, but adds hosting/ops for a research prototype where each user supplies their own key. Documented as the path to a public release, not built now.
- **Cross-encoder reranking, HNSW, larger embedding model, agentic retrieval, external vector DB** — rejected in [rag-industry-research.md](rag-industry-research.md) with trigger conditions where applicable.
- **Server-side conversation storage** — chat history stays on-device (accurate privacy copy replaces the current overclaims).
