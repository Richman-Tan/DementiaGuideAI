# Meeting records

Notes from the project's weekly meetings with the supervisor, and the material prepared for the
meeting of 15 July 2026. They were exported on 19 October 2026 from the project's shared Google
Drive: the "Meeting notes" folder, the two documents linked from the 14 July preparation notes,
and the reference test cases those notes describe. The wording is unchanged. The formatting was
converted to Markdown, and one search-engine tracking link was removed from the 7 October entry.

The notes are brief: they record the topics raised at each meeting, not the decisions in full.
The decisions are in the evaluation plans and results (`docs/eval/`) and in the git history.

| File | What it is | Date |
|---|---|---|
| `meeting-notes-2026.md` | Running notes of the weekly supervisor meetings, 13 May to 7 October 2026. A second section records why Supabase with pgvector was chosen for the knowledge base. | 13 May to 7 Oct 2026 |
| `2026-07-14_meeting-prep.md` | Questions for the supervisor and a summary of the previous four weeks, prepared the day before the 15 July meeting | 14 Jul 2026 |
| `2026-07-14_prompt-evolution.md` | Five versions of the answer prompt (commits `310098b`, `7a72d47`, `cf13b4e`, `cff3428` and an uncommitted fifth) run on the same question and the same retrieved passages, with each answer. Linked from the preparation notes; written by JooHyun Kang. | 14 Jul 2026 |
| `2026-07-14_response-quality-test.md` | The 47-question test run of 14 July with keyword assertions (46 passed), with every question and answer. Linked from the preparation notes; written by JooHyun Kang. | 14 Jul 2026 |
| `2026-06_reference-test-cases.md` | 25 questions, each with three or four reference answers, shared with the clinical collaborators for checking. The July similarity-based test scored answers against them. | June 2026 |

The July documents describe the system as it was then, with `gpt-4o-mini` and an Australian
helpline in the prompt. The September evaluation plan (`docs/eval/evaluation-plan.md`) replaced
their tests.
