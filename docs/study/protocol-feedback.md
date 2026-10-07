# Feedback round: free use, flags and open questions

The clinical collaborators' next evaluation of the app, added in October 2026 alongside
the tasks study ([protocol.md](protocol.md)). It reaches the same `#/study` harness at
its own link, `#/study/feedback`, and **ships switched off**.

## What it is, and what it is not

The tasks study asked carers to complete set tasks in two interfaces. The clinical
lead's review was that this made people answer the researchers' questions instead of
trying the tool. The next round therefore lets carers **use the app freely**. They can
compare it with the e-DiVA-NZ website, flag answers they disagree with, and say what
they thought in their own words, for thematic analysis.

It is a **user-experience round, not research**. The original ethics approval has
expired. So this round has:

- a privacy notice instead of a consent form;
- no names, anywhere;
- results for the team improving the app, not for publication.

A research evaluation of the final version will need a new ethics application. That
evaluation is planned to run outside this harness, with interviews.

**Nothing that was evaluated changes for this round:**
- the system prompt, retrieval, knowledge base and models;
- the tasks protocol and its data;
- `STUDY_VERSION`.

Feedback sessions are told apart by `study_sessions.protocol`.

## The flow

| Step | What the person sees |
|---|---|
| `intro` | What happens, and a time estimate (about 30 minutes: 15–20 using the app, about 10 on questions) |
| `privacy` | The privacy notice, and one yes/no choice: may the conversation be kept? |
| `group` | Carer, care worker, or tester. There is no group for people living with dementia: that group's safeguards belong to an approved protocol |
| `setup` | The access code, and an optional microphone check. Any browser; a note says talking works best in Chrome or Edge |
| `explore` | A brief, then the app itself, with a slim band at the top showing "Use the app as you would at home", **Things to try**, **I'm finished** and **I need to stop** |
| `feedback` | Five open questions, each skippable |
| `feedbacksus` | The SUS with "this app" for "system". Optional, with "Skip and finish" |
| `done` / `stopped` | Support numbers, the session code, how to see or delete what is held, and "Clear this device" for the next person |

During free use, every answer in chat, and in the voice transcript (☰), has **Flag this
answer**. It takes an optional comment. The form says that it sends the answer, the
question and the comment to the team. So a flag carries that exchange even when the
person chose not to keep their conversation.

### Things to try (the clinical lead's scenarios, 23 Sep 2026)

1. Repeated questions: what might help?
2. Respite care near you.
3. Sudden confusion since yesterday.
4. Dementia or normal ageing?
5. A follow-up question.
6. The same topic on the e-DiVA-NZ website: which was more useful, and why?
7. Flag an answer you don't agree with.
8. *Round 1 only:* watch two or three e-DiVA-NZ videos. Would a short video beside an answer help?

These are suggestions the person can tick off, never tasks. The wording is in
`apps/web/src/study/instruments.js` (`THINGS_TO_TRY`).

**What the team hopes to see, for reviewers only.** This list is deliberately not in the
browser bundle.
- *Sudden confusion (3):* advise contacting a health professional promptly, without
  offering a diagnosis.
- *Normal ageing (4):* give general information and suggest seeing a GP, without
  offering an assessment.

The open questions are `FEEDBACK_QUESTIONS` in the same file:
1. What did you find useful?
2. What was confusing or hard?
3. Compared with e-DiVA-NZ, which was more useful, and why?
4. *Round 1:* would a short video beside an answer help?
5. What would you change?

## What is recorded

These are added to the event kinds in [README.md](README.md#event-kinds). Every event
on this round has `arm` and `taskId` null.

| Kind | Payload |
|---|---|
| `session_start` | as for tasks, plus `protocol: 'feedback'` |
| `explore_start` / `explore_end` | `durationMs`; `stoppedMidExplore` when "I need to stop" ended it |
| `page_view` | the route only, e.g. `/app/library/<article id>` |
| `try_done` | the idea's id, and whether it was ticked or un-ticked |
| `turn` | as for tasks, plus `turnId`; text only if the person said yes to keeping it |
| `answer_flagged` | `turnId`, `surface` (chat or voice), the question, the answer, the comment |
| `feedback_done` | the `feedback.*` answers |
| `sus_done` | `scope: 'feedback'` and the `sus.feedback.*` answers |

Not recorded: names, contact details, audio, or anything from the camera.

**A fix for both protocols.** Nothing is recorded once a session reaches `done` or
`stopped`. Before this, someone who went back into the app after "Nothing more will be
recorded" still had their turns logged.

## Switching it on

Two switches must both be on:
- the web build's `VITE_STUDY_FEEDBACK=1`;
- the API's `STUDY_PROTOCOLS` must include `feedback`.

When the API is off, the setup screen says sessions aren't open. It never falls back to
the tasks study, which would skip that study's consent form.

**In this order:**
1. Run `scripts/migrations/2026-10-07_study_protocol.sql`. The API reads the new column
   only once step 2 enables the round, so running this first is safe.
2. On the API, set:
   - `STUDY_PROTOCOLS=tasks,feedback`;
   - the round's codes in `STUDY_ACCESS_CODES`, one per carer if you want per-person
     limits, since codes share one daily meter;
   - `ALLOWED_ORIGINS`.

   Then redeploy the API. It imports `packages/core/study/studyConfig.mjs`, so the
   redeploy is also what picks up the protocol list.
3. On the web build, set:
   - `VITE_STUDY_FEEDBACK=1`;
   - `VITE_STUDY_FEEDBACK_CONTACT`: who people contact to see, correct or delete their
     data. Until it is set, the notice says to ask whoever gave them their code;
   - optionally, `VITE_STUDY_EDIVA_URL`, an https link added to the e-DiVA-NZ ideas.

   Then redeploy.

### Before it goes live (for the clinical collaborators)

- **Confirm the wording**, which is a draft:
  - the privacy notice (`PrivacyStep` in `StudyScreen.jsx`);
  - the time estimate;
  - Things to try;
  - the open questions.
- **Decide how long the data is kept.** The notice does not promise a period until one
  is decided.
- **Drop the round-1-only items** (8 above, and question 4) for later rounds.
- **Remove names from any other forms used with the round.** The app collects none.

## Group sessions

Each person uses their own device and their own code. On a shared device:
1. "Clear this device" on the closing screen hands over to the next person. It refuses
   while events are still waiting to send.
2. The link returns to `#/study/feedback`, so the next person starts the same round.

## Export

```
npm run study:export-feedback -- [--include-pilot] [--with-transcripts]
```

This writes `feedback-*.csv` into `docs/study/results/` (gitignored):
- sessions, usage, flags, open answers, SUS, and ideas tried;
- with `--with-transcripts`, the conversations of people who agreed to keep them.

The tasks export (`npm run study:export`) now reads tasks sessions only, so the two
exports cannot mix.
