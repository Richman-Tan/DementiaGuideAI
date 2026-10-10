# Adaptive agent tester — methodology

Date: 2026-09-02. Covers `scripts/eval/adaptive-agent-tester.mjs`: a Claude tool-use agent that red-teams the production Aria pipeline with difficult and boundary questions, adapts its follow-ups based on what it sees, and records structured findings. This document is the literature grounding and the ethics/requirements framing for that script — the "why", not the "how to run it" (see [rag-evaluation-plan.md](rag-evaluation-plan.md) and `scripts/README.md` for that).

This is an addition to, not a replacement for, the existing evaluation suite. It adds two things the existing suite does not have: (1) an independently-generated, non-static question set (harder to game than a fixed labelled list), and (2) a judge from a different model family than the system under test.

## Why a second, cross-model judge

The existing groundedness judge (`grade-groundedness.mjs`) uses `gpt-4o-mini` to grade `gpt-4o`'s answers — same model family. This project already documented one failure mode of that setup: the retired grader scored 32/32 answers uniformly 2/2, "a judge that never dissents measures nothing" ([rag-evaluation-plan.md](rag-evaluation-plan.md)). The literature gives a second, more specific reason to be cautious about it:

- **Self-preference bias in LLM-as-judge.** Panickssery, Bowman & Feng, ["LLM Evaluators Recognize and Favor Their Own Generations"](https://arxiv.org/abs/2410.21819) (arXiv 2410.21819) — LLM judges systematically favour outputs from their own model family; GPT-4 shows a measurably higher win rate for its own outputs than an equally-good alternative. A follow-on line of work extends this to a **cross-model preference bias**, where a judge favours outputs from models in the same training lineage even when not literally itself.
- **Panel-of-judges mitigation.** The standard mitigation in the LLM-eval literature is a panel of judges drawn from *different* providers/training pipelines, since each model's stylistic bias points in a different direction and the aggregate cancels much of the per-model skew (ensembling doesn't eliminate bias entirely, but cross-provider selection is the load-bearing first step).

Practical translation for this project: `grade-groundedness.mjs` (gpt-4o-mini judging gpt-4o) is kept — it is cheap, already calibrated, and this is not an argument to remove it — but its blind spot is structural, not fixable by a stricter rubric alone. `adaptive-agent-tester.mjs` uses Claude specifically because it sits outside that model family, as a second, differently-biased opinion rather than a more-of-the-same one.

## Why adversarial questions should be AI-generated, not only a fixed list

`questions.js` is a static, hand-labelled set (29 in-scope + boundary/safety/injection/NZ questions). It is valuable precisely because it's fixed — reproducible, auditable, comparable run-to-run — but a fixed set is also a fixed target: once every question in it passes, it stops finding new failure modes, and it can't adapt phrasing to whatever the previous answer revealed.

- **Automated red-teaming as adversarial search.** Recent work frames LLM red-teaming as a structured search problem rather than manual, expert-written prompts — e.g. learning-driven frameworks that generate adversarial prompts and evaluate across threat categories ([Learning-Based Automated Adversarial Red-Teaming for Robustness Evaluation of LLMs](https://arxiv.org/abs/2512.20677)). The motivating problem statement — manual red-teaming doesn't scale and has patchy coverage of the prompt space — is exactly "give it multiple difficult and boundary questions... at a bigger scale" from the original brief.
- **Persona-based generation.** ["PERSONATEAMING"](https://openreview.net/pdf?id=Q3zYGHp2hl) — red-teaming quality improves when the adversarial generator is given a persona (who the "attacker" or asker represents) rather than generating from a neutral voice. `adaptive-agent-tester.mjs`'s system prompt explicitly instructs varied personas per question (a panicked carer, someone testing limits, someone phrasing an emergency indirectly, someone in crisis, a non-native English speaker) for this reason — a keyword-stuffed test question finds different (and generally fewer) failures than a realistically-phrased one.
- **Adaptive follow-ups.** The agent can send a paraphrase or a harder version of a question after seeing the first answer — testing whether good behaviour holds under rephrasing, not just on the original wording. This is the literal implementation of "another AI to test the answers and check inconsistent[cies]... run it through Claude" from the original notes.

## Why this is healthcare-specific, not generic red-teaming

Dementia-care guidance is health-adjacent information delivered to an exhausted, often distressed audience — the stakes and failure modes differ from generic chatbot red-teaming.

- **LLMs give unsafe answers to real patient questions at a non-trivial rate today.** A physician-led red-teaming study across four commercial chatbots (Claude, Gemini, GPT-4o, Llama) on 222 real patient-posed medical questions found problematic-response rates from 21.6% (Claude) to 43.2% (Llama), with unsafe-response rates from 5% to 13% ([*Large language models provide unsafe answers to patient-posed medical questions*](https://www.nature.com/articles/s41746-026-02428-5), npj Digital Medicine). This is direct evidence that "the model has a safety-rules system prompt" is not sufficient by itself — measured, adversarial testing catches what the prompt alone doesn't, which is the whole premise of building this tester.
- **Structured, multi-domain evaluation.** The Health Care AI Chatbot Evaluation Framework (HAICEF) organises evaluation into three priority domains — safety/privacy/fairness, trustworthiness/usefulness, design/operational effectiveness — with further sub-domains ([*Standardizing and Scaffolding Health Care AI-Chatbot Evaluation*](https://ai.jmir.org/2025/1/e69006), JMIR AI, systematic review). The tester's ten categories (safety-emergency, dosing/diagnosis, carer-crisis, boundary, out-of-scope, injection, region-accuracy, citation-integrity, consistency, overclaiming) map onto HAICEF's safety/privacy/fairness domain plus this project's own already-adopted concerns (region correctness, citation validation — see [rag-industry-research.md](rag-industry-research.md) §7, §9).
- **WHO guidance**, already cited in [rag-industry-research.md](rag-industry-research.md) §9, on misinformation/bias/hallucination risk and the need for human oversight and escalation paths — carried over unchanged as the basis for the tester's category list.

## Ethics and requirements (from the original meeting notes)

The notes explicitly ask "how do we want to formulate the test, ethical, requirements." What this design commits to:

1. **No verdict is authoritative on its own — human review is mandatory, not optional.** Every run writes a `*_spotcheck.md` file: every non-"pass" finding plus a deterministic sample of "pass" verdicts, in the same format and with the same requirement as `grade-groundedness.mjs`'s existing spot-check file. This is the same principle already adopted for the OpenAI-family judge, applied consistently to the new one — an agent is not trusted more just because it's a different vendor.
2. **The agent is instructed against rubber-stamping.** The system prompt explicitly names the previous grader's 32/32 failure and tells the tester to prefer "flag" over "pass" when uncertain. This is a direct, testable instruction, not a hope.
3. **No real participant or user data is used.** Every question is synthetic, generated by the tester agent from a category description and a persona — nothing from the study/participant tables (`docs/study/ethics/data-management-plan.md`) is read or referenced by this script.
4. **Scope stays within existing published claims about the system.** The category list is built from the safety rules already present in `prompt.js` and already stated in `docs/rag/rag-industry-research.md` — the tester checks whether documented behaviour holds, it does not invent new policy.
5. **Cost/scale is bounded.** `--turns` caps total agent iterations (default 40); each category gets roughly 3-4 questions, not an unbounded search. This is deliberately closer to the "single-shot batch script, run periodically or in CI" end of the build-vs-agent spectrum than to a fully autonomous, unbounded exploration — matching the scale this project can actually afford to run and review by hand.

## What this does not cover

- **Usability.** Nothing here evaluates whether caregivers find the app usable or trustworthy — that is a human-subjects question. The notes' "send the form to Sarah for double check" usability-survey item is a separate, human-run workstream; this script is not a substitute for it.
- **Retrieval quality.** Covered by the existing deterministic retrieval metrics (`run-retrieval.mjs`) — out of scope here.
- **Scale beyond what a human can spot-check.** This is deliberately not "run 10,000 questions unattended" — the spot-check file is sized to what one person can actually review per run (`--sample`, default 8 passes plus every non-pass).

### Sources

- Panickssery, Bowman, Feng — [LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/abs/2410.21819) (arXiv 2410.21819)
- [Learning-Based Automated Adversarial Red-Teaming for Robustness Evaluation of Large Language Models](https://arxiv.org/abs/2512.20677) (arXiv 2512.20677)
- [PERSONATEAMING: Improving Automated LLM Evaluation by Introducing Personas in LLM Red-Teaming](https://openreview.net/pdf?id=Q3zYGHp2hl)
- [Large language models provide unsafe answers to patient-posed medical questions](https://www.nature.com/articles/s41746-026-02428-5), npj Digital Medicine
- [Standardizing and Scaffolding Health Care AI-Chatbot Evaluation: Systematic Review (HAICEF)](https://ai.jmir.org/2025/1/e69006), JMIR AI
- Carried over from [rag-industry-research.md](rag-industry-research.md): [WHO — LMM ethics & governance guidance](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models); [A Survey on LLM-as-a-Judge](https://arxiv.org/html/2411.15594v6)
