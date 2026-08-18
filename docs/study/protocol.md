# Usability Study Protocol — DementiaGuide AI

**Version 1.0 · 18 August 2026**
**Investigator:** Richman Tan · **Supervisor:** Assoc. Prof. Jing Sun · **Project partner:** JooHyun Kang
> ## ⚠ Reconcile this against the approved protocol before use
>
> **UAHPEC approval for this study already exists.** These documents were written
> independently, before that was known, so where they differ from the approved
> protocol **the approved one governs** — task wording, sample sizes, measures and
> procedure all need checking line by line, not skimming.
>
> Separately, the move to server-held credentials materially changes what
> participants consent to (two new overseas processors; conversations stored
> server-side). That is an **amendment** to an approved protocol, not a free
> change. See `ethics/amendment-request.md`.
>
> Until both are done, treat this file as a working draft, not as the governing
> protocol.

This document expands `docs/report/700b_evaluation_plan.md` §1 into a runnable
protocol. It is written so its sections can be lifted directly into the UAHPEC
application; see `ethics/uahpec-application-notes.md` for the mapping.

---

## 1. Background and rationale

The mid-year technical report established that two enabling components work:
avatar articulation (37/85 → 95/95 automated checks) and retrieval grounding and
safety (28/36 → 36/36 safety assertions; recall@5 0.969; 133/133 valid citations).
None of that evidence speaks to the research question.

> **Research question.** How can an AI-powered avatar-based interface improve the
> accessibility, personalisation, and usability of digital resource management
> systems for dementia care?

Accessibility, personalisation and usability are properties of a human
interaction, and no human has yet used the system under observation. This study
supplies that evidence and addresses objective O5 and sub-questions SQ1, SQ4 and
SQ5.

**Why this comparison matters.** Static dementia-care information already exists
and is not, on its own, sufficient: large trials of WHO's own self-guided iSupport
programme did not significantly reduce carer burden (Lancet Reg Health Eur 2024;
Age & Ageing 2026). The project's bet is that changing the *delivery* — a
conversational avatar over the same content — is what moves the needle. That bet
is only testable by comparing delivery modes over an identical knowledge base,
which is exactly what the two arms below do.

**Precedent for remote, self-directed use.** A JMIR mHealth (2021) usability study
of the embodied conversational agent "Anne" found that people with dementia and
their caregivers could use an ECA independently at home. A companion thematic
analysis of seven studies found good engagement but efficacy not yet established —
which is the gap this study addresses, and the reason the claims below are framed
as usability rather than efficacy.

---

## 2. Design

**Within-subjects, counterbalanced, two arms.** Both arms query the same Supabase
knowledge base (551 chunks) through the same retrieval and generation pipeline.
The only difference is the delivery interface.

| Arm | Interface | Input | Output | Route |
|---|---|---|---|---|
| **A — avatar** | Voice conversation with the Unity 3D avatar — Aaron, the deployed default | Speech | Spoken, lip-synced, with captions | `/app/voice` |
| **B — text baseline** | Text chat, no avatar, no voice | Typing | Streamed text with inline citations | `/app/chat` |

Holding the knowledge base and the prompt constant is what makes the comparison
attributable to the interface rather than to answer quality.

### 2.1 Assignment and counterbalancing

Order effects are controlled by a deterministic Latin square on the participant
number. Deterministic assignment is preferred over randomisation at n < 20: it
guarantees balanced cells at small n and is auditable after the fact.

| Participant no. mod 4 | First | Second |
|---|---|---|
| 1 | Arm A, Task Set 1 | Arm B, Task Set 2 |
| 2 | Arm B, Task Set 1 | Arm A, Task Set 2 |
| 3 | Arm A, Task Set 2 | Arm B, Task Set 1 |
| 0 | Arm B, Task Set 2 | Arm A, Task Set 1 |

This crosses arm order with task-set order, so neither a learning effect nor an
easier task set can be confounded with the arm.

### 2.2 Mode of participation

Sessions are **unmoderated and remote**: participants follow a link to
`https://dementiaguide-web.vercel.app/#/study`, work through the tasks in their own
time and environment, and the application itself delivers information, consent,
tasks, timing and questionnaires. Expected duration 35–45 minutes; participants may
pause between arms.

**Exception — participants living with dementia.** This group participates in a
**supported** remote session with a family member or support person present, using
a shortened task set (one task per arm), and contributes qualitative accessibility
data only. Rationale in §3.3.

---

## 3. Participants

### 3.1 Sample

| Group | Target n | Mode | Contributes |
|---|---|---|---|
| Family caregivers of a person with dementia | 8–12 | Unmoderated remote | Primary comparison |
| Healthcare / aged-care support workers | 4–6 | Unmoderated remote | Role contrast for the personalisation question |
| People living with dementia (early stage) | 3–5 | Supported remote, shortened | Qualitative accessibility only — **not pooled** into the comparison |
| Proxy pilot participants (peers/students) | 3–5 | Unmoderated | Protocol debugging. **Not research data; not reported.** |

Eight participants is the conventional point at which a usability study surfaces
most discoverable issues; the upper bounds strengthen the paired comparison
without extending recruitment beyond the project timeline.

### 3.2 Eligibility

**Include:** 18 years or older; sufficient English to read the task cards and
converse; access to a device with a microphone, a working internet connection and
Chrome or Edge; and one of — currently or recently providing unpaid care to a
person with dementia (caregiver group), currently working in dementia or aged care
(worker group), or a diagnosis of early-stage dementia with capacity to consent
(PLWD group).

**Exclude:** anyone for whom taking part is likely to cause distress
disproportionate to the benefit, in the judgement of the referring service; anyone
in acute crisis; anyone unable to give informed consent (see §3.3).

### 3.3 Participants living with dementia — additional safeguards

Recruiting people living with dementia into an *unmoderated* remote study raises
three issues that the safeguards below address directly. This section exists
because the risks are real, not because the group should be excluded — their
perspective is directly relevant to an accessibility claim.

| Risk | Safeguard | Implemented as |
|---|---|---|
| Capacity to consent may fluctuate | Consent is confirmed by the support person at the start and re-checked before the second arm. Process consent, not a one-off signature. | A pause screen between the arms offering "Finish here" as an equally-weighted choice; records a `consent_rechecked` event |
| No one present if the participant becomes confused or distressed | A support person of the participant's choosing must be present for the whole session. | Setup will not start the session until attendance is confirmed |
| No way to confirm who is actually using the app | The support person confirms attendance in the session record. | Stored on `study_sessions` |
| Fatigue and cognitive load | Shortened protocol: one task per arm, SUS omitted, replaced by three plain-language questions, and a one-question debrief. | Separate `PLWD_TASKS`, `PLWD_ITEMS` and `PLWD_DEBRIEF` |

This group's data is reported separately and descriptively. It is not combined
with the caregiver comparison, because the protocol they complete is different.

### 3.4 Recruitment

Through the project partner's networks, Alzheimers NZ and Dementia NZ regional
services, and University of Auckland channels for the worker group. Materials in
`ethics/recruitment-email.md` and `ethics/recruitment-flyer.md`. No participant is
approached directly by the investigator without the referring service's involvement.

Participants receive an **access code** with the study link. It authorises the
application's API usage and nothing else — it carries no identity, and the same
code may be held by more than one participant.

Identification is by **participant code**, which the application allocates at the
start of a session and displays to the participant to keep. It is allocated
rather than issued in advance because the study link is passed on rather than
addressed individually, so no one is assigning numbers by hand; two participants
choosing the same number would otherwise be recorded as a single session. The
participant code is the only key in the dataset, and no name is collected.

---

## 4. Tasks

Six resource-finding tasks, three per arm, in `tasks.md` with the participant-facing
wording and the scoring rubric. Each is presented as a **situation**, never as the
question to ask — formulating the query is part of what is being measured.

The two sets are matched by category so that neither arm draws the easier set:

| | Behaviour management | Safety | Services and support |
|---|---|---|---|
| **Set 1** | Evening agitation | Night-time waking and wandering | Respite options |
| **Set 2** | Repeated questions | Bathroom falls | When to consider residential care |

All six are drawn from the labelled evaluation set in `scripts/eval/questions.js`,
so the expected knowledge-base chunk for each is already known and each task's
rubric can be written against verified content rather than the investigator's
impression of a good answer.

---

## 5. Measures

### 5.1 Effectiveness

- **Task success** — complete / partial / failed, scored after the session against
  a rubric of 3–4 key points per task (`tasks.md` §2). Complete = at least three of
  four key points present in the answers the participant received and stopped on.
- **Self-reported success** — "Did you find what you needed?" (yes / partly / no),
  captured in-app at the end of each task. Reported alongside, never instead of,
  the rubric score: the two disagreeing is itself a finding.

### 5.2 Efficiency

- **Time on task** — from "Start task" to "I found my answer" / "I couldn't find
  it", recorded by the application.
- **Turns** — number of participant utterances or messages within the task window.

### 5.3 Usability and satisfaction

- **System Usability Scale**, once per arm (10 items, standard wording).
- **Four Likert items per arm** (1–5): trust, engagement, helpfulness, clarity.

### 5.4 Accessibility and personalisation (qualitative)

Five free-text debrief questions on clarity, cognitive load, whether responses felt
tailored to their role, and which interface they would choose and why. Full wording
in `instruments.md`.

### 5.5 Technical measures (automatic)

Stage latencies (`stt_ms`, `rag_ms`, `llm_to_token_ms`, `first_sentence_ms`,
`tts_first_ms`, `to_first_audio_ms`), error and fallback events (Web Speech vs
Whisper, ElevenLabs vs OpenAI TTS, empty retrieval, avatar load failure), browser,
operating system, and **which avatar renderer the participant actually got**.
These field names match those already parsed by `scripts/parse-latency.mjs`.

The renderer is recorded rather than assumed. Unity is the deployed default, but
the app degrades to the Three.js avatar on its own if the build fails to load, and
a session that ran on the fallback is not comparable to one that ran on Unity.

This also discharges item 2 of `docs/report/700b_evaluation_plan.md` — the latency
dataset — from real sessions rather than a scripted run.

---

## 6. Procedure

1. Invitation with the study link and the access code.
2. **Landing** — what the study is, how long it takes, what is recorded.
3. **Participant Information Sheet**, on screen and downloadable.
4. **Group** — asked before consent, because the two groups consent differently.
5. **Consent** — for the unmoderated groups, itemised tick boxes matching the
   numbered items on the approved form, plus a separate tick for transcript
   retention. Participants living with dementia instead confirm that the paper
   form has already been read and signed with their support person; the app does
   not re-collect that consent on screen. No progress without consent; declining
   ends the session cleanly.
6. **Browser and microphone check** — Chrome/Edge confirmation and a microphone
   permission test before any task.
7. **Participant code shown** — allocated at session start and displayed with an
   instruction to keep it. It is the only handle on their data, so it is what a
   withdrawal request must quote.
8. **Background questions** — group, age band, self-rated confidence with
   technology, prior use of AI assistants.
9. **Arm 1** — one-screen briefing, three tasks, then SUS and the four Likert items.
10. **Arm 2** — same structure, other interface, other task set.
11. **Debrief** — five free-text questions.
12. **Close** — thank-you, support numbers, contact details for questions or
    withdrawal.

A persistent **"I need to stop"** control is available on every screen. It ends the
session, records nothing further, and displays the support numbers in §8.

---

## 7. Analysis

Pre-specified in `analysis-plan.md`. In summary, and consistent with the reporting
discipline already enforced in `docs/rag/rag-evaluation-plan.md`:

- Report **counts and medians, never percentages**, at n < 20.
- Non-parametric paired comparison (Wilcoxon signed-rank) on time on task and SUS
  **only if** n and the distribution justify it; otherwise report descriptively.
- The word "significant" appears only if a test was run and met.
- The PLWD group is reported separately and thematically.

### 7.1 Pre-registered success criteria

Declared before data collection. Recorded honestly whether met or not.

| Criterion | Operationalisation |
|---|---|
| Usability > 4/5 | SUS ≥ 68 on Arm A, and mean Likert ≥ 4 on Arm A |
| ≥ 30 % reduction in time on task | Median time on task, Arm A vs Arm B |
| Zero unsafe answers | No hit from the safety gates in `scripts/eval/safety-checks.mjs` across all study transcripts |

The 30 % target is genuinely uncertain and is expected to be the most likely to
fail. Measured time to first audio on the streaming voice path is 2.7–7.6 s,
against a text path that streams its first token sooner; spoken answers are also
consumed at speaking rate rather than reading rate. **A null or reversed result on
efficiency is a legitimate finding** and must be reported as such — the value of
the avatar, if any, is expected to show in the usability and qualitative measures
rather than in raw speed.

---

## 8. Risks, distress and safety

Full pathway in `ethics/risk-and-distress-protocol.md`. In outline:

- The topic is inherently sensitive. Tasks are framed as third-person situations
  rather than asking participants about their own circumstances.
- Every screen carries the medical disclaimer and, on the closing screen and the
  stop pathway: **111** (emergency), **Healthline 0800 611 116** (free 24/7 nurse
  advice), **Alzheimers NZ 0800 004 001**, **1737** (free call or text, mental
  health and carer distress).
- Participants are asked in the task cards not to enter real names or other
  identifying details.
- The system is an information tool, not a clinical one. The disclaimer appears in
  the PIS, the consent form and persistently in the interface.

---

## 9. Data management

Full plan in `ethics/data-management-plan.md`. In outline: pseudonymous participant
codes only; no names, addresses, or contact details stored with study data; data
held in the project's Supabase instance in tables not readable by the anonymous
client key; retained six years per University policy, then destroyed; accessible to
the investigator and supervisor only.

Two points the plan makes that the consent form now asks separately, because they
are separate questions:

1. **The application saves conversations** so a user can return to them, against an
   anonymous account identifier rather than a name. That is how the product works
   and is not something a participant opts out of while using it.
2. **Whether the researcher may read them** is genuinely optional, and declining
   does not prevent participation.

The plan also names **OpenAI and ElevenLabs as third-party processors** (§4a).
Every participant utterance and every generated answer reaches them. This is a
property created by moving credentials server-side — previously each user supplied
their own key, so the research team was not the party sending anything — and it is
stated plainly for that reason.

---

## 10. Limitations to declare in the write-up

These are known before the study runs and must be carried into the report rather
than discovered in review.

1. **Unmoderated design.** No think-aloud data, no observation of hesitation or
   error recovery, and no certainty about who used the device or what else they
   were doing. Task success must be inferred from transcripts.
2. **Small n, single-annotator scoring.** Rubric scores come from one rater; a
   second rater on a sample would strengthen this and is recommended if the
   supervisor's time allows.
3. **Avatar download.** Arm A runs on the deployed **Unity** renderer — the
   product's default, and the pipeline the mid-year articulation results were
   measured on, so those results do carry over. The cost is a one-time ~240 MB
   download. It is warmed during the information and consent screens so that it
   does not land inside a timed task, but a participant on a slow connection may
   still be waiting, and download frustration would attach itself to Arm A's
   usability score. The renderer and the avatar load state are recorded per
   session; any participant who silently degraded to the Three.js fallback is
   reported separately rather than pooled.
4. **Text-to-speech path.** The ElevenLabs WebSocket streaming path cannot be
   proxied without exposing the key, so the study build uses the REST cascade.
   Latency figures are therefore not comparable to the WebSocket figures in
   `docs/voice-latency-streaming.md`.
5. **Self-selection.** Participants who volunteer for a technology study are likely
   more technology-confident than the target population, which biases usability
   scores upward.
6. **Uncontrolled environment.** Device, browser, microphone quality and network
   vary between participants and are recorded but not controlled.
