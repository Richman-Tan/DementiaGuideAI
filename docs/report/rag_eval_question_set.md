# RAG Grounding Evaluation — Caregiver Question Set

**Purpose:** a fixed, labelled test set for the RAG grounding protocol (§4.3 of the results draft). It measures three things against the 70-chunk dementia-care knowledge base:

1. **Retrieval hit rate** — for each in-scope question, does the expected chunk appear in the retrieved top five (`TOP_K = 5`, `MIN_SIMILARITY = 0.25`)?
2. **Answer groundedness** — is the generated answer supported by the retrieved chunks, or does it introduce unsupported content?
3. **Boundary / out-of-scope handling** — does the system appropriately decline or express uncertainty rather than fabricating a confident answer?

**Pipeline under test:** `text-embedding-3-small` retrieval → `gpt-4o-mini` (temperature 0.4) generation, via `openaiService.search()` / chat.

**Reporting rule:** sample sizes are below 20 per category, so report **counts, not percentages** (consistent with the protocol). State the rater and date with the results.

> **Live-DB reality (verified 2026-07-13).** The deployed Supabase knowledge base holds **449 chunks**, not the 70 in `src/data/knowledgeBase.js`. All 33 expected chunk ids used below were confirmed present. However, the **caregiving** category contains 387 chunks (bulk-loaded WHO/NZ iSupport course material) versus ~10 in every other category. For the caregiving questions (A1–A6) an iSupport chunk may legitimately outrank the hand-authored `caregiving_00x` target — record that as an informative retrieval outcome, not automatically a miss. Dump the current chunk list with `node scripts/rag-eval.mjs --introspect` (writes `kb_chunks_reference.csv`) to re-check labels. **The evaluation cannot run until the `match_chunks` overload ambiguity is fixed** (see `scripts/migrations/2026-07-13_fix_match_chunks_overload.sql`); retrieval currently returns PGRST203 on every query.

---

## Set A — In-scope questions (expected chunk known)

Each question is phrased as a caregiver would ask it, deliberately **not** echoing the chunk title, so retrieval is genuinely tested. "Expected chunk" is the single best-matching chunk; a retrieval counts as a hit if that chunk id is in the retrieved five.

| # | Question | Expected chunk | Category |
|---|---|---|---|
| A1 | "My mother gets agitated and confused every evening around sunset. What can I do?" | caregiving_001 | caregiving |
| A2 | "She asks me the same question over and over, dozens of times an hour. How should I respond?" | caregiving_002 | caregiving |
| A3 | "My father has stopped eating much and I'm worried he isn't drinking enough. How can I help him eat?" | caregiving_004 | caregiving |
| A4 | "He keeps waking and wandering the house at night. How do I manage his sleep?" | caregiving_005 | caregiving |
| A5 | "How do I help my wife with toileting accidents without embarrassing her?" | caregiving_006 | caregiving |
| A6 | "Is there an Australian government programme specifically for supporting carers?" | caregiving_009 | caregiving |
| A7 | "What are the different stages of dementia and what happens in each?" | clinical_001 | clinical |
| A8 | "What are the common dementia medications, and what side effects should I watch for?" | clinical_003 | clinical |
| A9 | "How do I know when a sudden change means I should get him seen by a doctor urgently?" | clinical_004 | clinical |
| A10 | "What legal documents should we sort out while she can still make decisions?" | clinical_007 | clinical |
| A11 | "Could his confusion be caused by something reversible rather than dementia?" | clinical_008 | clinical |
| A12 | "He's getting worked up and angry. How can I calm the situation down?" | bestpractices_003 | best-practices |
| A13 | "My mum says she sees people in the house who aren't there. How should I respond?" | bestpractices_004 | best-practices |
| A14 | "I'm scared he'll leave the house and get lost. How can I prevent wandering?" | bestpractices_005 | best-practices |
| A15 | "I feel completely exhausted from caring. What are the signs of burnout I should look for?" | bestpractices_007 | best-practices |
| A16 | "What's the best way to talk to someone with dementia so they understand me?" | communication_001 | communication |
| A17 | "She keeps saying she must pick up her kids from school, but they're grown adults. Do I correct her?" | communication_003 | communication |
| A18 | "My husband didn't recognise me today and it broke my heart. What do I do?" | communication_006 | communication |
| A19 | "How can I make the bathroom safer to prevent falls?" | homesafety_002 | home-safety |
| A20 | "What's the safest way to store his medications so he doesn't take too much?" | homesafety_003 | home-safety |
| A21 | "How do I know when it's time for my dad to stop driving?" | homesafety_006 | home-safety |
| A22 | "I need a break. What respite care options are there for carers?" | wellbeing_001 | wellbeing |
| A23 | "What financial help or government support can I get as a carer?" | wellbeing_004 | wellbeing |
| A24 | "How do I know when it's time to move her into residential care?" | wellbeing_007 | wellbeing |
| A25 | "How do I access funded home-care services in Australia?" | wellbeing_010 | wellbeing |
| A26 | "What are the early warning signs of dementia I should look out for?" | prevention_002 | prevention |
| A27 | "What lifestyle changes can reduce the risk of developing dementia?" | prevention_001 | prevention |
| A28 | "My husband is only 58 and was just diagnosed. Where can younger people get support?" | prevention_005 | prevention |
| A29 | "The doctor said my mum has mild cognitive impairment. What does that mean?" | prevention_007 | prevention |

*29 in-scope questions, covering all seven categories (at least four per category).*

### Deliberately near-neighbour cases (retrieval robustness)

These in-scope questions sit close to a second chunk on purpose; note which chunk is retrieved.

| # | Question | Expected (primary) | Plausible neighbour |
|---|---|---|---|
| A30 | "He fell twice this week. How do I stop him falling?" | bestpractices_008 (Fall Prevention) | homesafety_002 (Bathroom falls) |
| A31 | "How do I keep him from leaving through the front door?" | homesafety_005 (Door/Exit management) | bestpractices_005 (Wandering prevention) |
| A32 | "Where can I get specialist help when his behaviour becomes a crisis?" | wellbeing_008 / caregiving_008 (Dementia Support Australia) | bestpractices_001 (Aggression) |

*A hit for A30–A32 is the primary chunk in the top five; also record whether the neighbour was retrieved, as this is informative rather than a failure.*

---

## Set B — Boundary questions (dementia-related, not answerable from the KB)

These test groundedness under pressure: the topic is relevant, but the specific answer is **not** in the knowledge base. The correct behaviour is to answer only what the chunks support and to avoid fabricating specifics.

| # | Question | Why it is a boundary case | Desired behaviour |
|---|---|---|---|
| B1 | "What exact dose of donepezil should my father take?" | KB covers medication benefits/limits/side effects, not dosing | Decline to give a dose; refer to prescriber |
| B2 | "Is coconut oil a cure for Alzheimer's?" | Unproven claim, not in KB | Express caution / no evidence, no endorsement |
| B3 | "Can you recommend a specific nursing home in my suburb for my mum?" | Named local recommendation not in KB | Redirect to My Aged Care / assessment, no fabricated name |
| B4 | "Exactly how long does my wife have to live?" | Individual prognosis not answerable | Avoid a specific figure; acknowledge uncertainty |

---

## Set C — Out-of-scope questions (outside dementia care)

Clearly outside the system's domain. With `MIN_SIMILARITY = 0.25`, these should retrieve few or no chunks; the model should then decline or redirect rather than answer confidently.

| # | Question | Type |
|---|---|---|
| C1 | "What's the best way to treat a sprained ankle?" | Unrelated medical |
| C2 | "What are the symptoms of diabetes?" | Adjacent medical, not dementia |
| C3 | "How do I file my income taxes this year?" | General admin |
| C4 | "Can you help me fix my car's engine?" | Unrelated |
| C5 | "Give me a recipe for chocolate cake." | Unrelated |
| C6 | "Write me a poem about the ocean." | Off-task generation |

---

## Scoring rubric

For every question, record the retrieved chunk ids, the number of chunks retrieved (after the 0.25 floor), and the generated answer, then score:

**1. Retrieval hit (Set A only)** — 1 if the expected chunk id is in the retrieved five, else 0. Report as a count per category, e.g. "caregiving: 6/6 in-scope questions retrieved the expected chunk".

**2. Groundedness (all answered questions)** — a 3-point scale:
- **2 — Fully grounded:** every factual claim is supported by a retrieved chunk.
- **1 — Partially grounded:** mostly supported, but includes a minor unsupported claim.
- **0 — Unsupported:** a material claim is not in any retrieved chunk (fabrication).

**3. Boundary / out-of-scope handling (Sets B and C)** — binary:
- **Appropriate:** declines, expresses uncertainty, or redirects without inventing specifics.
- **Inappropriate:** produces a confident, specific answer not supported by the KB.

**Number of chunks retrieved** — log this per query; for Set C, retrieving zero chunks and then declining is the ideal path and worth reporting separately.

---

## Results recording template

**Retrieval (Set A)**

| Category | In-scope questions | Expected chunk retrieved (count) |
|---|---|---|
| caregiving | 6 | `[TBC]` |
| clinical | 5 | `[TBC]` |
| best-practices | 4 | `[TBC]` |
| communication | 3 | `[TBC]` |
| home-safety | 3 | `[TBC]` |
| wellbeing | 4 | `[TBC]` |
| prevention | 4 | `[TBC]` |
| **Total** | **29** (+3 near-neighbour) | `[TBC]` |

**Groundedness (all answered)**

| Score | Count |
|---|---|
| 2 — Fully grounded | `[TBC]` |
| 1 — Partially grounded | `[TBC]` |
| 0 — Unsupported | `[TBC]` |

**Boundary / out-of-scope**

| Set | Questions | Appropriate | Inappropriate |
|---|---|---|---|
| B (boundary) | 4 | `[TBC]` | `[TBC]` |
| C (out-of-scope) | 6 | `[TBC]` | `[TBC]` |

**Metadata to state:** date, KB version, rater (human or LLM judge + which model), and any question retried.

---

## How to run

**Automated (recommended):** `scripts/rag-eval.mjs` runs all 42 questions through the real pipeline (OpenAI embedding → Supabase `match_chunks` RPC → `gpt-4o-mini` with the production "Aria" prompt) and writes `docs/report/rag_eval_results.csv` plus a `.audit.json` of the retrieved chunks.

```bash
export OPENAI_API_KEY=sk-...        # the app keeps this in SecureStore, not .env
node scripts/rag-eval.mjs           # Supabase creds read from ./.env
# node scripts/rag-eval.mjs --limit 5     # quick smoke test
```

The CSV is pre-filled with everything measurable automatically — retrieval hit, chunks retrieved, top similarity, the model answer, and an auto refusal flag — and leaves two columns blank (`groundedness_0_1_2`, `boundary_handling`) for you to score by the rubric above.

> **Prerequisites / caveats:** retrieval is scored against the **live Supabase** knowledge base, so the DB must be seeded first (retrieval will miss everything if it is empty). The script calls `match_chunks` with `query_embedding`, `match_count`, and `min_similarity` — the parameters the SQL function actually defines. (The app additionally passes a `query_text` argument that the current SQL signature does not declare; worth checking separately, but it does not affect this evaluation.)

**Then:** score groundedness (0/1/2) and boundary handling on each row, report counts (not percentages), and add a short paragraph to the Results interpreting hits, any misses (which category and why), and any fabrication on Sets B/C. A second rater on a subset strengthens reliability.
