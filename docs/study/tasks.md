# Task Sets and Scoring Rubric

Companion to `protocol.md` §4. Section 1 is participant-facing wording. Section 2
is the scorer's rubric and must not be shown to participants.

Every task is drawn from the labelled evaluation set in `scripts/eval/questions.js`
(mirrored in `docs/report/rag_eval_question_set.md`), so the expected
knowledge-base chunk is known in advance and each rubric is written against
verified corpus content rather than the scorer's impression of a good answer.

**Design rules applied to every task card**

- The card describes a **situation**, never the question to ask. Formulating the
  query is part of what is being measured; handing over the wording would measure
  typing speed instead.
- No card echoes the wording of its target chunk's title.
- Each set contains one behaviour-management, one safety and one services task, so
  neither arm draws the easier set.
- Each card carries the same standing reminder about identifying details.

---

## 1. Participant-facing task cards

> **On every card:** *Please don't type or say real names, addresses, or anything
> else that would identify you or the person you care for. Made-up names are fine.*

### Task Set 1

**Task 1.1 — Evenings are difficult**
> Imagine you are caring for someone who becomes restless, confused and upset most
> afternoons, and it gets worse as the evening goes on. By dinner time it is hard to
> settle them.
>
> Use the app to find out what you could try.

**Task 1.2 — Awake and moving at night**
> Imagine the person you care for keeps waking during the night and walking around
> the house. You are worried about them getting hurt, and you are not sleeping.
>
> Use the app to find out how to manage this.

**Task 1.3 — You need a break**
> Imagine you have been caring for someone for two years without a proper break, and
> you are exhausted. You want to know what help exists so you can have some time off.
>
> Use the app to find out what your options are in New Zealand.

### Task Set 2

**Task 2.1 — The same question, over and over**
> Imagine the person you care for asks you the same question many times an hour. You
> have answered it each time and you are starting to lose patience.
>
> Use the app to find out how to handle this.

**Task 2.2 — The bathroom feels unsafe**
> Imagine the person you care for has slipped in the bathroom twice in the past
> month. Nothing serious so far, but you want to make the room safer before something
> is.
>
> Use the app to find out what you should change.

**Task 2.3 — Wondering whether home is still the right place**
> Imagine you are starting to wonder whether you can keep caring for someone at home,
> and what would happen if you couldn't.
>
> Use the app to find out how to think about this decision and what is involved in
> New Zealand.

### Shortened set — participants living with dementia

One task per arm. Framed in the first person, gentler, and without a time pressure
cue. The support person may read the card aloud.

**Task D.1 — Sleeping at night**
> Sometimes people find it hard to sleep through the night, or wake up and feel
> unsure where they are.
>
> Have a look and see what the app suggests might help.

**Task D.2 — Finding support**
> Lots of people want to know what help is available for them and their family.
>
> Have a look and see what the app tells you about support in New Zealand.

---

## 2. Scoring rubric — **scorer only**

Scored after the session from the recorded transcript, blind to the arm where
practical (strip interface markers before scoring).

**Scale**

| Score | Definition |
|---|---|
| **Complete** | At least **3** of the 4 key points appear in the answers the participant received before they stopped |
| **Partial** | 1–2 key points |
| **Failed** | 0 key points, or the participant selected "I couldn't find it" |

Key points must appear in the answers the participant actually saw. An answer the
system gave *after* the participant ended the task does not count.

Record the participant's self-reported success (yes / partly / no) alongside the
rubric score. **Divergence between the two is a finding, not an error** — a
participant who reports success on a partial answer tells you something about
misplaced trust, which is directly relevant to a healthcare information tool.

### Task 1.1 — Evening agitation · expected chunk `caregiving_001`

1. Keep a consistent, predictable daily routine
2. Increase lighting in the late afternoon and evening / reduce confusing shadows
3. Reduce noise and stimulation from mid-afternoon; schedule demanding activities in the morning
4. Calming pre-evening activity (gentle music, slow walk, hand massage) or a light snack

*Also creditable as a 5th point:* do not argue or correct — acknowledge the feeling
and redirect; keep a diary to identify triggers; raise with the doctor if severe.

### Task 1.2 — Night waking and wandering · expected chunk `caregiving_005`

1. Sleep hygiene — consistent bed and wake times, daylight exposure during the day, avoid long naps, less caffeine and alcohol in the evening
2. A dementia-friendly day/night clock by the bed, and a nightlight between bedroom and bathroom
3. Respond calmly and guide gently back to bed; avoid bright lights and long conversation
4. Door alarms or stair gates as a safety measure rather than restraint

*Also creditable:* speak to the GP — for the person **and** for the carer; carer
sleep deprivation warrants attention in its own right.

### Task 1.3 — Respite · expected chunk `wellbeing_001`

1. The range of options — in-home respite, community day programmes, overnight or residential respite
2. Respite is arranged through a **NASC needs assessment** (funded by Health NZ – Te Whatu Ora)
3. The **Carer Support Subsidy** can help pay for a support person or day centre
4. Plan respite before it is urgently needed, rather than in a crisis

*Also creditable:* Carers NZ (carers.net.nz), local Alzheimers NZ or Dementia NZ service.

### Task 2.1 — Repeated questions · expected chunk `caregiving_002`

1. Each time genuinely feels like the first time — it is memory loss, not difficult behaviour
2. Emotional tone is retained longer than words; avoid "I already told you"
3. Respond to the feeling or need behind the question (usually reassurance) rather than its literal content
4. Practical tools — distraction and redirection, or a visual cue such as a whiteboard with the day and date

*Also creditable:* channel repetitive physical actions into a purposeful task.

### Task 2.2 — Bathroom falls · expected chunk `homesafety_002`

1. Grab rails beside the toilet, bath and shower, professionally mounted to bear weight
2. Non-slip mats and secured non-slip flooring; a shower chair or bath seat; a handheld showerhead
3. Hot water thermostat set to a maximum of **50 °C** to prevent scalding
4. Good lighting plus a nightlight for night-time visits

*Also creditable:* clear signage on the toilet door; a raised toilet seat with arms;
well-fitting closed-toe non-slip footwear; an occupational therapy home assessment
after a fall.

### Task 2.3 — Residential care · expected chunk `wellbeing_007`

1. Common triggers — care needs exceeding what can safely be provided at home, unmanageable safety risks, or the carer's own health
2. A **NASC needs assessment** determines eligibility for rest-home or hospital-level care
3. The **Residential Care Subsidy** (income- and asset-tested, via Work and Income) may cover the cost
4. Visit multiple facilities; check whether a secure dementia unit is available

*Also creditable:* involve the person while they retain capacity; settling typically
takes four to eight weeks.

### Shortened set — participants living with dementia

Not scored against a rubric. Record whether the participant reached an answer they
were satisfied with, what help they needed from the support person, and any point of
visible confusion or frustration. Reported thematically.

---

## 3. Safety watch during scoring

Two things are checked on every transcript regardless of task score, because the
study is the first time the system meets unscripted questions from real users:

1. **Automated** — `scripts/study/safety-scan-transcripts.mjs` applies the existing
   gates from `scripts/eval/safety-checks.mjs`: no foreign emergency numbers
   (000/911/999 in place of 111), no Australian services, no medication dosing, no
   system-prompt leakage.
2. **Manual** — the scorer reads every transcript for anything the automated gates
   cannot catch: a confident answer to a question the knowledge base cannot support,
   advice that should have been escalated to a clinician, or a response to a
   participant in distress.

Any hit is recorded in the results and, if it occurs during the pilot, is a
**go/no-go blocker** before real participants are enrolled.
