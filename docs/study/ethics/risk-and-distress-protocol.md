# Risk and Distress Protocol

Companion to `protocol.md` §8. This exists because the study is unmoderated: there is
no researcher present to notice that something has gone wrong, so every safeguard has
to be built into the material or the software in advance.

---

## 1. Risk register

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| 1 | Participant becomes distressed by the subject matter | Moderate | Moderate | Fictional third-person scenarios; support numbers on the closing screen and the stop pathway; "I need to stop" on every screen; PIS warns before consent |
| 2 | **The system gives unsafe or incorrect health information** | Low | **High** | Prompt safety layer (36/36 assertions); retrieval grounded in a curated NZ corpus; persistent disclaimer; pilot safety scan as a go/no-go gate; every transcript scanned post hoc |
| 3 | Participant enters identifying information about themselves or the person they care for | Moderate | Moderate | Warning in the PIS, on the consent form, and on every task card; redaction at export (`data-management-plan.md` §7) |
| 4 | Participant living with dementia becomes confused or upset with no one present | Low (mitigated) | High | Support person required for the whole session; process consent re-checked before the second arm; shortened protocol |
| 5 | Participant treats the app's answers as medical advice | Moderate | High | Disclaimer in PIS, consent item 4, and persistently in the interface; debrief question 4 probes for it directly |
| 6 | Technical failure produces a frustrating experience | Moderate | Low | Pilot; browser gate before consent; errors logged and reported as reliability findings, not as participant failures |
| 7 | Study data exposed | Low | High | Row-level security; no anonymous-key access; no names collected |
| 8 | Participant feels their competence is being judged | Moderate | Low | Framing throughout: "we are testing the app, not you"; no time limit stated; no score shown |

Risk 2 is the one that would matter most, and it is the reason the pilot has a hard
stop gate rather than a review.

---

## 2. Distress pathway

The application cannot detect distress. The design therefore makes stopping easy and
puts support in front of the participant rather than waiting to be asked.

1. **"I need to stop" is on every screen**, styled as a plain visible control rather
   than hidden in a menu. Pressing it ends the session immediately, records nothing
   further, and shows the support screen below.
2. **The support screen** appears on stopping, on the closing screen, and is linked
   from the persistent footer:

   > **If you would like to talk to someone**
   > **111** — emergency
   > **Healthline 0800 611 116** — free 24/7 nurse advice
   > **Alzheimers NZ 0800 004 001** — dementia support and local services
   > **1737** — free call or text, any time

   These numbers are verified against official sources and are the same ones the
   application's safety prompt uses. Do not substitute others.
3. **No re-engagement.** A participant who stops is not emailed a reminder, not asked
   why, and not invited to resume. Their partial data is retained only if they had
   already consented, and they may still request its deletion.
4. **The referring service is informed** that a session took place only in aggregate
   ("n sessions completed"), never individually.

---

## 3. Escalation — if a participant discloses risk to themselves or others

An unmoderated study has no live channel, so this can only arise afterwards, by email
or through the referring service.

1. Do not attempt to counsel or assess. The researcher is an engineering student, not
   a clinician.
2. Respond acknowledging the message and provide the support numbers above.
3. Inform the supervisor the same day.
4. Where there is an immediate risk to life, contact emergency services on 111.
5. Record the event in `docs/study/incidents.md` and notify UAHPEC per the conditions
   of approval.

---

## 4. If the system gives an unsafe answer

"Unsafe" means: a foreign emergency number in place of 111, a medication dose, a
diagnosis, a confident specific answer the knowledge base cannot support, or a failure
to escalate an emergency.

**During the pilot** — stop. Fix it. Re-run the pilot. This is a go/no-go blocker, not
a limitation to note.

**During live sessions** — halt enrolment; notify the supervisor the same day; assess
whether the affected participant needs to be contacted through the referring service;
notify UAHPEC; fix and re-verify before resuming; and **report the incident in the
final write-up** whether or not it changes the results. Suppressing it would misstate
the safety record of a healthcare-adjacent tool.

Detection is by `scripts/study/safety-scan-transcripts.mjs`, which reuses the existing
gates in `scripts/eval/safety-checks.mjs`, plus a manual read of every transcript. The
scan runs after each batch of sessions, not only at the end.

---

## 5. Withdrawal

- Stopping mid-session: immediate, no reason required, via the button. Data collected
  up to that point is retained if consent was given, and counted in the report as an
  incomplete session.
- Withdrawing afterwards: email the researcher quoting the participant code, within
  **two weeks**. After that the data cannot be identified and cannot be withdrawn —
  stated plainly in every information sheet.
- No consequence, no follow-up, no effect on any relationship with the referring
  service, the University, or an employer.

---

## 6. Researcher conduct

- No participant is approached directly; recruitment goes through the referring
  service.
- No participant is known personally to the researcher. If someone in the researcher's
  own network volunteers, they are directed to the pilot group instead, and their data
  is not reported.
- No inducement or payment, so there is no financial pressure to complete.
- The proxy pilot group is explicitly told their data is for debugging and will not be
  reported.
