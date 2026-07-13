# 700B Evaluation Plan — DementiaGuide AI

Protocols for the four evaluations outstanding after the mid-year point. These are
plans to execute in the second half of the project; none require inventing data,
and each states what evidence it produces. Items 1 and 3 need people/hardware I
cannot provide; items 2 and 4 have runnable tooling already in the repo.

---

## 1. Human usability study (central — answers the research question)

The mid-year evaluations validate enabling components (avatar articulation, RAG
grounding) but not the headline question: *does an AI-powered avatar-based
interface improve accessibility, personalisation, and usability of dementia-care
resource management?* This study is designed to address SQ1, SQ4, SQ5 and O5.

**Design.** Within-subjects, counterbalanced comparison of two interfaces on the
same knowledge base:
- **A — avatar interface:** the DementiaGuide AI voice/avatar assistant.
- **B — text baseline:** the same RAG chat without the avatar/voice (text in, text out).

Each participant completes matched tasks on both A and B; order (A-first / B-first)
is counterbalanced to control for learning effects.

**Participants.** Family caregivers of people with dementia are the primary group;
optionally a smaller group of healthcare/support workers for contrast. Target
8–12 caregivers (usability studies detect most issues by ~8; more strengthens the
comparison). Recruit via the project partner and caregiver networks. **Requires
University of Auckland Human Participants Ethics Committee (UAHPEC) approval before
any session** — build in 4–6 weeks lead time.

**Tasks (representative resource-finding).** 5–6 realistic prompts drawn from the
knowledge-base categories, e.g.: "find out how to manage agitation in the evening",
"work out what respite options exist", "check what to do about night-time
wandering". Use different but matched task sets for A and B so answers can't carry
over.

**Measures.**
- *Effectiveness:* task success (completed / partial / failed), scored against a
  rubric of the key information the answer should contain.
- *Efficiency:* time on task; number of turns/queries to reach the answer.
- *Satisfaction/usability:* System Usability Scale (SUS) per interface; plus 3–4
  Likert items on trust, engagement, and perceived helpfulness.
- *Accessibility/personalisation (qualitative):* short semi-structured debrief on
  clarity, cognitive load, and whether responses felt tailored to their role.

**Analysis.** With n < 20, report **counts and medians, not percentages**, and use
non-parametric comparisons (e.g. Wilcoxon signed-rank for paired time/SUS) only if
n and distribution justify it; otherwise report descriptively and thematically.
Do not use "significant" unless a test was run and met.

**Evidence produced.** Direct, human evidence on whether the avatar interface
improves usability/engagement over text — the core of the research question.

---

## 2. Voice-pipeline latency measurement

**Goal.** Quantify the responsiveness the streaming design targets, per stage and
end-to-end (§4.2, Table 3).

**Procedure.**
1. Run the app and drive ~20 representative caregiver queries (reuse the RAG
   question set, Set A). Keep device and network fixed and stated.
2. The pipeline logs one `[LATENCY SUMMARY] {…}` line per response
   (`src/hooks/useAvatarConversation.js`). Capture the console/Metro output to a file.
3. Parse it: `node scripts/parse-latency.mjs path/to/console.log` → writes
   `docs/report/latency_results.csv` (median + range per stage) for Table 3.
4. Optional A/B: repeat with concurrent sentence playback disabled to quantify
   that optimisation's contribution.

**Measures.** `stt_ms`, `rag_ms`, `llm_to_token_ms`, `first_sentence_ms`,
`tts_first_ms`, and end-to-end `to_first_audio_ms` (the headline responsiveness
number). Report median and min–max over n runs; state n, device, network.

**Evidence produced.** A quantitative latency profile substantiating (or not) the
low-latency claim in the Proposed Solution.

---

## 3. On-device lip-sync verification

The lip-sync metrics (§6.1–6.8) were recorded in the Unity Editor only. This
confirms they hold in the shipped React Native app on a physical iOS device.

**Procedure.**
1. Build and run the app on a physical iPhone (UaaL bridge active).
2. Drive the same fixtures / representative utterances through the production
   avatar path.
3. Verify against the editor findings: bilabial /p b m/ closures visibly seal,
   /f v/ show lip-to-teeth, the mouth returns to rest during silence, and there is
   no oscillation. Capture screen recordings at the check points for the report.
4. Note any divergence attributable to device frame-rate or bridge timing.

**Evidence produced.** Confirmation that the editor-verified articulation transfers
to the deployed application (or a documented gap to close).

*(Requires a build on device — not runnable from here.)*

---

## 4. Human check of the groundedness ratings

The groundedness scores (§6.9) came from an LLM judge (gpt-4o-mini), which scored
all 32 in-scope answers a uniform 2/2 — plausible but subject to same-family judge
leniency.

**Procedure.**
1. Open `docs/report/rag_eval_graded.csv` — each row has the question, the judge's
   score, and its reason; `rag_eval_results.audit.json` has the answers and the
   exact retrieved chunk ids.
2. A human rater independently re-scores a sample (e.g. all 3 former misses plus a
   random 8–10 others) against the same rubric (2 fully grounded / 1 minor
   unsupported / 0 material fabrication), blind to the judge's score.
3. Compare human vs judge; if they diverge, expand the human sample and report the
   human figure as primary with the judge figure as a cross-check.

**Evidence produced.** A trustworthy groundedness figure for a healthcare context,
with the LLM-judge leniency caveat resolved or quantified.

---

## Status summary

| Item | Runnable here? | Deliverable in repo |
|---|---|---|
| 1 Usability study | No (people + ethics) | This protocol |
| 2 Latency measurement | Tooling yes, data needs the running app | `scripts/parse-latency.mjs`, Table 3 template |
| 3 On-device lip-sync | No (device build) | This checklist |
| 4 Human groundedness check | No (needs a human rater) | `rag_eval_graded.csv` as the review sheet |
