# 2 Literature Review

<!-- TEMPLATE: Budget ≈1,700 words (≈2.8 pp + 0.6 pp gap table). Counted.

Rubric **A** (10 %) band A:
- "retrieval and assessment of the relevant literature";
- "clear and insightful connections across the field";
- "strong evaluation of relevance and implications of prior work".
Also feeds **B** (the gap in §2.7 → RQs) and **C** ("synthesis of theory, methods, and
procedures"; §2.6 is what Ch 4 cites to justify its design).

Canvas guidance ("Report writing: Literature review", "Synthesis"): organise by theme, not by
paper. Each subsection ends with what it means for *this* project. Descriptive summaries score C.

Starting material:
- April review `docs/report/lit-review/literature-review.md` §3.1–3.10. §3.2–3.8 are reusable in
  substance per `docs/report/lit-review/alignment.md` §5 — **rework, don't paste** (Turnitin
  self-similarity).
- Vault synthesis: Nexus `08 University/2026 S2/COMPSYS ELECTENG SOFTENG 700AB/Resources/
  Systematic Review - AI resource tools for dementia care.md`, a six-step argument over 15 linked `07 Sources/`
  notes (the WHO 2024 LMM-ethics note is not linked from it).
- Missing literature: `docs/report/lit-review/alignment.md` §4.

Status by subsection:
- §2.1–2.2: redraft (sources exist).
- §2.3–2.6: **write — no primary source is in hand yet** (see 08-references.md "Needed").

Cut rule if over budget: shorten §2.1–2.2 before §2.3–2.6. The new subsections are what the
results are compared against (rubric D "comparison with literature"). -->

<!-- TEMPLATE: Opening paragraph, ≈60 words. How the literature was found: databases, search
terms, inclusion window, and that the review was extended after April to cover grounding,
safety, speech and evaluation. Condense April §3.1. This is the "retrieval and assessment"
evidence for rubric A. -->

TODO(redraft: from `docs/report/lit-review/literature-review.md` §3.1)

## 2.1 Dementia care and the carer's information problem

<!-- TEMPLATE: ≈250 words. Argument, following the vault synthesis steps 1–4:
- carers carry the burden;
- navigation, not content, is the bottleneck;
- digital tools succeed or fail on usability;
- static self-guided delivery (iSupport) has mixed trial results. This motivates an interactive,
  answer-giving system rather than another library.
Reuse April §3.2–3.3.
Citations in hand:
- [@sorrentino2025], [@zhai2023], [@monnet2024], [@windle2024], [@brijnath2026],
  [@who-isupport2019];
- [@hopwood2018], [@meiland2017], [@span2013], [@peek2014], [@sohn2023].
Implication for this project: the corpus is iSupport plus NZ services (connects to Ch 3/4). -->

TODO(redraft: April §3.2–3.3 + vault synthesis)

## 2.2 Conversational and embodied agents in dementia care

<!-- TEMPLATE: ≈320 words. Vault synthesis step 5: conversational AI improves access but is
weakly validated; embodied agents are evaluated mainly for short-term usability rather than
content accuracy. April §3.6 already does this critically — keep that stance.
Include ≈60 words on **visual speech and co-articulation**: why lip-sync accuracy matters for an
avatar, and the co-articulation model the engine follows. This is what E5 (§5.3) is compared
against.
Include ≈60 words on **conversational latency norms**: how long a gap in human turn-taking is,
and what delay users tolerate from a voice assistant. E4 had no pre-specified threshold, so
this literature is the only yardstick for the "responsive enough" half of RQ4 (see §4.5, §6.1).
Source needed: 08-references.md "Needed — §2.2 latency".
Both insertions fit inside this subsection's 320 words; shorten the April-derived material to
make room.
Personalisation (April §3.7) shrinks to one sentence here, or moves to Future Work, because it is
out of scope.
Citations in hand:
- [@laranjo2018], [@aggarwal2023], [@xie2020], [@lima2022], [@lima2023];
- [@rampioni2021], [@stara2021], [@chattopadhyay2020], [@tanaka2017], [@bickmore2005];
- [@shi2026], [@cohenmassaro1993].
Commercial systems (April §3.8: Ella, NVIDIA ACE, etc.) belong in the §2.7 gap table rather than
in prose. -->

TODO(redraft: April §3.4–3.6, §3.8)

## 2.3 Retrieval-augmented generation and grounding in health information

<!-- TEMPLATE: ≈240 words. **New.**
Content:
- what RAG is and why it is used (grounding, updatability, attribution);
- hallucination and factuality in health LLMs;
- how citation/attribution quality is assessed;
- known failure modes: lost-in-the-middle, retrieval misses.
This justifies RQ2, and the E1/E2 design in Ch 4, and is the comparison point for §6.1 RQ2.
Citations: [@liu2024lostmiddle] is in hand (vault note "RAG and Health-AI Engineering").
Needed: see 08-references.md "Needed — §2.3". -->

TODO(write: blocked on sources — 08-references.md "Needed — §2.3")

## 2.4 Safety, escalation and jurisdiction in health chatbots

<!-- TEMPLATE: ≈210 words. **New.**
Content:
- documented harms from health chatbots: unsafe advice, dosing, missed escalation;
- governance guidance;
- **health information is jurisdiction-bound** (emergency numbers, services, entitlements). The
  literature rarely addresses this; the project's v1 prompt served Australian services to NZ
  users (the "why this mattered" story; `docs/report/lit-review/alignment.md` §4).
This justifies RQ3 and E3.
Citations in hand: [@who-lmm-ethics2024], [@sani2025], [@nz-dementia-services].
Needed: empirical health-chatbot safety evaluations — see 08-references.md. -->

TODO(write: partly blocked on sources)

## 2.5 Speech recognition for older and impaired speech

<!-- TEMPLATE: ≈220 words. **New.**
Content:
- ASR accuracy degrades on older, disordered and dementia speech;
- the ADReSS-2020 challenge corpus and its baselines;
- the Whisper model family, and its documented tendency to hallucinate stock phrases on silence
  and pauses. Claim only this: stock-phrase hallucination on dementia utterances is what survived
  on the production model. The runaway repetition loops seen in E9 came from the 8-bit local
  proxy, not from `whisper-1` (`docs/eval/results-e9-stt-2026-09-18.md` §3.1, §4).
- Published WER on ADReSS is the **comparison point for E9** (rubric D). **Priority one source:**
  the published Whisper-large figure of about 30 % WER. `docs/eval/evaluation-plan.md` §17.1
  places it on the **ADReSS-M** variant, not ADReSS-2020. `docs/eval/results-e9-stt-2026-09-18.md`
  mentions it without a citation. Find and cite its primary source, and state the corpus
  mismatch in any §6.1 comparison.
This justifies RQ5, the choice of ADReSS (Ch 4 data), and the two input conditions (with-pauses vs within-utterance energy-VAD trimming).
Citations in hand: none. Needed: see 08-references.md "Needed — §2.5". -->

TODO(write: blocked on sources — 08-references.md "Needed — §2.5")

## 2.6 Evaluating LLM-based systems

<!-- TEMPLATE: ≈200 words. **New.** The literature underneath the methodology (rubric C):
- LLM-as-judge validity and its known biases (position, verbosity, self-preference), and why a
  judge needs human agreement before absolute scores can be trusted. This is the κ gate.
- Inter-rater agreement (κ; its behaviour under skewed labels, which explains the low E1 κ).
- Retrieval metrics (recall@k, MRR, nDCG).
- SUS and its norms (the 68 benchmark used in `docs/study/protocol.md` §7.1).
Citations in hand: none as primaries (vault concept note "LLM-as-a-judge evaluation" has
pointers only). Needed: see 08-references.md "Needed — §2.6". -->

TODO(write: blocked on sources — 08-references.md "Needed — §2.6")

## 2.7 Synthesis: the gap this project addresses

<!-- TEMPLATE: ≈200 words + **Table 2.1** (gap table; see figures-and-tables.md T2).
This answers **RQ1**, so §6.1 RQ1 points back here.
- Rows: representative existing systems and study types, drawn from §2.1–2.6 (e.g. iSupport
  online, Anne ECA, generic health chatbots, commercial avatar platforms, RAG health assistants
  in the literature).
- Columns: grounded in curated sources · jurisdiction-specific (NZ) · explicit safety
  escalation · voice · embodied avatar · evaluated for content accuracy · evaluated on impaired
  speech.
- Each cell is ✓ / ✗ / partial, with a citation.
- The prose states the gap as **grounding, safety and speech robustness, measured** — not
  "integration and personalisation" (the April §3.9 framing, now superseded; see
  `docs/report/lit-review/alignment.md` §5). End by pointing at RQ2–RQ7. -->

TODO(write: after §2.1–2.6)
