# RAG Pipeline — Current-State Audit

Date: 2026-07-16 · Auditor: automated code audit (all findings verified against source at commit `1b858f4`)
Scope: the complete retrieval-augmented-generation lifecycle of DementiaGuideAI — sources, ingestion, chunking, embeddings, storage, retrieval, ranking, context construction, generation, citations, evaluation, observability, security, performance, and cost.

Companion documents: [rag-industry-research.md](rag-industry-research.md) · [rag-target-architecture.md](rag-target-architecture.md) · [rag-source-inventory.md](rag-source-inventory.md) · [rag-evaluation-plan.md](rag-evaluation-plan.md) · [rag-improvement-results.md](rag-improvement-results.md)

---

## 1. Current architecture

### 1.1 Components

| Layer | Implementation | Location |
|---|---|---|
| Knowledge base | 449 chunks in Supabase Postgres (`knowledge_chunks`, pgvector) — 70 hand-authored + ~380 WHO/NZ iSupport | Supabase (live); curated source in `src/features/library/data/knowledgeBase.js` |
| Embeddings | OpenAI `text-embedding-3-small`, 1536 dims; documents embedded as `` `${title}. ${content}` `` | ingestion scripts; query embedding in `src/lib/openaiService.js:106-112` |
| Retrieval | Hybrid via Postgres function `match_chunks` (vector cosine + tsvector keyword), called through PostgREST RPC | `openaiService.js:116-126`; SQL lives **only in production DB** |
| Post-retrieval | Oversample ×10 (50 candidates) → `capBySourceFamily` (iSupport max 2) → top 5 | `openaiService.js:28-47,125` |
| Generation | OpenAI `gpt-4o`, temp 0.7, max_tokens 300–900 by response style, last 6 messages of history | `openaiService.js:351-417` (text), `:132-226` (streaming/voice) |
| Prompt | "Aria" system prompt, augmentation-not-a-cage philosophy, style/personality/jargon variants | `openaiService.js:292-347` |
| Citations | Model asked to emit trailing `Sources:` bullet list of passage titles; regex-parsed, exact-title-matched to chunks | `openaiService.js:332-334,392-414` |
| Clients | ChatScreen (text) and useAvatarConversation (voice/streaming + TTS) | `src/features/chat/`, `src/features/voice/` |
| Evaluation | 42-question harness (hit@5 + refusal regex) + gpt-4o-mini groundedness judge | `scripts/rag-eval.mjs`, `scripts/rag-grade.mjs` |
| Ingestion | Ad-hoc URL/PDF/text script (currently non-runnable, see F-9) + one-time curated seed | `scripts/ingest.mjs`, `scripts/migrate-to-supabase.mjs` |

### 1.2 One question, end to end

1. `ChatScreen.sendMessage()` trims the input (max 500 chars), appends it to the message list, persists to AsyncStorage (`chat_messages_v1`, cap 100), and builds `history` from the last 6 messages (`ChatScreen.js:253-256`).
2. `openaiService.chat(message, history, settings)` → `search(message, 5)` (`openaiService.js:355`).
3. `search()` embeds the query (`text-embedding-3-small`), then calls `supabase.rpc('match_chunks', { query_embedding, query_text, match_count: 50, min_similarity: 0.25 })` with the anon key (`:116-123`).
4. The DB-side hybrid function returns up to 50 rows ordered by blended score; `capBySourceFamily` walks them in order, admitting at most 2 iSupport-family rows, and keeps the first 5 (`:125`).
5. Chunks are formatted as a `[REFERENCE PASSAGES — may or may not be relevant]` block prepended to the user question (`:359-361`); with zero chunks the bare question is sent.
6. Messages `[system, …history(6), user]` are POSTed to `/chat/completions` (gpt-4o, temp 0.7) with the user's own API key from expo-secure-store (`:383-388`).
7. The response is scanned for a trailing `Sources:` block; listed titles are exact-matched against the retrieved chunks to attach `source_url`/`source_org` (`:392-414`). Paraphrased titles silently lose their URL/org.
8. ChatScreen renders the text; the answer is persisted; optional TTS plays it. A static footer shows "For informational purposes only — always consult a healthcare professional."

The voice path is identical through step 5, then streams via XHR (`chatStream`), fires sentence-level TTS, uses `includeSources:false`, and stores `sources: []` unconditionally.

### 1.3 Configuration constants (`openaiService.js:4-16`)

`EMBEDDING_MODEL=text-embedding-3-small` · `CHAT_MODEL=gpt-4o` · `TOP_K=5` · `MIN_SIMILARITY=0.25` · `MAX_HISTORY=6` · `RETRIEVAL_OVERSAMPLE=10` · `MAX_PER_SOURCE_FAMILY=2` · temp `0.7` · max_tokens 300/600/700/900 by style.

---

## 2. Current strengths

These are genuinely good and should be preserved:

- **Server-side hybrid retrieval** (vector + full-text) is the right shape for this corpus; caregiver phrasing ("she keeps asking the same question") often needs semantic match while service names ("iSupport", "NASC") need lexical match.
- **Source-family diversity cap** (`capBySourceFamily`) is a measured fix to a real, diagnosed corpus-imbalance problem (retrieval 29/32 → 31/32, documented in `docs/report/rag_retrieval_rebalance_plan.md`).
- **A labelled eval set exists** (42 questions with expected chunk ids, boundary and out-of-scope sets) — most projects this size have nothing.
- **Security separation is clean**: anon key client-side with RLS SELECT-only; service-role key confined to scripts via env; OpenAI key per-user in expo-secure-store; no user text in console logs.
- **The augmentation prompt philosophy** (2026-07-15) eliminated a documented failure mode: canned refusals when retrieval missed, on questions the model could answer well.
- **Correct pgvector fundamentals**: vector(1536) matches the embedding model; cosine ops; tsvector column with GIN index; ivfflat `lists=20` ≈ √449 per the pgvector heuristic.
- **Streaming voice pipeline** with sentence-level TTS and stage-latency instrumentation (`[LATENCY]`).

---

## 3. Findings

Severity: **Critical** (wrong/unsafe behaviour reaching users, or unrecoverable process gap) · **High** (material quality/safety/maintainability risk) · **Medium** (quality erosion, debt) · **Low** (polish).

Each finding: evidence → user effect → recommended fix → effort → how measured.

### 3.1 Safety risks

**F-1 · Critical — Wrong-region emergency and helpline guidance.**
Evidence: system prompt claims expertise in "the Australian aged-care and support system" and directs users to "their GP or Dementia Australia (1800 100 500)" (`openaiService.js:336,339,346`). The curated corpus repeats Australian services (My Aged Care, Carer Gateway, NDIS, Carer Allowance — `knowledgeBase.js`, multiple chunks) while the bulk corpus is **NZ** iSupport. Eval questions A6, A22–A25 are Australia-framed.
User effect: a New Zealand caregiver in distress is handed an Australian phone number and directed to services that do not exist in their country; in an emergency-adjacent moment this delays real help.
Fix: prompt v2 with NZ framing and verified NZ helplines (111 emergency; Healthline; Dementia NZ / Alzheimers NZ), NZ rewrite of Australia-specific curated chunks, NZ eval set. Effort: prompt small; corpus rewrite medium (user-reviewed).
Measured by: deterministic safety checks (answers MUST NOT contain `1800 100 500|My Aged Care|Carer Gateway`; emergency answers MUST contain `111`).

**F-2 · High — No explicit emergency-escalation rule.**
Evidence: the only medical-safety instruction is one sentence asking the model to "naturally suggest their GP" for dosing/diagnosis/sudden changes (`openaiService.js:346`). Nothing instructs the model to put emergency escalation *first* for red-flag presentations (stroke signs, unresponsiveness, head injury after a fall, swallowing a dangerous substance).
User effect: with temp 0.7 and no rule, escalation placement and presence are left to chance on exactly the questions where ordering matters.
Fix: SAFETY block in prompt v2 (escalate to 111 first, then support — preserving the no-refusal philosophy) + a machine-checked safety question set. Effort: small.
Measured by: S-set pass rate (deterministic regex assertions).

**F-3 · High — No guard against specific medication dosing output.**
Evidence: no instruction or check prevents "give 5 mg of …" style output; the single prompt sentence permits "the best general information you can" on dosing (`openaiService.js:346`).
User effect: an authoritative-sounding dose for a person the system knows nothing about is the highest-harm output class for this app.
Fix: explicit no-dose/no-individual-diagnosis rule in prompt v2; deterministic check (dosing answers MUST NOT match `\d+ ?(mg|mcg|micrograms?|milligrams?)`). Effort: small.

**F-4 · Medium — Privacy overclaims in the UI.**
Evidence: ProfileScreen shows "End-to-end encrypted conversations" (`ProfileScreen.js:541`) and "HIPAA-aligned design" (`:649`); chat history is actually plaintext AsyncStorage (`chat_messages_v1`) and messages go to OpenAI under the user's key.
User effect: users may share more sensitive health detail than they would under an accurate description; the claim is also legally risky.
Fix: replace with accurate copy ("Conversations are stored only on this device"); remove "HIPAA-aligned". Effort: trivial.

**F-5 · Medium — No prompt-injection defence beyond delimiters.**
Evidence: retrieved passages are inlined between `[REFERENCE PASSAGES]` markers with no sanitisation (`openaiService.js:360`); the corpus is trusted today, but ingestion accepts arbitrary URLs/PDFs (`scripts/ingest.mjs`), so poisoning enters at ingest time, not just runtime. No injection test exists.
Fix: injection eval set (I-set); prompt hardening line (treat passages as data); ingestion-time review is the real control at this corpus size. Effort: small.

### 3.2 Correctness bugs

**F-6 · High — `initKnowledgeBase()` is called but does not exist.**
Evidence: called at `ChatScreen.js:154,190`, `ProfileScreen.js:284`, `useAvatarConversation.js:116`; no such method on `OpenAIService`. In ChatScreen the resulting TypeError is caught and misreported as a **'network' error banner on startup**. `ProfileScreen.js:319` also calls a nonexistent `clearCache()`.
User effect: spurious "connection problem" banner on every chat open; broken settings action.
Fix: delete the ghost calls and the misattributed error path. Effort: trivial. Measured by: app boots with no banner; grep proves zero references.

**F-7 · High — Citation UI is dead; citation data model mismatched end-to-end.**
Evidence: `CitationText` and the citation modal expect inline `[1]` markers and `{num, excerpt}` (`ChatScreen.js:40-72`), but the prompt requests a trailing `Sources:` title list (`openaiService.js:332-334`) and the parser returns `{title,url,org}` with exact-title matching (`:409-414`) that fails on any paraphrase.
User effect: users can never inspect what an answer was based on — the primary trust affordance of a healthcare RAG app doesn't function.
Fix: structured inline `[S1]` markers mapped to chunk ids, `extractCitations()` renumbering, feed the existing UI; strip markers before TTS. Effort: medium. Measured by: deterministic citation-precision metric + manual tap-through.

**F-8 · Medium — Misleading comments describe removed behaviour.**
Evidence: `chat()`/`chatStream()` comments claim an "explicit 'nothing matched' block primes the model to hedge" (`openaiService.js:140-141,357-358`) — no such block exists in either branch.
Fix: delete with F-6's commit. Effort: trivial.

**F-9 · High — The ingestion script cannot run.**
Evidence: `scripts/ingest.mjs` imports `@mozilla/readability`, `pdf-parse`, `node-fetch`; none is in `package.json` and the first two are absent from `node_modules`.
User effect: the documented path for adding knowledge is broken; it also means the ~380 iSupport chunks in production **cannot have been produced by this script as committed** — the actual ingestion process is unrecorded.
Fix: ingestion rewrite with declared dependencies (Stage 8). Effort: medium.

**F-10 · Medium — Edited curated chunks are silently never re-embedded.**
Evidence: `migrate-to-supabase.mjs:143-154` skips any id already present in the DB; editing a chunk's text while keeping its id means the fix never reaches production, with no warning. Its own comment (`:60-64`) implies the opposite behaviour.
User effect: corrected or updated guidance silently stays stale in the live KB.
Fix: content-hash idempotency (skip unchanged / re-embed changed / prune removed). Effort: part of Stage 8.

**F-11 · Low — Category slug mismatch.** `knowledgeBase.js` uses `wellbeing`; the `ingest.mjs` validator lists `well-being` (`ingest.mjs:87`), and neither can produce the live `isupport-course` category. Fix: single `CATEGORIES` list in shared config.

**F-12 · Low — Dead code.** `src/lib/knowledgeService.ts` has no callers; its "local KB fallback" is actually a Supabase `ilike` query. Delete.

### 3.3 Source-quality and provenance risks

**F-13 · Critical — The bulk corpus (~380 chunks, 85% of the KB) has no provenance.**
Evidence: no source documents, no ingestion script, no URLs, publication dates, licence records, or version identifiers exist in the repo for the WHO/NZ iSupport chunks; metadata (document_id, module, chunk_level) is crammed into the `tags[]` array. The nearest artefact is a stale CSV snapshot (`docs/report/kb_chunks_reference.csv`, pre-recategorisation).
User effect: no way to verify, update, correct, or legally account for 85% of what the assistant treats as authoritative; content drift or transcription errors are undetectable.
Fix: source registry + licence-gated re-ingestion of official WHO iSupport / iSupport NZ materials with full provenance columns (Stages 7–9). Effort: large (the single largest work item).
Measured by: source inventory complete; every live chunk carries document_id, source_version, licence, content_hash.

**F-14 · High — The load-bearing retrieval function exists only in the production database.**
Evidence: `supabase-setup.sql:51-62` explicitly warns that the committed `match_chunks` is a vector-only placeholder and the production 8-arg hybrid must be dumped with `pg_get_functiondef()`. The exact hybrid scoring formula (weights, rank function, fusion method) is therefore unknown and unreproducible; running the committed setup file against production would silently destroy hybrid search.
User effect: retrieval behaviour cannot be reasoned about, tested locally, tuned, or restored after an incident. A prior incident (PGRST203 overload ambiguity, 2026-07-13) already took retrieval down entirely.
Fix: Stage 0 snapshot (user runs `scripts/migrations/2026-07-16_production_snapshot_request.sql`), commit verbatim, then keep the function under version control permanently. Effort: small, user-gated.

**F-15 · Medium — No review/refresh process for sources.** No publication/review dates stored, no retirement process, no schedule. Curated chunks paraphrase third-party bodies (Dementia Australia, NHS, Alzheimer's Society) without a recorded review date or reviewer. Fix: registry fields + inventory verdicts (retain/update/remove) in Stage 9.

### 3.4 Retrieval-quality risks

**F-16 · High — Single-point evaluation: hit@5 only, single expected chunk.**
Evidence: `rag-eval.mjs` scores only "any expected id in top 5" for 32 questions; no recall@k curve, MRR, nDCG, precision; no graded relevance (a question often has several acceptable chunks); no per-set breakdown beyond A/B/C.
User effect: tuning decisions (thresholds, weights, caps) are being made against a metric too coarse to see regressions smaller than a whole hit.
Fix: deterministic metrics module + graded relevance labels (Stage 6). Effort: medium.

**F-17 · Medium — Fixed similarity floor and fixed k with no unanswerable-question detection.**
Evidence: `MIN_SIMILARITY=0.25` and `TOP_K=5` are constants; no logic distinguishes "5 weak matches" from "5 strong matches"; with 0 chunks the bare question is sent with no signal to the model that the KB had nothing.
User effect: weak context is presented identically to strong context, inviting the model to lean on marginal passages.
Fix: threshold sweep with the upgraded metrics; consider passing retrieval-confidence context. Effort: small-medium, only if measurement justifies.

**F-18 · Medium — Diversity cap only constrains iSupport; no dedup.**
Evidence: `capBySourceFamily` special-cases the `isupport` family (`openaiService.js:42`); other families are uncapped regardless of `maxPerFamily`; near-duplicate or parent+child pairs in the top-5 are not suppressed (chunk_level tags exist in prod but are unused at runtime).
Fix: generalise the cap; parent/child and near-dup suppression (Stage 10, measured). Effort: small.

**F-19 · Medium — No query processing.** User queries are embedded verbatim: no spelling/colloquialism normalisation, no expansion of caregiver phrasing to clinical terms ("sundowning" vs "evening confusion"), no multi-turn context in retrieval (follow-ups like "what about at night?" embed without the antecedent).
Fix: evaluate query rewriting for follow-ups (history-aware condensation) — candidate experiment, adopt only on measured gain. Effort: medium.

### 3.5 Prompt and generation risks

**F-20 · High — Prompt and retrieval logic hand-duplicated in 3 files, already drifted.**
Evidence: the Aria prompt is pasted in `openaiService.js:292-347`, `rag-eval.mjs:100-111`, `test-responses.mjs:110-123` (wording already differs); `capBySourceFamily` duplicated in 2. The eval therefore does not necessarily test what production does.
Fix: shared `src/lib/rag/` CJS modules + snapshot test (Stage 4). Effort: small-medium.

**F-21 · Medium — Citations are honour-system.** The model is asked to list titles "if you drew on any of the provided passages"; nothing validates the list against the passages, and a hallucinated title yields `url:null` silently rather than an error (`openaiService.js:405-414`).
Fix: structured markers + validation (Stage 11); deterministic citation-precision metric.

**F-22 · Low — `test-responses.mjs` exercises a different backend** (local 70-chunk KB, in-memory cosine) than production — its passing output creates false confidence. Fix: port to the live pipeline or delete (Stage 13).

### 3.6 Missing evaluation coverage

**F-23 · High — No safety, adversarial, NZ, or multi-turn eval questions.** The 42-question set has no emergency-escalation cases, no dosing traps, no injection attempts, no NZ-service questions, no follow-up-turn cases — precisely the classes where this app carries risk. Fix: S/I/N sets with deterministic assertions (Stage 6).

**F-24 · Medium — The groundedness judge is untrustworthy as deployed.** gpt-4o-mini scored 32/32 answers a uniform 2/2 (`docs/report/rag_eval_graded.csv`; leniency acknowledged in `700b_evaluation_plan.md`). A judge that never dissents measures nothing. Fix: stricter rubric, judge sees extracted citations, mandatory 10-row human spot-check per run (Stage 6).

**F-25 · Medium — Zero automated tests for the RAG layer.** Only sentiment + theme tests exist. Pure functions (`capBySourceFamily`, prompt builder, citation parser) are trivially testable and untested; the prompt-duplication drift (F-20) had no tripwire. Fix: Jest suite (Stages 4–13).

### 3.7 Performance and cost

**F-26 · Medium — No caching anywhere.** Every message embeds the query (~few hundred ms + cost) even for repeats; no response cache. At current single-user scale the cost is small, but the latency is user-visible on the voice path where `rag_ms` sits in the critical path to first audio. Fix: small LRU embedding cache (Stage 12). Measured by: `[LATENCY]` rag_ms.
**F-27 · Low — Oversampling 50 rows with full content every query** transfers ~10× the needed payload before the client discards 45 rows. Acceptable at 449 rows; revisit only if the cap moves server-side (Stage 10 option).
**F-28 · Low — ivfflat at 449 rows.** Index is fine (and near-moot: at this scale a sequential scan is fast and exact). `lists=20` follows the heuristic. HNSW is not justified by any current problem. No action.
**Cost estimate (current)**: per text question ≈ 1 embedding call (trivial) + 1 gpt-4o call with ~1.5–3k prompt tokens (5 chunks × ~300 words + prompt + history) + ≤900 completion tokens → roughly US$0.01–0.03/question at July-2026 gpt-4o pricing. Eval run (42 Q) ≈ US$0.5–1. No monitoring of actual token usage exists (see F-30).

### 3.8 Security and privacy

**F-29 · Medium — No rate limiting or abuse guard.** Only reaction is surfacing OpenAI's 429. Voice transcripts have no length cap (text input caps at 500 chars). Client-only app limits blast radius (user spends their own key), but a runaway loop can still burn the user's quota. Fix: transcript cap (Stage 3), min-interval throttle (Stage 12).
**F-30 · Medium — No observability.** Retrieved ids, scores, prompt version, and token usage are not recorded anywhere for the text path; a bad answer cannot be reconstructed after the fact. Fix: dev-gated telemetry ring buffer, no user text stored (Stage 12).
**F-31 · Low — `.env` OpenAI key flagged for rotation on 2026-07-13 (exposed in a chat transcript) — rotation not yet confirmed.** Action: user rotates (Stage 0).
**F-32 · Info — Architecture note.** The device-to-OpenAI direct call with a user-supplied key is a deliberate no-backend design; it trades central control (moderation, server-side rate limits, key custody) for zero infrastructure. Acceptable for the current research-prototype stage; a backend proxy is the documented path if this ships broadly. Not scheduled.

### 3.9 Technical debt (summary)

Triplicated prompt (F-20) · dead citation UI (F-7) · dead knowledgeService (F-12) · non-runnable ingest script (F-9) · uncommitted DB function (F-14) · metadata-in-tags (F-13) · stale README (says gpt-4o-mini; eval scripts undocumented) · stale `kb_chunks_reference.csv` · eval scripts not in npm scripts.

---

## 4. Comparison against researched practice

See [rag-industry-research.md](rag-industry-research.md) for sources and reasoning. Summary of where this implementation stands:

| Area | Common production practice | This system | Verdict |
|---|---|---|---|
| Hybrid retrieval | Vector + lexical, fused by RRF or tuned weights | Hybrid, but formula unknown/uncommitted | Right idea, unauditable (F-14) |
| Chunking | Structure-aware, token-sized, with overlap | Word-based 500/50, paragraph-aware, no headings | Adequate; improve at re-ingestion |
| Embeddings | text-embedding-3-small is the standard cost/quality point at this scale | Same | Keep; larger model only via controlled comparison |
| Metadata | First-class columns, filterable, versioned | Crammed into tags[] | Below practice (F-13) |
| Provenance | Source registry, licences, hashes, versions | Absent for 85% of corpus | Well below practice (F-13) |
| Reranking | Often skipped below ~10⁵ docs; cross-encoders for large corpora | None | Correctly absent; evaluate cheap options only with evidence |
| Evaluation | Multi-metric retrieval + judged generation + deterministic safety checks | hit@5 + lenient judge | Below practice (F-16, F-23, F-24) |
| Citations | Structured ids validated against context | Honour-system title list | Below practice (F-7, F-21) |
| Safety (health) | Explicit escalation rules, no-dose rules, tested | One prompt sentence, wrong region | Well below practice (F-1..F-3) |
| Observability | Per-request retrieval traces, token/latency accounting | Voice latency logs only | Below practice (F-30) |

---

## 5. Prioritised findings

**Must fix before production**
F-1 wrong-region guidance · F-2 emergency escalation · F-3 dosing guard · F-6 ghost init call · F-13 corpus provenance · F-14 uncommitted match_chunks · F-31 key rotation.

**High-value improvements**
F-7 citation pipeline · F-9/F-10 ingestion rewrite · F-16/F-23/F-24 evaluation upgrade · F-20 prompt single-source · F-25 regression tests · F-4 privacy copy.

**Useful future experiments** (adopt only with measured gain)
F-17 threshold/dynamic-k tuning · F-19 follow-up query rewriting · RRF re-scoring of match_chunks · LLM rerank of the oversample window · F-26 embedding cache.

**Unnecessary complexity for this system (explicitly rejected)**
Cross-encoder reranking service; HNSW migration at 449 rows; a second/larger embedding model without eval evidence; agentic multi-hop retrieval; external vector DB; semantic-chunking models; distributed ingestion infrastructure. Rationale: each adds an operational dependency or latency for benefit that cannot currently be measured above noise on a 449-chunk corpus with an already-high hit rate.
