# Data Management Plan

Companion to `protocol.md` §9. Written to be lifted into the UAHPEC application's
data-management section.

---

## 1. What is collected

| Item | Identifiable? | Why it is needed | Consent |
|---|---|---|---|
| Participant code (e.g. `P07`) | Pseudonymous | Links a session's records together | Item 1 |
| Group, age band, technology confidence, prior AI use, years caring | No | Describing the sample; role contrast | Item 5 |
| Questionnaire responses (SUS, Likert, per-task items) | No | Primary usability measures | Item 5 |
| Time on task, turn counts, event timestamps | No | Primary efficiency measures | Item 5 |
| **Conversations** — participant queries and system answers | **Potentially** | Stored by the app so a user can return to them; the study additionally reads them for rubric scoring and safety scanning | Storage: normal use of the app. **Researcher access: item 7, separate and optional** |
| Account identifier — an anonymous id issued by Supabase Auth | Pseudonymous | Ties a person's conversations to them without a name or sign-up | Item 1 |
| Stage latencies, error and fallback events | No | Interpreting reliability; latency dataset | Item 5 |
| Browser, operating system, renderer, viewport | No | Explaining technical failures | Item 5 |
| Consent record — items ticked, form version, timestamp | Pseudonymous | Evidence of informed consent | — |

## 2. What is deliberately **not** collected

- Names, email addresses, phone numbers, postal addresses.
- IP addresses **by the application** — no endpoint reads or stores them. Note
  that the hosting platform (Vercel) records client IPs in its own runtime and
  access logs as part of serving any request; those are platform logs, are not
  joined to study data, and are not available to the research team as a dataset.
- Audio. Speech is transcribed on-device (Web Speech API) or by the transcription
  endpoint, and **only the resulting text is retained**; audio buffers are discarded
  as soon as transcription returns.
- Video, screen recordings, or any camera access. The application sets
  `Permissions-Policy: camera=()`.
- Analytics or third-party trackers. There are none in the application, and none are
  added for the study.
- Location.

## 3. Linking codes to people

The participant code is the only key in the dataset. The mapping from code to person
is held **only by the referring service and the participant themselves** — the
researcher never holds a combined list of names and codes.

Consequence, stated in every information sheet: **a withdrawal request must quote the
participant code**, and after the two-week window the data can no longer be
identified, so it cannot be withdrawn.

The access code issued with the invitation authorises API usage and is stored
separately from the study data, not alongside it.

**Exception — participants living with dementia.** Their consent form is signed on
paper and carries a name. Paper forms are stored separately from all study data, in a
locked cabinet in the department, and are never digitised alongside the dataset.

## 4. Where data lives

| Stage | Location | Controls |
|---|---|---|
| In transit | HTTPS to the study API on Vercel | TLS; strict Content-Security-Policy already enforced in `apps/web/vercel.json` |
| At rest | `study_sessions` and `study_events` tables, project Supabase instance | Row-level security denying all access to the anonymous client key; writes only through the server-side endpoint using the service role key |
| Analysis copies | University-provided storage (OneDrive for Business or the department's research drive) | Restricted to researcher and supervisor |
| Paper consent forms (PLWD only) | Locked cabinet, Department of ECSE | Physical access control |

### 4a. Third-party processors

Answering a participant's question requires sending it to a language model, and
speaking the answer requires sending the text to a voice service. **Both are
overseas providers, and both receive participant-entered text.**

| Processor | Receives | Location | Retention |
|---|---|---|---|
| OpenAI | The participant's question, the retrieved passages, and the generated answer; audio for transcription (discarded after transcription) | United States | Up to 30 days for abuse monitoring unless zero-retention is enabled on the account |
| ElevenLabs | The text of the answer to be spoken | United States | Per the provider's terms; no participant identifier is sent |

Neither receives a name, an email address, or the participant code. **The project
account must be confirmed as not on any tier that uses submitted data for model
training**, and that confirmation recorded before the first session.

This is a change from the previous arrangement and is stated plainly for that
reason: until now every user supplied their own API key, so the research team was
not the party sending anything to these providers. Under the new architecture it
is.

The study tables must **not** be readable by the anonymous key that the web client
uses for knowledge-base retrieval. This is the single most important technical
control in this plan, and the migration that creates the tables enforces it.

## 5. Retention and destruction

- Retained **six years** from the end of the study, per University of Auckland policy.
- Destroyed thereafter: database rows deleted, analysis copies deleted from University
  storage, paper forms shredded.
- Responsibility for destruction sits with the supervisor, since the student will have
  graduated.

## 6. Access

| Who | Access |
|---|---|
| Researcher (Richman Tan) | Full |
| Supervisor (Assoc. Prof. Jing Sun) | Full |
| Project partner (JooHyun Kang) | Aggregated results only — no transcripts |
| Anyone else | None |

Transcripts are not shared with the project partner, are not committed to the
repository, and are not published. The repository's `.gitignore` must exclude the
study export directory.

## 7. De-identification before analysis

Transcripts are read by the researcher for rubric scoring. Before any excerpt is
quoted in the report:

1. Any name, place name, or specific detail a participant entered despite the warning
   is replaced with a bracketed placeholder — `[name]`, `[place]`.
2. Quotes are attributed by participant code only.
3. Quotes are checked for the possibility of jigsaw identification — a combination of
   details that could identify someone even without a name. The relevant test is
   whether a colleague or family member could recognise the person, not whether a
   stranger could.

If a participant enters something that clearly identifies a third party — a person in
their care — that content is redacted at export and never enters the analysis copy.

## 8. Breach and incident handling

If study data is exposed, or an unsafe or harmful answer is given to a participant:

1. Stop enrolment immediately.
2. Notify the supervisor the same day.
3. Notify UAHPEC as required by the conditions of approval.
4. Record the incident, the cause, and the remedy in `docs/study/incidents.md`.

An unsafe answer detected during the pilot is a **go/no-go blocker** and must be
fixed before real participants are enrolled — see `pilot-checklist.md`.

## 9. Reuse

Data is collected for this project only. It will not be reused for another study, and
it will not be used to train or fine-tune any model. Anonymised aggregate results
(counts, medians, tables) may be reported in the project report, presented at the
Part IV conference day, and published.
