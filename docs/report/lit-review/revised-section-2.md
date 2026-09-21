# Revised Section 2 — Project Scope and Objectives

Drafted 2026-09-21 to replace §2 of the April submission
([`literature-review.md`](literature-review.md)) in the final report. Every research
question below is answerable from an artefact already committed to this repository;
the "Evidence" column is not part of the report text — it is the audit trail, and is
reproduced in §*Evidence map* at the end.

Markdown is the source of truth; paste into the Canvas template when the report is
assembled (Times New Roman 12 pt, double-spaced, per the handbook). One structural
fix to carry across: all of §2.1–§2.5 should sit at the **same heading level** — the
April document put §2.1 at Heading 2 and §2.2–§2.5 at Heading 3 within the same
section.

**Two consequential changes**, both flagged in [`alignment.md`](alignment.md):

1. **Personalisation is removed as a research question and named as an explicit
   scope exclusion.** It was never evaluated — the answer-quality matrix is a
   prompt/retrieval ablation with no personalisation condition — so it cannot be a
   question the report answers. What exists (caregiver framing, tone, response
   length, all user-set) is stated as implemented-but-unevaluated.
2. **RQ7 (usability) is conditional on the user study producing data.** If you
   decide the study will not run, delete RQ7 and Objective 8, and the corresponding
   sentence in §2.4; usability then moves to Future Work. Nothing else depends on it.

---

## 2. PROJECT SCOPE AND OBJECTIVES

### 2.1 Research Problem

Dementia care generates a constant demand for practical information — about
behaviour, safety, services, entitlements and the caregiver's own wellbeing — and
that information is dispersed across government pages, charity leaflets, clinical
guidance and international material of uneven applicability. The literature reviewed
in Section 3 shows three recurring failures: digital resource systems are fragmented
and static (Meiland et al., 2017; Hopwood et al., 2018); conversational agents
improve access but are weakly validated and prone to unreliable content in
health settings (Laranjo et al., 2018); and avatar-based agents, although promising
for engagement, have been evaluated in dementia care almost exclusively for
short-term usability rather than for what they actually say (Rampioni et al., 2021;
Stara et al., 2021).

Underneath all three sits a problem specific to generative systems and largely
absent from that literature: a language model asked a dementia-care question will
answer fluently whether or not it has any grounds to, and will answer in the idiom of
whatever it was trained on. For a New Zealand caregiver that is not an abstract
risk — it is the difference between being told to call 111 and being told to call
000, and between being given Dementia New Zealand and being given an Australian
helpline. A caregiver cannot be expected to audit the answer; the system has to be
built so the answer is grounded, and it has to be measured to show that it is.

A second problem is who the system is for. Voice interaction is the main argument
for an avatar-based interface in this domain, and people living with dementia are
precisely the population whose speech automatic recognition handles worst. A system
that claims accessibility through speech owes a measurement of how well that speech
path works for them.

This project therefore addresses the research problem:

> **How can an avatar-based conversational assistant deliver dementia-care
> information that is accurate, safe and specific to the New Zealand context, and how
> robustly does it serve the caregivers and people living with dementia it is built
> for?**

### 2.2 Research Questions

**RQ1.** What are the limitations of existing digital resource systems,
conversational agents and avatar-based interfaces for dementia care, and where does a
grounded, locally-specific assistant sit relative to them?

**RQ2.** Does retrieval from a curated New Zealand dementia-care corpus improve the
factual correctness and groundedness of a conversational assistant's answers,
relative to the same model answering without retrieval?

**RQ3.** What is prompt design responsible for, and what is retrieval responsible
for, in the system's handling of emergency, medication and out-of-scope requests?

**RQ4.** Can the avatar be driven with articulation accurate enough, and the spoken
pipeline made responsive enough, for real-time conversational use?

**RQ5.** How accurately does the system's speech recognition transcribe the speech of
people living with dementia compared with control speakers, and how do those errors
propagate into retrieval and into the answer the user receives?

**RQ6.** Is the delivered system verifiable against its functional requirements, and
what are its capacity limits and its cost of operation?

**RQ7.** *(Reported only if the usability study yields analysable data; see §2.4.)*
How do caregivers rate the usability and usefulness of the assistant, and does the
avatar condition differ from a text-only condition?

RQ1 is answered by the literature review. RQ2–RQ6 are answered by an evaluation
programme of measurements on benchmarks built for this project and on a standard
clinical speech corpus. RQ7 is answered by a study with human participants under
ethics approval.

### 2.3 Research Aim and Objectives

The aim of this research is to **design, build and empirically evaluate an
avatar-based conversational assistant that gives dementia caregivers accurate, safe
and jurisdictionally correct information, and to establish where such a system
succeeds and where it fails.** The emphasis is deliberately on evaluation: building a
plausible-sounding assistant in this domain is not difficult, and demonstrating that
one is trustworthy is the harder and more useful contribution.

The following objectives give effect to that aim:

1. Review existing digital resource systems, conversational agents and avatar-based
   interfaces in dementia care, and identify where they fall short.
2. Design and implement a retrieval-grounded conversational assistant over a curated
   New Zealand dementia-care corpus, with an explicit safety layer, a streaming voice
   pipeline and a lip-synced avatar, on both a mobile and a web client.
3. Construct a labelled retrieval benchmark and a held-out, clinically reviewed
   safety benchmark, and measure retrieval quality against them.
4. Measure the contribution of retrieval to answer correctness and groundedness by
   ablation against an ungrounded baseline, and the contribution of prompt design by
   ablation across prompt generations and the safety block.
5. Measure the avatar's articulation accuracy against acceptance criteria, and the
   end-to-end responsiveness of the spoken pipeline.
6. Measure speech-recognition accuracy on the speech of people living with dementia
   using a standard clinical corpus, and trace the resulting errors through retrieval
   to answer quality.
7. Verify the delivered system against its functional requirements, and characterise
   its capacity limits and cost of operation.
8. *(Conditional on RQ7.)* Evaluate usability and perceived usefulness with
   caregivers in an ethics-approved study.

### 2.4 Scope

**In scope.** The project covers the design, implementation and evaluation of a
working prototype: a React Native mobile application and a web application, both
serving a retrieval-augmented conversational assistant over a curated New
Zealand dementia-care corpus, with a streaming voice pipeline and a
Unity-rendered, lip-synced avatar. It covers the evaluation programme described in
Section 5: retrieval quality, answer quality and safety under ablation, latency,
avatar articulation, speech recognition on dementia speech, functional
verification, scalability and cost.

**Data used.** Three kinds of data are used, each under stated conditions.
(i) The knowledge corpus is curated, publicly available New Zealand dementia-care
material together with the World Health Organization *iSupport for Dementia*
programme. (ii) Speech-recognition accuracy is measured on **DementiaBank
ADReSS-2020**, a de-identified clinical speech corpus of 156 speakers accessed under
TalkBank membership; only aggregate error rates are reported, and no audio,
transcript or hypothesis is redistributed, in accordance with the TalkBank Ground
Rules. (iii) The usability study collects data from human participants under
University of Auckland Human Participants Ethics Committee approval, with
participants living with dementia taking part under additional safeguards and
reported separately.

**Out of scope.** The project does **not**:

- perform dementia detection, screening, diagnosis or triage, and makes no
  diagnostic claim of any kind;
- give clinical decision support, state medication doses, or substitute for
  professional advice — the system is explicitly designed and measured to refuse
  these;
- deploy into a healthcare service, integrate with any clinical system, or use
  patient records; the prototype is publicly reachable for evaluation only;
- claim any care outcome — reduced caregiver burden, improved wellbeing or changed
  care behaviour are outside what a project of this length can establish, and are not
  asserted anywhere in this report;
- evaluate adaptive or learned personalisation. User-configurable response style,
  conversational tone and caregiver framing are implemented, but no
  personalisation condition was evaluated and no claim is made for them; adaptive
  personalisation is identified as future work;
- train or fine-tune any model. All language, speech and synthesis models are used
  as supplied by their providers, and the contribution lies in the retrieval,
  grounding, safety and evaluation layers around them.

**Conditional scope.** The usability study (RQ7, Objective 8) is designed,
ethically approved and piloted. If sufficient participant data is not collected
within the project timeline, the study is reported as designed-and-piloted, its
instruments and protocol are presented as a contribution in their own right, and all
usability and engagement claims are withheld. No result is reported from pilot
sessions, which exist to debug the protocol.

**Scope summary**

| In scope | Out of scope |
|---|---|
| Retrieval-grounded conversational assistant over a curated NZ corpus | Dementia detection, screening or diagnosis |
| Explicit safety layer with New Zealand escalation | Clinical decision support or medication dosing |
| Streaming voice pipeline and lip-synced avatar (mobile and web) | Deployment in a healthcare service; patient records |
| Measurement of retrieval, answer quality, safety, latency, articulation | Claims about care outcomes or caregiver burden |
| Speech recognition accuracy on a clinical dementia speech corpus | Adaptive or learned personalisation |
| Functional verification, scalability and cost of operation | Training or fine-tuning of any model |
| Usability study with caregivers *(conditional)* | Longitudinal or clinical validation |

### 2.5 Significance

The significance of this work is not that an avatar-based dementia assistant can be
built — the components are available and industry systems demonstrate the pattern —
but that one can be **measured**. The project's contribution is an evaluation
programme that treats a generative assistant as a system to be verified rather than
demonstrated: a labelled retrieval benchmark, a clinically reviewed safety benchmark
held out from development, ablations that separate what retrieval contributes from
what prompt design contributes, and a measurement of the speech path on the
population the system claims to serve. That last measurement, to the best of the
review in Section 3, has not previously been reported for a deployed consumer
speech-recognition stack in this setting.

The practical significance is jurisdictional. Generic health assistants answer in
the idiom of their training data; this project demonstrates, under measurement, a
prompt generation that served Australian emergency numbers and services to New
Zealand users, and the design change that eliminated it. For any team deploying a
health assistant outside the United States, that failure mode and its remedy are the
transferable result.

---

## Evidence map (not part of the report text)

| RQ | Answered by | Key committed evidence |
|---|---|---|
| RQ1 | Literature review §3 | `literature-review.md`; additions listed in `alignment.md` §4 |
| RQ2 | E1, E2 | Retrieval recall@5 0.970 single-label / 0.835 pooled, precision@5 0.836, MRR 0.960 (`results-2026-09-13.md` §1). No-RAG correctness 1.54 vs 2.00, p < 0.0001, r = 1.0; groundedness and helpfulness deficits hold under Holm correction (§2.3) |
| RQ3 | E2, E3 | Safety block: 111 in first sentence 95.6 % vs 0 %; 6 dose statements vs 0 of 390; judged safety 1.84 vs 1.91, p = 0.029 adj. Prompt generation: held-out safety v2 41/41, v1 26/41, p0 27/41; 131 Australian service mentions and 27 foreign emergency numbers under v1, 0 under v2. **Retrieval is not what makes it safe** — no-RAG scores 40/41 and judged safety p = 0.64 (§2.1–2.3) |
| RQ4 | E4, E5 | Lip-sync 95/95 acceptance checks for both characters on the current runtime vs 37/85 for the legacy keyframe track; G2P ablation (§4). Latency: stage benchmark (embedding 186 ms, retrieval 543 ms, first token 584 ms median) and browser typed turns TTFT median 3,040 ms, n = 30 (§3). Spoken, iPhone and ablation cells outstanding |
| RQ5 | E9 | `results-e9-stt-2026-09-18.md`: `whisper-1` pooled WER 26.3 % control / 41.9 % dementia with pauses, 31.4 % / 44.7 % endpointed; p < 0.001, Cliff's δ = 0.31; ρ(WER, MMSE) = −0.23. Four recognisers compared. Downstream: disfluency alone costs nothing; at the production model's dementia-speaker error rate MRR falls 0.83 → 0.74 and citation density −30 %, with no unsafe output at any level (§5) |
| RQ6 | E10, E11, E12 | 38 functional requirements, 30 verified by automated test or CI-gated evaluation, 2 explicitly not verified (`functional-verification.md`); coverage over 57 test files / 502 cases. Binding constraint is ElevenLabs TTS concurrency, then the OpenAI TPM tier; Supabase saturates ≈ 50 req/s, far above both (`scalability.md`). Typed turn US$0.0081, spoken turn US$0.104 at plan rate — 12.8× — dominated by speech synthesis (`cost_ff2753e.md`) |
| RQ7 | E7 *(conditional)* | Protocol and UAHPEC pack in `docs/study/`; **no analysable participant data exists as at 2026-09-21** |

## Also change elsewhere in the document

The old research question appears twice outside §2 and must be replaced with the
wording in §2.1 above:

- **§1 Introduction, paragraph 4** — "This project addresses the research question:
  How can an AI-powered avatar-based interface improve the accessibility,
  personalisation, and usability of digital resource management systems for dementia
  care?"
- **Title** — "AN AVATAR-BASED DIGITAL RESOURCE MANAGEMENT SYSTEM FOR DEMENTIA CARE"
  describes the April framing. Consider: *"DementiaGuide AI: building and evaluating a
  retrieval-grounded avatar assistant for dementia care"*.
- **§3.10 Contribution** and **§3.9 Research Gaps** — rewritten once the literature
  additions in `alignment.md` §4 are in place; the gap the project filled is
  grounding, safety and speech robustness, not integration and personalisation.
