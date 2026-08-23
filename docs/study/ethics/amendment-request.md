# Amendment Request — UAHPEC

**Approved study:** [title as approved]
**Reference:** [UAHPEC #] · **Approved:** [date]
**Principal Investigator:** Assoc. Prof. Jing Sun · **Student investigator:** Richman Tan

> Fill the four bracketed fields from the approval letter before submitting.
> **No participant may be enrolled under the changed architecture until this
> amendment is approved.** The change alters what participants are consenting
> to, so proceeding on the existing approval would place the sessions outside it.

---

## 1. Summary

Since approval, the software architecture changed in a way that affects
participants directly. Two things follow from it:

1. **Participant text is now sent to two overseas service providers by the
   research team.** It previously was not.
2. **Conversations are now stored on a server** rather than only in the
   participant's own browser.

Nothing about the study *design* changes: same two arms, same tasks, same
measures, same sample, same recruitment. This amendment is about data flow and
consent, not methodology.

## 2. What changed, and why

The approved design assumed the arrangement the application shipped with: each
user supplied their own OpenAI API key, held on their own device, and their
browser called the provider directly. Conversation history lived in that
browser's local storage and nowhere else.

That arrangement is unusable for the study's actual participants. Family
caregivers do not hold paid API keys, and requiring one would have excluded
everyone the study is about — so the credentials had to move to a server the
research team controls.

Two consequences follow, and neither is avoidable while the first requirement
stands:

| Then | Now |
|---|---|
| The participant's own key, on their own device; the research team was not party to the request | The research team's credentials on a server; **the research team is now the party sending participant text to the providers** |
| History in browser local storage only, lost when storage is cleared | Conversations stored server-side against an anonymous account identifier |

The second is also a product decision — an assistant that forgets everything
between visits is of limited use to a carer — but it takes effect during the
study, so it is disclosed here rather than treated as separate.

## 3. Data processors

Both are in the United States. Both receive text the participant typed or spoke.

| Processor | Receives | Retention |
|---|---|---|
| OpenAI | The question, the retrieved knowledge-base passages, and the generated answer. Audio for transcription, discarded once transcribed. | Up to 30 days for abuse monitoring unless zero-retention is enabled on the account |
| ElevenLabs | The text of the answer, to be spoken | Per the provider's terms |

Neither receives a name, email address, contact details, or the participant
code. No identifier links a request to a participant at the provider.

**To be confirmed in writing before the first session:** that the project's
accounts are not on any tier that uses submitted data to train models. This is
recorded as a prerequisite in `data-management-plan.md` §4a.

## 4. Stored conversations

Conversations are held in the project's Supabase instance, against an anonymous
account identifier issued by the authentication service. There is no sign-up,
no name and no email address; the identifier exists so a person's conversations
belong to them and to nobody else.

Access is enforced in the database by row-level security, not by application
code — a conversation row is unreadable by anyone but its owner regardless of
which part of the system asks. Study tables are separately restricted so that
the anonymous key the web application uses cannot read them at all.

Retention and destruction are unchanged: six years, then destroyed, per
University policy.

## 5. Revised consent

The approved consent form asked one optional question about keeping the
participant's conversation. That framing no longer describes the system: the
application now saves conversations as a normal part of working, which is not
something a participant can decline while using it. Presenting it as optional
would misdescribe what happens.

The revised form therefore separates two genuinely different questions:

- **Item 7 (required):** the app saves your conversations so you can return to
  them, stored against an anonymous identifier rather than your name.
- **Item 8 (required):** answering you means your words are sent to overseas
  providers, who receive no name or contact details.
- **Item 9 (optional, declining does not prevent participation):** whether the
  **researcher** may read your conversations, to check the app answered
  correctly and safely.

Item 9 preserves the substance of what the approved form asked. Items 7 and 8
are new disclosure, not new permission-seeking.

## 6. Risk assessment of the change

| Risk | Assessment |
|---|---|
| Participant text reaching a third party | Present but bounded: no identifiers travel with it, and it is the same category of content the approved study already anticipated being typed. The change is *who sends it*, not what it contains. |
| Overseas transfer | Both providers are US-based. Disclosed in all three information sheets and on the consent form. No special-category identifiers are transmitted. |
| Stored conversations increasing re-identification risk | Low. No names are collected, participants are warned on every task card not to enter identifying details, and free text is redacted at export before any analysis or quotation. |
| A participant not understanding the distinction in §5 | Addressed by asking the two questions separately and in plain language, rather than folding them into one tick. |

In the investigators' assessment the amendment does not raise the study's risk
category. It increases what must be **disclosed**, which is why it is filed
rather than absorbed.

## 7. Documents amended

| Document | Change |
|---|---|
| `consent-form.md` | Items 7 and 8 added; the transcript question renumbered to 9 and rewritten as researcher access only. PLWD short form likewise. |
| `participant-information-sheet-caregiver.md` | New "where your words go" section; conversation storage described as normal app behaviour |
| `participant-information-sheet-careworker.md` | Same |
| `participant-information-sheet-plwd.md` | Same, plain language |
| `data-management-plan.md` | §1 revised; §4a added (processors); §2 IP-address claim scoped to the application rather than the platform |
| `protocol.md` | §9 revised |

## 8. Confirmation

No other aspect of the approved study changes. The design, tasks, instruments,
sample size, recruitment route, inclusion and exclusion criteria, safeguards for
participants living with dementia, and the distress and withdrawal pathways are
all as approved.

**A second reconciliation is outstanding and is not part of this request.** The
documents in `docs/study/` were drafted independently, before it was established
that approval already existed. They must be checked line by line against the
approved versions, and where they differ **the approved versions govern**. That
is a housekeeping task for the investigators, not a change requiring the
committee's attention — but it must be completed before enrolment, and this
amendment should be read against the approved documents, not against ours.
