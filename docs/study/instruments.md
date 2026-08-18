# Instruments

Every question the study asks, in the order the application presents them.
Companion to `protocol.md` §5. Response options are given exactly as they should be
implemented in `apps/web/src/study/`.

---

## 1. Screening (in the invitation, before the link is issued)

Asked by the referring service or in the reply to the recruitment email — not in
the application.

1. Are you 18 or over? *(yes / no — no excludes)*
2. Which best describes you?
   - I provide, or recently provided, unpaid care for someone with dementia
   - I work in dementia care or aged care
   - I have a diagnosis of early-stage dementia
   - None of these *(excludes)*
3. Do you have a device with a microphone and an internet connection? *(yes / no — no excludes)*
4. Can you use Google Chrome or Microsoft Edge for the session? *(yes / no — no excludes)*
5. *(PLWD group only)* Is there a family member or support person who can be with you
   for the session? *(yes / no — no excludes)*

---

## 2. Background (in-app, after consent, before Arm 1)

Kept short deliberately: every extra question before the first task costs
completion rate in an unmoderated study.

1. Which best describes you? *(caregiver / care or health worker / living with dementia)*
2. Age band *(under 40 / 40–54 / 55–64 / 65–74 / 75+ / prefer not to say)*
3. How comfortable are you with new apps and websites?
   *(1 = not at all comfortable … 5 = very comfortable)*
4. Have you used an AI assistant before — for example ChatGPT, Siri or Alexa?
   *(never / once or twice / sometimes / often)*
5. *(caregiver group)* Roughly how long have you been caring for someone with
   dementia? *(under 1 year / 1–3 years / more than 3 years / I no longer provide care)*

---

## 3. After each task

**3.1 Self-reported success**

> Did you find what you needed?
> ○ Yes ○ Partly ○ No

**3.2 Effort** *(single item, kept to one because it is asked six times)*

> How easy or hard was that to do?
> 1 = Very hard · 2 = Hard · 3 = Neither · 4 = Easy · 5 = Very easy

---

## 4. After each arm — System Usability Scale

Standard SUS, ten items, five-point Likert from **1 = Strongly disagree** to
**5 = Strongly agree**. Presented once per arm. "System" is replaced by
**"this way of using the app"** so that participants score the *interface*, not the
product as a whole — this is the only permitted deviation from the standard wording
and it must be declared in the write-up.

1. I think that I would like to use this way of using the app frequently.
2. I found this way of using the app unnecessarily complex.
3. I thought this way of using the app was easy to use.
4. I think that I would need the support of a technical person to be able to use this way of using the app.
5. I found the various functions in this way of using the app were well integrated.
6. I thought there was too much inconsistency in this way of using the app.
7. I would imagine that most people would learn to use this way of using the app very quickly.
8. I found this way of using the app very awkward to use.
9. I felt very confident using this way of using the app.
10. I needed to learn a lot of things before I could get going with this way of using the app.

**Scoring.** Odd items score (response − 1); even items score (5 − response); sum
and multiply by 2.5 for a 0–100 score. Implemented in
`scripts/study/analyse-study.mjs`, not by hand.

**Interpretation.** 68 is the conventional average. Report the raw score and the
median across participants. Do **not** report SUS as a percentage or convert it to a
letter grade — with n < 20 the precision implied would be false.

---

## 5. After each arm — four Likert items

Five-point, **1 = Strongly disagree** to **5 = Strongly agree**. These carry the
constructs SUS does not: trust and engagement matter here in a way they would not
for a general productivity tool.

| Construct | Item |
|---|---|
| Trust | I would trust the information this gave me. |
| Engagement | I found this way of getting answers engaging. |
| Helpfulness | The answers I got would be helpful in a real situation. |
| Clarity | The answers were easy to understand. |

---

## 6. Debrief (after both arms)

Free text, no minimum length, all skippable. Five questions is the ceiling for an
unmoderated study before drop-off.

1. Which of the two ways of using the app did you prefer, and why?
2. Was there anything that felt confusing, frustrating, or harder than it needed to be?
3. Did the answers feel like they were written for someone in your situation? What
   made you say that?
4. Was there anything the app said that you would want to check with a doctor,
   nurse, or another person before acting on it?
5. Is there anything else you would like us to know?

**Question 4 is a safety instrument, not a satisfaction one.** Answers to it are read
alongside the transcript safety scan in `tasks.md` §3 and reported in the results
whether or not they are flattering.

---

## 7. Shortened instruments — participants living with dementia

SUS is replaced. Ten negatively-and-positively mixed abstract statements are a poor
instrument for this group, and the aim here is accessibility feedback rather than a
comparable usability score.

Asked once per arm, verbally if the support person prefers, and recorded as a
selection plus any free text:

1. Was that easy or hard to use? *(easy / in between / hard)*
2. Was it easy to understand what it told you? *(easy / in between / hard)*
3. Would you want to use something like this? *(yes / maybe / no)*

Then once at the end, in place of the five-question debrief — which is too long for
this group, and showing it anyway would breach the fatigue safeguard in
`protocol.md` §3.3:

4. Which one did you like better — talking to it, or typing? Why?

The support person is asked two questions of their own:

5. Was there anything you had to help with?
6. Was there anything you noticed that they found difficult?

**Halfway re-check.** Between the two arms this group sees a pause screen asking
the support person whether the participant is happy to carry on, with "Finish here"
offered as an equally-weighted option rather than a reluctant one. This is the
process-consent commitment in `protocol.md` §3.3, and choosing to stop is recorded
as a normal outcome, not a failure.

**Attendance.** The setup screen asks this group to confirm a support person is
present, and the session cannot start without it. The answer is stored on the
session record.

---

## 8. Notes for implementation

- Every item is **skippable**. A forced-response survey in an unmoderated study
  converts hesitation into a dropped session.
- Likert scales render as labelled radio buttons, not sliders or star ratings —
  larger targets, and no ambiguity about the value selected.
- The scale direction never flips between screens.
- Item order within SUS is fixed, not shuffled, so scores stay comparable to the
  published instrument.
- Everything is recorded against the participant code only. See
  `ethics/data-management-plan.md`.
