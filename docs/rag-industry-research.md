# RAG Engineering Research — Applied to DementiaGuideAI

Date: 2026-07-16. Each section states current practice with sources, then a **Verdict for this system** justified against this app's size (449-chunk corpus), domain (dementia-care guidance for NZ caregivers), risk profile (health information), latency needs (voice path), and maintenance budget (solo maintainer, no backend).

A recommendation is adopted only if it is expected to produce a measurable improvement on the evaluation suite ([rag-evaluation-plan.md](rag-evaluation-plan.md)) or closes a safety/provenance gap. "Popular" is not a reason.

---

## 1. Hybrid retrieval and rank fusion

**Practice.** Supabase's official guidance for Postgres RAG is hybrid search: a generated `tsvector` column with a GIN index for keyword search, pgvector for semantic search, and the two result lists fused with **Reciprocal Rank Fusion** — `score = Σ 1/(k + rank_i)` with smoothing constant `k` (commonly 50–60) — rather than mixing raw scores, because cosine similarity and `ts_rank` live on incomparable scales ([Supabase hybrid search docs](https://supabase.com/docs/guides/ai/hybrid-search)). Weighted-score blends are workable but require per-corpus weight tuning and break when either score distribution shifts.

**Verdict for this system.** The architecture is already hybrid (correct choice — caregiver colloquialisms need semantic match; service names like "NASC", "iSupport" need lexical match). Two actions: (1) the production `match_chunks` body must be committed to the repo before anything else — its fusion method is currently unknown and unreproducible; (2) once captured and baselined, benchmark an RRF variant against the production formula on the deterministic retrieval metrics and adopt the winner. No new infrastructure required; both run in the existing Postgres function.

## 2. Vector indexing at small scale

**Practice.** pgvector offers exact (sequential scan), IVFFlat, and HNSW. HNSW gives a better speed/recall trade-off than IVFFlat and needs no training step, at the cost of build time and memory; IVFFlat suits bulk-loaded, large tables. For small datasets, exact scan is a valid option delivering 100% recall — index choice barely matters below tens of thousands of rows ([pgvector README](https://github.com/pgvector/pgvector), [Neon pgvector optimization guide](https://neon.com/docs/ai/ai-vector-search-optimization)).

**Verdict for this system.** At 449 rows (even 2–3× that after re-ingestion), any index is nearly cosmetic: a sequential scan over ~1k vectors of 1536 dims is sub-millisecond-to-few-ms territory. The existing IVFFlat `lists=20` follows the √N heuristic and is not causing problems. **Do not migrate to HNSW now** — it would be untestable improvement theatre. Record a trigger condition instead: revisit indexing (HNSW, `lists` retuning) if the corpus exceeds ~10k chunks or p95 retrieval latency measurably degrades. One real risk to document: IVFFlat indexes are trained on existing data — after a full corpus replacement (Stage 9), the index should be rebuilt (`REINDEX`) so cluster centroids match the new distribution.

## 3. Embedding model

**Practice.** `text-embedding-3-small` (1536 dims, $0.02/M tokens) scores 62.3% average on MTEB vs 64.6% for `text-embedding-3-large` (3072 dims, $0.13/M tokens) ([OpenAI announcement](https://openai.com/index/new-embedding-models-and-api-updates/), [Pinecone analysis](https://www.pinecone.io/learn/openai-embeddings-v3/)). The large model is ~6.5× the cost and doubles vector storage/compute; the small model is the standard cost/quality operating point for small-to-mid corpora.

**Verdict for this system.** **Keep `text-embedding-3-small`.** Baseline retrieval is already 31/32 hit@5; the headroom a larger model could add is at most one or two questions, indistinguishable from labelling noise at n=32. A model change also forces re-embedding the entire corpus and a vector-dimension migration. Revisit only if the upgraded eval (larger question set, recall@k/nDCG) shows a persistent retrieval ceiling that error analysis attributes to embedding quality rather than chunking or corpus gaps — and then only via a side-by-side controlled comparison on the same question set. Embedding-version tracking (`embedded_at`, model name in provenance columns) is adopted now so any future migration is auditable.

## 4. Chunking

**Practice.** Benchmarks repeatedly land on moderate chunks (~400–800 tokens) as the sweet spot; beyond ~1000 tokens accuracy drops as content dilutes relevance ([chunking studies survey](https://arxiv.org/pdf/2506.17277), [vendor benchmark roundup](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)). Modest overlap helps (25% overlap lifted MRR from 0.529 to 0.658 on financial data in one study; ~50 tokens is a common cheap default). Structure-aware splitting (respect headings/sections before falling back to windows) outperforms blind fixed-size splitting because retrieval units align with topic boundaries. Anthropic's contextual retrieval (prepending an LLM-written context sentence to each chunk before embedding) reduced retrieval failures by ~49% in their evaluation ([Anthropic research](https://www.anthropic.com/news/contextual-retrieval)) — but its gains matter most on large corpora where chunks lose document context.

**Verdict for this system.** Current word-based 500-word/50-word-overlap paragraph-aware chunking is inside the reasonable band; there is no evidence of a chunking-caused retrieval failure in the current eval (the one miss, A17, is a corpus-coverage issue). Adopt at re-ingestion time (Stage 8–9), where it is free to do so: **section-aware splitting** (iSupport materials are heavily structured into modules/lessons — heading-aligned chunks preserve the "warnings"/"steps" units that matter for care guidance), plus title/section-path prefixes in the embedded text (a cheap, deterministic subset of contextual enrichment). **Not adopted:** LLM-generated contextual prefixes (cost/complexity unjustified at 449 chunks), semantic chunking models, multi-scale indexing, sentence-window retrieval — all solve problems this corpus does not exhibit. Parent-child retrieval: the production corpus already carries `chunk_level:parent|child` tags; rationalise rather than expand this at re-ingestion (dedup parent/child collisions in top-K, Stage 10).

## 5. Reranking

**Practice.** Cross-encoder or API rerankers (e.g. Cohere Rerank) improve precision on large candidate pools; Anthropic's contextual-retrieval numbers improved further with reranking (67% failure reduction combined). But rerankers add 100s of ms, a new external dependency, and per-query cost — the payoff scales with corpus size and candidate-pool noise.

**Verdict for this system.** **No reranker.** With 449 chunks, top-similarity ≈ 0.3–0.53, hit@5 = 31/32, and a mobile client with no backend, a reranking service would add a dependency and latency to fix a failure mode the eval cannot currently detect. The oversample-then-cap step already provides a cheap deterministic re-ranking slot; if the upgraded eval ever shows ordering (not recall) failures — relevant chunk retrieved at rank 6–50 but crowded out — first tune the cap/dedup logic, then consider a flag-gated gpt-4o-mini listwise rerank of the 50-candidate window, adopting it only on a ≥5-point precision/recall@5 gain. This is recorded as an experiment, not a commitment.

## 6. Context construction

**Practice.** LLMs use the beginning and end of the context window more reliably than the middle ("Lost in the Middle", Liu et al. 2023 — accuracy drops 15–20% when the relevant document sits mid-list in 20-document contexts). Mitigations: keep k small, order by relevance, and place the strongest passages at the edges. Clear delimitation between instructions and retrieved data, plus explicit "treat retrieved content as data, not instructions", is the standard first-line prompt-injection mitigation for RAG.

**Verdict for this system.** With k=5 short passages (~1.5–2.5k tokens total), lost-in-the-middle effects are minor — the current relevance-ordered injection is acceptable and **no reordering scheme is adopted** (unmeasurable at k=5). Adopt instead: passage headers with stable ids (`[S1] Title — Org`) to support structured citations, and a one-line data-not-instructions hardening clause. Token budgeting is already implicitly safe (5 × ~400 words); make the budget explicit in shared config so a future k change can't silently blow the window.

## 7. Answer generation and citations

**Practice.** For health-adjacent assistants the floor requirements are: grounding instructions that distinguish sourced from general-knowledge claims, citation markers that are *validated against the supplied context* (models fabricate plausible source titles when asked for free-text bibliographies), explicit emergency-escalation behaviour, and refusal/uncertainty language that does not overclaim. Structured citation ids beat free-text titles because validation becomes a set-membership check.

**Verdict for this system.** Adopt inline `[S1]`-style markers validated in code (`extractCitations`), replacing the current honour-system title list whose exact-match enrichment silently fails on paraphrase. Keep the no-refusal augmentation philosophy (a deliberate, documented product decision that fixed real refusal failures) but bound it with a safety layer: escalation-first for red-flag symptoms, no dose/individual-diagnosis output, uncertainty statements for contested facts. Citation *validation* is deterministic; citation *completeness* stays judged + human-spot-checked.

## 8. Evaluation

**Practice.** Retrieval and generation are evaluated separately. Retrieval: recall@k, precision@k, MRR, nDCG against labelled relevant sets — deterministic, cheap, no LLM. Generation: faithfulness/groundedness, answer relevance, citation correctness — typically LLM-judged (RAGAS-style claim extraction + NLI) but with documented reliability limits: correlation with human judgment can be modest (harmonic mean ≈ 0.55 reported in one validation), judges exhibit position/verbosity/leniency biases, and fine-grained scales produce arbitrary scores ([RAGAS docs](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/), [LLM-as-judge survey](https://arxiv.org/html/2411.15594v6), [Evidently guide](https://www.evidentlyai.com/llm-guide/rag-evaluation)). Recommended mitigations: coarse scales (binary or 0/1/2), judge calibration against a human-annotated set, deterministic checks wherever the property is machine-checkable.

**Verdict for this system.** This is the highest-leverage gap. The current eval's own history proves the point: the gpt-4o-mini judge scored 32/32 answers uniformly 2/2 (baseline re-run 2026-07-16: 31×2, 1×1) — a judge that (almost) never dissents measures (almost) nothing. Adopt: deterministic retrieval metrics (recall@{1,3,5}, precision@5, MRR, nDCG@5) over graded relevance labels; deterministic safety assertions (regex/predicate MUST/MUST-NOT rules for emergency numbers, dosing, region, injection-leakage) which are *more* reliable than any judge for these properties; a stricter 0/1/2 groundedness rubric with mandatory human spot-checks and recorded agreement. **Not adopted:** the RAGAS library itself (Python dependency, LLM-heavy metrics, overkill for a 60-question set — its metric *definitions* are borrowed, not its runtime), synthetic test-set generation (hand-labelled questions are affordable and higher-quality at this scale).

## 9. Healthcare AI safety

**Practice.** WHO's guidance on large multi-modal models in health (January 2024) highlights misinformation, bias, and hallucination as core risks when patients/caregivers use LLMs for health information, and calls for transparency about limitations, human oversight, and appropriate escalation paths ([WHO LMM guidance](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models)). For a caregiver-facing information tool the practical translation is: never diagnose; never dose; escalate emergencies before informing; distinguish general guidance from clinical advice; accurate privacy claims; plain compassionate language.

**Verdict for this system.** All adopted as prompt rules **and** machine-checked eval assertions (a rule without a test regresses silently at temp 0.7). Region correctness is a safety property here, not localisation polish: emergency and helpline numbers verified against official NZ sources — 111 (emergency), Healthline **0800 611 116** (24/7 nurse advice, [Health NZ](https://www.healthnz.govt.nz/online-phone-healthcare/healthline)), Alzheimers NZ support line **0800 004 001** ([alzheimers.org.nz](https://alzheimers.org.nz/get-support/where-to-go-for-help/)), 1737 (mental-health support line, relevant for carer distress). Dementia New Zealand operates regional services without a single national helpline — the prompt should point to Alzheimers NZ's line and local services rather than invent one.

## 10. Source quality and licensing

**Practice.** A knowledge base for health information needs a source registry: authority, publication/review dates, region, licence, version, and a refresh/retirement process. WHO's iSupport manual — the origin of ~85% of this corpus — is published under **CC BY-NC-SA 3.0 IGO** ([WHO IRIS record](https://iris.who.int/handle/10665/324794)), which permits non-commercial adaptation with attribution and share-alike; WHO invites adaptation enquiries via whodementia@who.int. Country adaptations (e.g. iSupport NZ) may carry their own terms that must be checked per document.

**Verdict for this system.** Re-ingest from the official WHO publication (and the NZ adaptation if its terms permit) with full provenance columns, recording the licence per source. The existing 380 provenance-free chunks are retired once the replacement passes evaluation. Attribution requirements of CC BY-NC-SA flow naturally into the citation feature (source_org + URL per chunk). **Licence confirmation is a user gate before any ingestion.** Note for the inventory: whether this app counts as "non-commercial" is a judgement for the project owner; flag it rather than assume.

## 11. Observability

**Practice.** Production RAG systems log per-request: retrieved ids and scores, prompt/config versions, token usage, stage latencies, and validation outcomes — enough to reconstruct any answer after the fact — while excluding raw user text where privacy demands.

**Verdict for this system.** Adopt a device-local, dev-gated ring buffer (no backend exists to ship logs to, and shipping health queries off-device would be a privacy regression, not an improvement). Log ids/scores/versions/latencies, never message text. This is deliberately the smallest observability that makes eval-vs-production drift and bad answers debuggable.

---

## Summary of adoption decisions

| Technique | Decision | Primary justification |
|---|---|---|
| Hybrid vector+keyword | Keep; commit function; benchmark RRF vs production formula | Reproducibility first, then measured tuning |
| HNSW / index migration | **Rejected** (trigger condition recorded); REINDEX after corpus replacement | 449 rows — unmeasurable benefit |
| text-embedding-3-large | **Rejected** without eval evidence | 31/32 baseline leaves no measurable headroom; 6.5× cost |
| Section-aware chunking + title prefixes | Adopt at re-ingestion | Free during rebuild; aligns units with structured source |
| LLM contextual chunk enrichment | **Rejected** | Cost/complexity vs corpus size |
| Cross-encoder / API reranker | **Rejected** | No backend; failure mode not observed |
| Flag-gated LLM rerank of oversample window | Experiment only, adoption gated on ≥5-pt gain | Cheap to try, likely not adopted |
| Context reordering (lost-in-middle) | **Rejected** | k=5 — effect below measurement noise |
| Structured validated citations | Adopt | Deterministic; fixes dead UI + honour-system risk |
| Deterministic retrieval metrics + safety assertions | Adopt | Judge demonstrated near-zero discrimination |
| RAGAS library | **Rejected** (definitions borrowed, runtime not) | Dependency weight vs 60-question set |
| Stricter judge + human spot-check | Adopt | Known judge-leniency failure, documented mitigation |
| Source registry + licence-gated re-ingestion | Adopt | 85% of corpus currently provenance-free |
| Device-local telemetry | Adopt | Smallest debuggable observability; privacy-preserving |

### Sources

- [Supabase — Hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
- [pgvector README](https://github.com/pgvector/pgvector/blob/master/README.md) · [Neon — Optimize pgvector search](https://neon.com/docs/ai/ai-vector-search-optimization)
- [OpenAI — New embedding models and API updates](https://openai.com/index/new-embedding-models-and-api-updates/) · [Pinecone — OpenAI embeddings v3](https://www.pinecone.io/learn/openai-embeddings-v3/)
- [Anthropic — Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval)
- Liu et al. 2023, "Lost in the Middle: How Language Models Use Long Contexts" (see [overview](https://atlan.com/know/llm/lost-in-the-middle-problem/))
- [Ragas — available metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/) · [A Survey on LLM-as-a-Judge](https://arxiv.org/html/2411.15594v6) · [Evidently — RAG evaluation guide](https://www.evidentlyai.com/llm-guide/rag-evaluation)
- Chunking: [Chunk Twice, Embed Once (arXiv 2506.17277)](https://arxiv.org/pdf/2506.17277) · [AI21 — query-dependent chunking](https://www.ai21.com/blog/query-dependent-chunking/) · [Firecrawl chunking benchmark roundup](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- [WHO — LMM ethics & governance guidance news release](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models)
- [WHO IRIS — iSupport manual (CC BY-NC-SA 3.0 IGO)](https://iris.who.int/handle/10665/324794) · [WHO — iSupport programme page](https://www.who.int/teams/mental-health-and-substance-use/treatment-care/isupport)
- NZ helplines: [Health NZ — Healthline](https://www.healthnz.govt.nz/online-phone-healthcare/healthline) · [Alzheimers NZ — Where to go for help](https://alzheimers.org.nz/get-support/where-to-go-for-help/) · [Dementia NZ](https://dementia.nz/)
