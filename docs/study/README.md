# User Study — DementiaGuide AI

The human usability study named as the **highest-priority remaining work** in
`docs/report/midyear-technical-report.md` §5. It is the only thing that can answer the
research question:

> How can an AI-powered avatar-based interface improve the accessibility,
> personalisation, and usability of digital resource management systems for dementia
> care?

Every result so far — 95/95 articulation checks, 36/36 safety assertions, recall@5
0.969 — validates enabling technology. None of it involves a person using the product.

This folder expands the one-page sketch in `docs/report/700b_evaluation_plan.md` §1
into a runnable study.

---

## The design in one paragraph

Within-subjects, counterbalanced comparison of two interfaces over the same knowledge
base: **Arm A**, the voice/avatar assistant, against **Arm B**, the same retrieval
pipeline as text-only chat. Each participant does three resource-finding tasks in each
arm, with arm order and task-set order crossed in a Latin square. Sessions are
**unmoderated and remote** on the public web app. Measures are task success against a
rubric, time on task, turns, SUS and four Likert items per arm, and a five-question
debrief. Target 8–12 family carers, 4–6 care workers, and 3–5 people living with
dementia in a supported, shortened variant.

---

## Documents

| File | What it is |
|---|---|
| [protocol.md](protocol.md) | The study design in full. Written to be lifted into the ethics application. |
| [tasks.md](tasks.md) | The six task cards (participant-facing) and the scoring rubric (scorer only) |
| [instruments.md](instruments.md) | Every question the study asks, in presentation order |
| [analysis-plan.md](analysis-plan.md) | Pre-specified analysis, table shells, success criteria, and what would make the study wrong |
| [pilot-checklist.md](pilot-checklist.md) | Dry run with proxy participants, and the go/no-go gate |
| [incidents.md](incidents.md) | Incident log — empty is the expected state |

### Ethics pack — `ethics/`

| File | What it is |
|---|---|
| [amendment-request.md](ethics/amendment-request.md) | **Start here.** Approval already exists; the architecture changed after it was granted, so this is what goes to the committee next |
| [uahpec-application-notes.md](ethics/uahpec-application-notes.md) | Section-by-section mapping onto the UAHPEC form, plus the decisions needed from the supervisor |
| [participant-information-sheet-caregiver.md](ethics/participant-information-sheet-caregiver.md) | PIS — family carers (primary group) |
| [participant-information-sheet-careworker.md](ethics/participant-information-sheet-careworker.md) | PIS — health and aged-care workers |
| [participant-information-sheet-plwd.md](ethics/participant-information-sheet-plwd.md) | PIS — people living with dementia, plain language, 16 pt |
| [participant-information-sheet-supporter.md](ethics/participant-information-sheet-supporter.md) | For the support person who must be present for that group |
| [consent-form.md](ethics/consent-form.md) | Itemised consent, including a separate optional tick for transcript retention |
| [recruitment-email.md](ethics/recruitment-email.md) | Organisation approach, forwardable invitations, confirmation email, flyer |
| [data-management-plan.md](ethics/data-management-plan.md) | What is collected, where it lives, who sees it, how long it is kept |
| [risk-and-distress-protocol.md](ethics/risk-and-distress-protocol.md) | Risk register, distress pathway, escalation, withdrawal |

---

## Status

| | |
|---|---|
| Protocol and instruments | **Drafted** |
| Ethics pack | **Drafted and corrected** for server-held credentials and stored conversations — awaiting supervisor review and submission |
| UAHPEC approval | **Granted** for this study. But these documents were written before that was known — reconcile against the approved protocol, and file an amendment for the architecture change. See `protocol.md` header. |
| Software support | **Built, under review.** A pre-merge audit found blockers that must be fixed before any pilot — see the plan. |
| Pilot | Not run |
| Data collection | Not started |

**Approval exists, but the architecture changed after it was granted — no participant may be approached until the amendment is filed.**

---

## Software the study needs

Three properties of the shipped app made an unmoderated remote study impossible.

1. **It could not answer real questions without the participant's own paid API key.**
   With no key in `localStorage` the app serves eight canned replies, and the voice
   screen was hard-gated behind a raw `sk-…` form. Participants would have tested a
   mock, with no indicator that they had (GitHub issue #48).
2. **There was no telemetry.** Nothing persisted beyond `localStorage`, so an
   unmoderated session would have produced no recoverable data at all.
3. **First-run Chat was pre-seeded with a fake distressing conversation** — including
   *"he lashes out at me and I get scared"*. Unacceptable as the first thing a carer, or
   a participant living with dementia, sees.

All three are now addressed.

| Piece | Where |
|---|---|
| Credential proxy — keys server-side, callers admitted by study access code | `apps/web/api/` |
| Study flow — consent, tasks, questionnaires, the stop pathway | `apps/web/src/study/` |
| Task band shown over the app, and the time-on-task boundaries | `apps/web/src/study/screens/StudyTaskOverlay.jsx` |
| Counterbalancing and task content, shared by client and server | `apps/web/src/study/studyConfig.js` |
| Per-turn latency capture | `apps/web/src/study/latency.js` |
| Database tables and the RLS lockdown | `scripts/migrations/2026-08-18_study_tables.sql` |
| Export, analysis, safety scan, figures | `scripts/study/` |

### Running it

1. Run `scripts/migrations/2026-08-18_study_tables.sql` in the Supabase SQL editor and
   work through its VERIFY block — **including step 4**, which is the only one that
   proves the anonymous key cannot read study data.
2. Set the server-side variables from `apps/web/.env.example` in the Vercel project.
   Never with a `VITE_` prefix: that would inline them into the browser bundle.
3. Set a **hard spend cap** on the OpenAI account. The per-code meter is a convenience;
   the spend cap is the actual backstop.
4. Deploy. `vercel build` picks up `api/` with no extra configuration.
5. Work through `pilot-checklist.md`.

Locally, `npm run web` serves the API routes too (a dev middleware in
`apps/web/vite.config.js` mounts them, since `vite dev` has no notion of serverless
functions). Export `STUDY_ACCESS_CODES`, `OPENAI_API_KEY` and the Supabase service key
into the shell first.

| Command | Does |
|---|---|
| `npm run study:export -- --with-transcripts` | Pull sessions and events into `docs/study/results/` |
| `npm run study:safety` | Apply the eval harness's safety gates to real transcripts; exits 1 on a hit |
| `npm run study:analyse` | Produce the tables in `analysis-plan.md` |
| `npm run study:figures` | Figures into `docs/report/figures/` |

`docs/study/results/` is gitignored. Participant data never enters the repository.

### Event kinds

`study_events.kind`, in the order a session produces them:

| Kind | Payload |
|---|---|
| `session_start` | group, arm order, set order, whether resumed, transcript consent |
| `background_done` | background questionnaire answers |
| `task_start` | task id, arm, set |
| `turn` | question, answer, retrieved source ids, stage timings |
| `turn_error` | error name and message (chat arm) |
| `latency` | the six stage timings, plus `to_first_token_ms` |
| `stt_empty` | speech recognition returned nothing |
| `task_end` | duration, whether the participant gave up |
| `sus_done`, `likert_done` | questionnaire answers for that arm |
| `debrief_done` | free-text answers |
| `session_complete` / `session_stopped` | — |

Time on task is `task_end.durationMs`; turns are counted as `turn` events falling
between a task's `task_start` and `task_end` sequence numbers.

---

## Two constraints that must reach the write-up

- **Arm A runs on the deployed Unity avatar**, which is the product default — so the
  mid-year articulation results do apply to it. The cost is a one-time ~240 MB
  download. It is warmed during the information and consent screens rather than left
  to start at the first task, but a slow connection will still show, and that shows up
  in Arm A's score. The renderer is recorded per session; a participant who degraded to
  the Three.js fallback is reported separately.
- **Text-to-speech runs over the REST cascade, not the WebSocket streaming path**,
  which cannot be proxied without exposing the key. Latency figures here are not
  comparable to those in `docs/voice-latency-streaming.md`.

Both are recorded in `protocol.md` §10.

---

## Related

- `docs/report/700b_evaluation_plan.md` — the original protocol sketch, and the three
  other outstanding evaluations
- `docs/report/midyear-technical-report.md` §5 — where this sits in the remaining work
- `docs/report/rag_eval_question_set.md`, `scripts/eval/questions.js` — the labelled
  questions the study tasks are drawn from
- `docs/rag/rag-evaluation-plan.md` — the reporting discipline this study inherits
- `docs/design-system.md` — accessibility requirements, written as testable criteria
