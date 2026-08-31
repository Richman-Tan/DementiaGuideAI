# UAHPEC Application — Notes for the Supervisor

**For:** Assoc. Prof. Jing Sun, who holds the application as Principal Investigator
**From:** Richman Tan
**Date:** 18 August 2026

This maps the material in `docs/study/` onto the UAHPEC application so the form can be
assembled without re-deriving anything. Section names follow the standard online form;
check them against the current version, which changes periodically.

**Timing.** UAHPEC review typically takes 4–6 weeks, and it is now mid-August. This is
the critical path for the whole second half of the project. Everything in this folder
is complete and ready to submit; the application only needs the items in §1 below,
which are yours rather than mine.

---

## 1. What is needed from you, and only from you

| Item | Where it goes |
|---|---|
| **Written confirmation that the OpenAI and ElevenLabs accounts do not train on submitted data** | Required by `data-management-plan.md` §4a before the first session |
| Principal Investigator details | Form header |
| Head of Department name and contact | Every PIS and consent form footer — currently `[…]` |
| Department letterhead | All PIS and consent documents |
| Confirmation of the risk pathway (see §3) | Determines which form is used |
| A decision on the PLWD group (see §4) | May change the pathway |
| Your contact details | Every PIS — currently `[…]` |

Everything else is drafted.

---

## 2. Section-by-section mapping

| Form section | Source | Notes |
|---|---|---|
| Project title, aims | `protocol.md` §1 | Research question quoted verbatim |
| Background and rationale | `protocol.md` §1 | Includes the iSupport null-trial motivation and the JMIR "Anne" precedent for remote ECA use, both with citations in `docs/seminar/seminar-research.md` |
| Design and methods | `protocol.md` §2 | Within-subjects, counterbalanced, two arms |
| Participants and recruitment | `protocol.md` §3, `recruitment-email.md` | Note: no direct approach; referring services forward the invitation |
| Sample size and justification | `protocol.md` §3.1 | 8 participants is the conventional discovery point; upper bounds strengthen the paired comparison |
| Procedures | `protocol.md` §6 | Ten steps, all in-app |
| Data collection instruments | `instruments.md` | Complete wording of every question asked |
| Risks and mitigation | `risk-and-distress-protocol.md` §1 | Eight-row risk register |
| Distress and adverse-event handling | `risk-and-distress-protocol.md` §§2–4 | Includes the safety escalation pathway |
| Consent process | `consent-form.md` | On-screen itemised ticks; paper for PLWD |
| Vulnerable participants | `protocol.md` §3.3, `participant-information-sheet-supporter.md` | See §4 below |
| Data management, storage, retention | `data-management-plan.md` | Six years, then destroyed |
| Anonymity and confidentiality | `data-management-plan.md` §§2–3, §7 | Researcher never holds a name-to-code mapping |
| Dissemination | `data-management-plan.md` §9 | Project report, conference day, possible publication |
| Attachments | The three PIS versions, the supporter sheet, the consent form, all recruitment items | |

---

## 3. Risk pathway

I have drafted this as a **low-risk / expedited** application on the following basis,
but the judgement is yours:

**Supporting low risk:** adult participants; no clinical intervention; no deception;
no collection of names or contact details; fictional scenarios rather than personal
disclosure; voluntary with easy withdrawal; no payment or inducement; no power
relationship between researcher and participants.

**Arguing against, and needing your view:**

1. **The topic is sensitive.** Dementia care is emotionally difficult, and around one
   in three informal dementia carers meets the threshold for depression (Sallim et
   al. 2015). Participants may be under real strain.
2. **The system gives health-related information.** It is not a clinical tool and is
   disclaimed as such throughout, but a participant could act on what it says. This is
   the risk I would most want the committee to see clearly — it is addressed in
   `risk-and-distress-protocol.md` risk 2 and by the pilot go/no-go gate.
2b. **Participant text leaves the country.** Answering a question means sending it
   to OpenAI in the United States, and speaking the answer means sending text to
   ElevenLabs. No name or code travels with it. Worth surfacing rather than
   burying, since the committee will ask.
3. **Conversation transcripts are retained.** Consented separately and optionally
   (item 7), but they are free text a participant could put anything into.
4. **The PLWD group is a vulnerable population** — see §4.

Items 1–3 are, I think, manageable within a low-risk application. Item 4 probably is
not.

---

## 4. The decision I would like you to make: the PLWD group

The project brief includes people living with early-stage dementia. Their perspective
is directly relevant — the research question is about accessibility, and they are the
population the product ultimately serves.

But including them in an **unmoderated remote** study is the part of this design I am
least comfortable with, and I do not think the committee will accept it as drafted
without the safeguards below:

- capacity to consent can fluctuate, so a single signature at the start is not
  sufficient;
- nobody is present if the participant becomes confused or distressed;
- there is no way to confirm who actually used the device.

**What I have designed** (`protocol.md` §3.3): a support person present throughout,
process consent re-checked before the second half, a shortened protocol (one task per
arm, SUS replaced by three plain-language questions), paper consent in 16 pt, and
their data reported separately and qualitatively rather than pooled into the main
comparison.

**Three options, in the order I would rank them:**

| | Option | Consequence |
|---|---|---|
| 1 | Submit with the PLWD group and the safeguards above | Likely a **full committee** review rather than expedited. Adds time we may not have. Gives the strongest accessibility evidence. |
| 2 | Submit the carer and worker groups now; add the PLWD group as an amendment later | Keeps the main study on the expedited path and moving. The amendment may not clear in time to be used. |
| 3 | Drop the PLWD group | Fastest, and defensible for a one-semester project. Costs the most directly relevant accessibility evidence, and should then be named explicitly as a limitation and as future work. |

**My recommendation is option 2.** The carer comparison is what answers the research
question and it is the thing that must not slip; the PLWD arm is valuable but
additive, and losing four weeks of review time on it would put the whole study at
risk. If you would prefer option 1, the material is ready for it either way.

---

## 5. Things a reviewer is likely to ask, and where the answer is

| Likely question | Answer |
|---|---|
| How do you know the system won't give harmful advice? | Prompt safety layer verified at 36/36 deterministic assertions, including emergency-number correctness (4/4 after the 000→111 fix); retrieval grounded in a curated NZ corpus with zero Australian service references remaining in production; every transcript machine-scanned and manually read; pilot hit = hard stop. `risk-and-distress-protocol.md` §4. |
| What if a participant treats it as medical advice? | Disclaimer in the PIS, consent item 4, and persistently in the interface. Debrief question 4 probes for it directly and the answers are reported. |
| Why keep transcripts at all? | Two separate things, and the form asks them separately. The **app** saves conversations so a user can return to them — that is how the product works. The **researcher reading them** is optional, and is what makes task success scorable and safety verifiable in an unmoderated study. `data-management-plan.md` §1, `consent-form.md` items 7 and 9. |
| Where does participant data go outside New Zealand? | To OpenAI (question, retrieved passages, generated answer, and audio for transcription) and ElevenLabs (answer text for the spoken voice), both in the United States. Neither receives a name, contact details or the participant code. `data-management-plan.md` §4a. **Confirm before submission that the project account is not on a tier that trains on submitted data**, and record that confirmation. |
| How is anonymity maintained if free text is stored? | No names collected; warnings on the PIS, consent form and every task card; redaction at export; jigsaw-identification check before any quotation. `data-management-plan.md` §7. |
| Could a participant be identified from the data? | The researcher never holds a name-to-code mapping — it sits with the referring service and the participant. `data-management-plan.md` §3. |
| Is there a power relationship? | No. Participants are recruited through third-party services, are not students of the supervisor, and receive no payment. Anyone known personally to the researcher is diverted to the unreported pilot group. |
| Why no payment? | To avoid financial inducement to complete a session someone would otherwise stop. |

---

## 6. What I will do while the application is under review

Neither of these involves participants, so neither needs approval, and both are
outstanding items from `docs/report/700b_evaluation_plan.md`:

1. Build the software the study needs — a server-side credential proxy (so
   participants do not need their own paid API key), the in-app study harness, session
   instrumentation, and the text-only baseline arm.
2. Complete the human sign-off on the groundedness ratings, which is still filled in
   by an AI with an explicit disclaimer in
   `docs/report/eval/groundedness_654b328_v2-nz-safety_spotcheck.md`, and run a
   heuristic/WCAG 2.1 AA expert review of the web app against the accessibility
   requirements already written as testable criteria in `docs/design-system.md`.

If approval is delayed beyond the point where the study can run, item 2 plus the
expert review becomes the fallback evaluation for the final report. It is weaker
evidence and would not answer the research question, but it is honest evidence.
