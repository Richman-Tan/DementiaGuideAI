# Literature review → final report: what has to change

Assessment written 2026-09-21 of [`2026-04_scope-objectives-literature-review.docx`](2026-04_scope-objectives-literature-review.docx)
(the April submission, ~5,300 words, 26 references) against
[`../rubric/final-report-rubric.md`](../rubric/final-report-rubric.md) and against what
the project actually built and measured.

**Headline.** The document is in better shape than the repository suggested: it
already contains a research problem, a main research question, five sub-questions,
an aim, five objectives, a scope and a significance statement (§2), which is most of
what rubric criterion **B (10 %)** asks for, and the review itself (§3) is organised
by domain and is critical rather than descriptive in places. What it is *not* is a
description of this project. It describes a **"digital resource management system"
with AI-driven personalisation and a memory-and-adaptation layer**. What was built
and evaluated is a **retrieval-grounded, safety-gated, NZ-specific dementia-care
assistant with a lip-synced avatar**, measured on retrieval precision, answer
groundedness and safety, latency, lip-sync accuracy, speech recognition on dementia
speech, functional verification, scalability and cost. Two of the five research
questions have no corresponding method or result anywhere in the repository.

Rubric criterion **C** wants "clear alignment with research questions" and criterion
**B** wants questions that are "well-formulated **and aligned**". An unanswered
research question costs marks in both. That is the main work.

---

## 1. What is already working (keep it)

- **§2 is a real framing section.** Problem → question → sub-questions → aim →
  objectives → scope → significance, in that order. Criterion B's A band asks for
  "clear logical progression from literature to research direction"; §2.1 does
  derive the question from three named limitations.
- **§3.6 (Avatar-Based Systems) is the strongest section in the document.** It
  distinguishes what the evidence supports from what it does not ("promising, but
  not yet well validated"), and it separates Tanaka et al.'s dementia-*detection*
  use of avatars from assistive use — that is exactly the "evaluation of relevance
  and implications of prior work" the A band names. §3.2 and §3.4 do similar work.
- **§3.8 (Existing Solutions)** covering commercial systems alongside academic work
  is unusual and worth keeping; it is what lets the gap statement in §3.9 be about
  the field rather than only about papers.
- **The gap statement in §3.9 is concrete** — four named things no existing system
  combines — rather than the usual "more research is needed".

## 2. Mechanical errors to fix now

| Where | Problem |
|---|---|
| Title page | Department is given as **"Civil and Environmental Engineering"**. This is a Part IV **Software** Engineering project (ECSE). |
| §3.6, final sentence of para 3 | **"That gap remains important for your project."** — second-person editorial note left in the body text. |
| §5 **PROJECT PLAN** | Heading with no content. |
| §3.1 | Claims "25–30 peer-reviewed academic sources from IEEE, ACM, Springer, and medical journals". The reference list has 26 entries of which **6 are company web pages**; the peer-reviewed count is ~20 and the venues are predominantly JMIR, not IEEE/ACM/Springer. Either re-count or re-word. |
| References | Four entries use **"et al." in the reference list itself** (Rampioni 2021, Stara 2021, Tanaka 2017, Xie 2020) — a reference list must name all authors. Xie 2020 has no volume or pages. |
| References | **Three entries are never cited in the body**: Khampuong et al. 2023, Lima et al. 2022, Lima et al. 2023. Lima et al. 2023 (participatory study of conversational AI in home dementia care) is directly relevant and should be *cited*, not deleted. |
| References | Verify Rampioni et al. 2021 — a *PLOS Digital Health* DOI (`10.1371/journal.pdig.0000184`) with a 2021 date needs checking; that journal began publishing in 2022. |
| Headings | §2.1 is Heading 2; §2.2–2.5 and all of §3 are Heading 3, with no Heading 2 under §3. Inconsistent outline levels. |
| §3.8 | The "Grok-style avatars"/xAI citation is weakly relevant in a dementia-care review and invites a question in the viva. Consider cutting. |

## 3. The alignment problem: questions vs. what exists

| Research question (§2.2) | Built? | Evaluated? | Verdict |
|---|---|---|---|
| RQ1 — limitations of existing digital resource management systems in dementia care | n/a | §3 literature | **Answered** by the review itself |
| RQ2 — how can **AI-driven personalisation** improve relevance and usability? | Only as user-set preferences (`packages/core/rag/prompt.js`: caregiver framing, `ariaPersonality`, concise/detailed length). No recommender, no learned adaptation, no cross-session memory. | **No.** The E2 condition matrix is a prompt/RAG ablation (`v2`, `v2-nosafety`, `v1`, `p0`, no-RAG, oracle, `gpt-4o-mini`); no personalisation condition exists. | **Unanswerable as written — must be rewritten** |
| RQ3 — role of avatar-based interfaces in engagement and accessibility | Yes (Unity + web avatars, viseme lip-sync) | **Objectively yes** (E5: 95/95 acceptance checks, G2P ablation). **Perceptually no** — E6 was designed and not run, and the user study has no analysable data. | **Partly; must be narrowed to articulation, not engagement** |
| RQ4 — how can conversational interaction support caregiver decision-making? | Yes | Indirectly (E2 helpfulness/correctness, E3 safety). Decision-making itself was to be measured by the user study. | **At risk — depends on E7** |
| RQ5 — design considerations for varying digital literacy | Partly (voice-first, concise mode, reading level) | **This is where E9 actually lands** — but the question as written is about digital literacy, not speech. | **Rewrite to match E9** |

**Nothing in §2 mentions the two things the project spent most of its evaluation
effort on:** grounding/safety (does the assistant say true, safe, NZ-correct
things?) and robustness of the speech path for the population it serves. A reader
of §2 would not predict the evaluation chapter.

### Suggested revision of the research questions

Keep the aim. Replace the sub-questions with ones the report can answer with
evidence that already exists:

1. What are the limitations of existing digital resource systems for dementia care? *(unchanged — §3)*
2. Does retrieval grounding in a curated New Zealand dementia-care corpus improve the correctness, groundedness and safety of a conversational assistant's answers, relative to an ungrounded model? *(E1, E2)*
3. What effect does explicit safety prompting have on the handling of emergency, medical and out-of-scope requests? *(E3)*
4. Can an avatar be driven with articulation accurate enough, and latency low enough, for real-time spoken interaction? *(E4, E5)*
5. How accurately does the system's speech recognition transcribe the speech of people living with dementia, and how do those errors propagate to the retrieved answer? *(E9)*
6. Is the delivered system verifiably correct, scalable and affordable to operate? *(E10, E11, E12)*
7. *(only if the study runs)* How do caregivers rate the usability and usefulness of the system, and does the avatar condition differ from text? *(E7)*

If RQ2-as-personalisation is kept at all, it has to be demoted to Future Work with
an honest statement that preference settings were implemented but not evaluated.

### Scope statement conflict (§2.4)

§2.4 states the project "will not entail the use of any clinical data". The project
subsequently used **DementiaBank / ADReSS-2020 clinical recordings** (E9) and ran a
**UAHPEC-approved human study** involving people living with dementia. §2.4 must be
rewritten or the methods chapter will contradict the scope statement on the same
reading. Keep the true limits — no diagnosis, no deployment in a healthcare
facility, no clinical outcome claims.

## 4. What the review is missing for the final report

Each of these is a chapter of the evaluation with no literature underneath it.
Criterion **A (10 %)** wants "connections across the field"; criterion **C (20 %)**
wants the design "justified through theory and/or best practice"; criterion **D**'s
A band wants "comparison with literature". All three are paid from the same
additions.

| Needed section | Why | Supports |
|---|---|---|
| **Retrieval-augmented generation and grounding in health information** | §4 proposes a "retrieval and grounding layer" with **zero citations**, and E1/E2 are the largest results in the report. Needs the RAG literature, hallucination/factuality in health LLMs, and citation/attribution work. | A, C, D |
| **Safety and risk in health chatbots** | E3 is arguably the project's strongest contribution and has no literature at all. Needs work on harm, escalation, medical-advice boundaries, and the failure cases documented for health chatbots. | A, C, E |
| **Speech recognition on impaired and older speech** | E9 is a WER study; without the ADReSS-2020 challenge papers and the dysarthric/disordered-speech ASR literature there is nothing to compare against, and the D band explicitly rewards comparison with literature. | A, C, D |
| **Localisation and context-specificity of health information** | The entire safety design is NZ-specific (111 not 000, NZ helplines). The current §3 never raises that health information is jurisdiction-bound — yet the v1 prompt shipped *Australian* content, which is the project's clearest "why this mattered" story. | A, B, E |
| **Evaluation methodology** | LLM-as-judge validity and its agreement with human raters, inter-annotator agreement conventions (κ and its known behaviour under skewed label distributions — directly relevant to the E1 κ), SUS norms and interpretation. | C |
| **Visual speech and co-articulation** | Cohen & Massaro (1993) is already used in the mid-year discussion (see `../results-discussion-conclusion-draft.md` §H) but is not in this reference list. | A, C |

Roughly six to eight new sub-sections and perhaps 15–20 additional references.
That is a realistic week of work, and it is the cheapest route to criteria A and C
because the results it has to connect to already exist.

## 5. Reusable as-is

§3.2, §3.3, §3.4, §3.5, §3.6, §3.7 and §3.8 can largely survive into the final
report's Literature Review with light editing. §3.9 (gaps) and §3.10
(contribution) must be rewritten once §4 above is added — the gap the project
actually filled is not the one stated in April.

## 6. The contribution statement

§3.10 is a single sentence and §2.5 is three lines. Criterion **E is 25 % of the
mark** and its A band asks for a "meaningful contribution to existing knowledge"
with "claims proportionate to findings". The defensible claims now available, none
of which appear in the April document:

- A measured safety-prompt ablation on a dementia-care assistant, with the
  jurisdictional failure (AU helplines served to NZ users) found and fixed under
  measurement.
- Word-error rate of a deployed consumer STT stack on ADReSS-2020, split by
  recogniser *and* by endpointing policy, with a downstream retrieval-degradation
  curve — a system-level result, not a benchmark number.
- A cost model showing that speech synthesis, not the language model, dominates
  the price of a spoken turn, with the lip-sync capability itself carrying a
  measurable premium.
- An engineering-verification programme (requirements matrix, coverage, capacity
  model) of the kind student prototypes are rarely held to.

What must **not** be claimed: engagement or usability benefit from the avatar, any
care outcome, or anything about people living with dementia using the system —
unless E7 produces data.
