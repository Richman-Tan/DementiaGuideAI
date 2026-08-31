# Pilot Checklist and Go/No-Go Gate

Run with **3–5 proxy participants** (peers or students) before any real participant is
enrolled. Pilot data is for debugging the protocol and the software. It is **never**
reported, never pooled, and never counted toward n.

The pilot needs no ethics approval as long as it stays a software and protocol test —
proxy participants are debugging a system, not contributing research data. Confirm
that framing with the supervisor, and do not collect anything from them beyond what is
needed to check the machinery works.

---

## 1. Before the pilot — technical readiness

Everything here is verifiable without a participant.

☐ Server proxy live: with `dg_keys` cleared, Chat returns real cited answers, not one
of the eight canned replies. (The failure mode here is silent — a mock reply looks
like a real one.)

☐ Mock mode is impossible to enter accidentally in the study build. `?mock=1` and a
missing key both route to the proxy.

☐ Voice works with no key stored: `/app/voice` reaches `listening → thinking →
speaking` and no `sk-…` setup card appears.

☐ Access code gating works: a wrong code is refused; a valid code passes; the
per-code request cap triggers as configured.

☐ OpenAI account has a **hard spend cap** set, and it has been checked today.

☐ Seed thread suppressed: a fresh study session opens Chat empty. (Default behaviour
pre-seeds a fake conversation including "he lashes out at me and I get scared" —
verify it is gone.)

☐ Arm B is isolated: no avatar canvas is created, `/app/voice` is blocked, no
ElevenLabs request is made.

☐ **Arm A is isolated too.** During an Arm A task, close the avatar, go to Home, and
click "Chat" in the sidebar — it must bounce straight back to the avatar. The reverse
guard is the one that was missing, and its failure is invisible: the app works, and
every turn is recorded as Arm A while running through the Arm B interface.

☐ Typed turns in Arm A are recorded as typed. Send one question through the avatar
screen's message bar and confirm the `turn` event carries `modality: "typed"`, and
that `tasks.csv` counts it under `typed_turns`. The message bar stays — a participant
who cannot speak comfortably needs it — so the measurement is what keeps the arm
comparison honest.

☐ **Handover gate.** Leave a session half-finished, reload `#/study`, and confirm the
"Welcome back / I'm someone else" screen appears before anything else. This is the
single most likely data corruption in the whole study: one link is forwarded to
everyone, so a second person on the same browser would otherwise be resumed silently
into the first person's session — same code, same answers, same Latin square cell,
two people merged into one row.

☐ "I'm someone else" refuses to clear while events are still queued, and says so.
Test it offline: the clear must fail with a count, not succeed and discard the record.

☐ Latency events emit and `scripts/parse-latency.mjs` parses them unmodified.

☐ Events reach `study_events` and carry participant code, arm, task and monotonic
timestamps.

☐ `study_sessions` and `study_events` are **not** readable with the anonymous client
key. Test this explicitly — it is the main technical control in the data management
plan.

☐ Counterbalancing unit test passes: participant numbers 1–12 fill all four Latin
square cells evenly.

☐ "I need to stop" works from every screen and shows the support numbers.

☐ Support numbers render correctly: 111, Healthline 0800 611 116, Alzheimers NZ
0800 004 001, 1737.

☐ Browser gate: Safari and Firefox are stopped before consent with a clear message.

☐ Onboarding step 8's voice preview either plays audio or has been removed. As shipped
it animates for 2.8 s and plays nothing, and testers will report it as a fault.

☐ Deployed build verified on the live URL, not just locally. `vercel build --prod`
produces `.vercel/output/functions` for the API routes.

☐ **Avatar download timed on a normal home connection.** Arm A uses the deployed
Unity avatar (~240 MB, one-time). Confirm it is warmed during the information and
consent screens and is ready before the first task — if a pilot participant is
still watching a progress bar when the first task starts, the download is inside
the time-on-task measurement and the protocol needs rethinking, not a footnote.

☐ Renderer recorded correctly in the session row: `unity` when the build loads,
`threejs` if it silently degraded. A session on the fallback is not comparable to
one on Unity, so it has to be visible in the data.

---

## 2. During the pilot — protocol readiness

Each pilot participant completes the full session end to end, from the invitation
email to the thank-you screen.

☐ The invitation email is clear enough to act on without asking a question.

☐ The information sheet is understood. Ask afterwards: what did you think would be
recorded? A mismatch is a consent problem, not a comprehension problem.

☐ Tasks are understood without further explanation. **If a pilot participant asks
"what am I supposed to search for?", the task card has failed** — it is meant to
describe a situation, not hand over the query.

☐ Nobody types the task card text verbatim into the app. If they do, the card is too
close to a query and needs rewriting.

☐ Session length is 35–45 minutes. Longer means cutting something before real
participants, who have less patience and less goodwill.

☐ No question is ambiguous or annoying enough to trigger a drop-off.

☐ Every event needed for analysis is present in the export: task boundaries, turn
counts, questionnaire responses, transcripts.

☐ `scripts/study/analyse-study.mjs` runs on the pilot export and produces Tables 1–4
without hand-editing.

☐ `scripts/study/make-study-figures.py` produces readable figures at the pilot's n.

☐ Rubric scoring can actually be done from the transcripts alone. Score one pilot
transcript blind and check the rubric discriminates — if every task scores "complete"
regardless, the key points are too easy.

☐ **Two people score the same pilot transcripts independently**, into `rubric_score`
and `rubric_score_2`, and `analyse-study.mjs` reports agreement and κ. Do this at the
pilot, not at the end: if the raters disagree, the fix is to clarify the rubric in
`tasks.md` §2 *before* real transcripts exist. Discovering it afterwards means
re-scoring everything under a rubric written with the results already visible.

☐ The six Likert items read naturally out loud and none of them is answered "well,
it depends". Personalisation and actionability are the newest wording and the least
tested — if a proxy participant hesitates over "rather than general information anyone
would get", fix it now. After the first real participant the wording is frozen.

---

## 3. Go / No-Go gate

**Do not enrol a real participant unless all of these hold.**

| # | Gate | Blocking? |
|---|---|---|
| 1 | `safety-scan-transcripts.mjs` returns **zero hits** on all pilot transcripts | **Hard stop** |
| 2 | Manual read of every pilot transcript finds no unsafe, fabricated, or inappropriately confident answer | **Hard stop** |
| 3 | Study tables are not readable with the anonymous key | **Hard stop** |
| 4 | UAHPEC approval granted, and the approval reference is on every document | **Hard stop** |
| 5 | All pilot sessions completed end to end without an unrecoverable technical failure | Blocking |
| 6 | Analysis pipeline runs on the pilot export unmodified | Blocking |
| 7 | Session length within 45 minutes | Blocking |
| 8 | Task cards understood without clarification | Blocking |

A hard stop means fix, re-pilot, re-check. Not "note as a limitation".

---

## 4. After the pilot

☐ Record what changed as a result, and why, in `docs/study/pilot-notes.md`. If task
wording changed, the protocol version increments and the change is declared in the
write-up.

☐ **Delete the pilot data** from the study tables before real enrolment, so it cannot
be accidentally analysed. Keep the export separately if it is useful for debugging.

☐ Reset participant numbering so real participants start at P01 and fill the Latin
square from the first cell.

☐ Confirm with the supervisor that the protocol as piloted still matches the protocol
as approved. If the pilot forced a material change — different tasks, different
measures, a changed procedure — that needs an amendment before enrolling, not after.
