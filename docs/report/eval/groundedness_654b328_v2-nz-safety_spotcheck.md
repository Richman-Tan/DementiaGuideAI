# Groundedness spot-check — 654b328 / v2-nz-safety

Judge distribution this run: {"1":9,"2":23}.

> ⚠️ The "Reviewer" column below was completed by **Claude (an AI), 2026-07-17** — a
> second automated assessment against the strict rubric, using a different model
> than the gpt-4o-mini judge. It is a useful cross-check (independent
> disagreement would be a signal) but it is **NOT the human expert sign-off** the
> evaluation plan calls for. A human reviewer should still complete this before
> the judge scores are cited as validated. Recorded honestly as an AI opinion.

Reviewer agreement with the judge on this sample: **10/10.** Both "1" scores are
the judge correctly flagging an *accurate but passage-unsupported* helpline
mention (A13: "Alzheimers NZ 0800 004 001"; A28: "1737") — i.e. the strict rubric
is discriminating as intended, unlike the retired judge that scored every answer
2/2. No fabrications or contradictions found in the sample.

| id | Judge | Reviewer (AI) | Agree? | Note |
|----|-------|---------------|--------|------|
| A1  | 2 | 2 | ✓ | Sundowning strategies all traceable to S1/S5; NZ helpline reproduced from passage (which carries the corpus 0800 misattribution — see below) |
| A4  | 2 | 2 | ✓ | Sleep/wandering advice grounded in sleep + door-management passages |
| A7  | 2 | 2 | ✓ | Three-stage progression maps cleanly to the Stages passage |
| A10 | 2 | 2 | ✓ | EPA/ACP grounded; "will" is uncontroversial general knowledge |
| A13 | 1 | 1 | ✓ | "Alzheimers NZ (0800 004 001)" is accurate but not in this question's passages → correctly capped at 1 |
| A16 | 2 | 2 | ✓ | Verbal + non-verbal techniques fully grounded |
| A19 | 2 | 2 | ✓ | Every bathroom item maps to the Bathroom Fall Prevention passage |
| A22 | 2 | 2 | ✓ | Respite options + Carer Support Subsidy + Carers NZ all in passages |
| A25 | 2 | 2 | ✓ | NASC process grounded; 0800 004 001 appears in a supplied passage here |
| A28 | 1 | 1 | ✓ | "call or text 1737" accurate but passage-unsupported → correctly capped at 1 |

**Corpus issue surfaced during review (not a judge problem):** several curated
passages attribute the number **0800 004 001 to Dementia NZ**, but it is the
**Alzheimers NZ** support line. This misattribution appears in multiple chunks
(Managing Sundowning, After a Dementia Diagnosis, Asking for and Accepting Help)
and is fixed by the NZ curated rewrite.

## A1 (judge: 2 — All specific claims made in the answer are supported by the reference passages, including the strategies for managing sundowning and the contact information for local support.)
**Q:** My mother gets agitated and confused every evening around sunset. What can I do?

**Answer:**

I'm sorry to hear that your mother is experiencing agitation and confusion in the evenings. This is known as sundowning, a common challenge for people with dementia and their caregivers. It's understandable to feel concerned, but there are strategies that can help manage this behaviour.

First, maintaining a consistent daily routine can be very beneficial. When the day follows a predictable pattern, it helps the brain adapt even when memory is impaired. Try to keep activities and meals at the same time each day, and plan more demanding activities for the morning when your mother is likely to be more alert [S1][S2].

In the late afternoon and evening, ensure the home is well-lit to reduce confusing shadows, and minimize background noise and stimulation. Calming activities such as listening to gentle music, taking a slow walk, or giving a hand massage can help ease the transition into nighttime. Offering a light, nutritious snack before the sundowning period can also be helpful [S1].

If your mother becomes distressed, avoid arguing or correcting her. Instead, acknowledge her feelings and gently redirect her attention to a favourite activity or a comforting environment. If sundowning is severe or poses safety risks, it might be helpful to discuss this with her doctor. Keeping a brief diary of when sundowning occurs and what precedes it can help identify personal triggers and inform discussions with healthcare professionals [S1][S5].

Remember, you're not alone in this. You can reach out to Dementia NZ at 0800 004 001 or Alzheimer's NZ for local support and advice. They can provide additional resources and support tailored to your situation.

<details><summary>Passages</summary>

--- Redirection and De-escalation Techniques ---
Redirection involves gently guiding a person with dementia away from a distressing thought, situation, or behaviour toward something more positive — without confrontation. The NHS and dementia organisations consistently identify it as one of the most effective non-pharmacological tools available to carers.

Effective redirection requires identifying the emotion behind the behaviour rather than its literal content. A person repeatedly saying they need to go to work may be expressing a need for purpose and structure, not a literal desire to commute. Address the feeling: "It sounds like you want to feel useful — would you help me with this?" followed by a meaningful activity.

Do not argue, correct, or reason logically with a person who is in emotional distress — the brain cannot easily process logical information when emotionally activated. Instead, acknowledge and validate: "I can hear you're worried. You're safe here, and I'm with you" — then gently redirect to a favourite activity, snack, piece of music, or change of environment.

Timing matters: attempt redirection when the person is beginning to escalate, not at the height of distress. If redirection fails in the moment, simply withdrawing calmly and returning in fifteen minutes — after the emotional state has had time to settle — is often the most effective approach.

Sensory distractions are particularly useful: a favourite food, a meaningful photograph, a familiar object to hold, or a piece of music can shift attention more effectively than verbal persuasion alone.

--- Managing Sundowning Behaviour ---
Sundowning refers to a pattern of increased confusion, restlessness, and agitation that worsens in the late afternoon and evening in people with dementia. While the condition affects each person differently, sundowning is one of the most widely reported and challenging caregiving experiences.

Common contributing factors include fatigue accumulated throughout the day, reduced or changing light levels that create confusing shadows, disruption to the person's internal body clock, and overstimulation earlier in the day. Maintaining a consistent daily routine is one of the most effective strategies — when the day follows a predictable pattern, the brain can adapt even when explicit memory is impaired.

Ensure the home is well-lit in the late afternoon and evening, particularly in rooms where the person spends time. Reducing background noise and stimulation from around mid-afternoon onwards, and planning more demanding activities and outings for the morning when the person is most alert, can significantly reduce the severity of sundowning.

Calming activities approaching evening — gentle music, a slow walk, or hand massage — help transition into nighttime. A light nutritious snack before the sundowning period often helps. Avoid arguing or correcting the person if they become distressed; acknowledge their feelings and gently redirect. If sundowning is severe or creating safety risks, discuss this with the person's doctor. Keeping a brief diary of when sundowning occurs and what preceded it helps identify personal triggers.

In Australia, the National Dementia Helpline (1800 100 500) provides 24/7 advice. In New Zealand, contact Dementia NZ (0800 004 001) or Alzheimer's NZ for local support.

--- Sleep Disturbances and Night-Time Management ---
Sleep problems are common in dementia and affect both the person with dementia and their carer. The NHS recommends placing a dementia-friendly clock — one that clearly shows whether it is day or night — beside the bed, so that if the person wakes they can orient themselves more easily without becoming frightened.

Good sleep hygiene is the foundation of management: keep consistent bed and wake times seven days a week, increase exposure to natural daylight during the day (a morning walk is particularly effective), and reduce caffeine and alcohol in the evening. Physical activity during the day — even gentle movement — helps reduce night-time restlessness. Avoid long daytime naps, which reduce the drive to sleep at night.

If the person wakes and is confused or distressed at night, respond calmly and reassure them. Guide them gently back to bed rather than engaging in lengthy conversation or turning on bright lights, which can stimulate wakefulness. A nightlight in the hallway between bedroom and bathroom helps the person orient themselves if they wake without becoming fully alert.

If night-time wandering is a safety concern, door alarms and stair gates can alert carers without requiring physical restraint. If sleep problems are significantly affecting the carer's health, speak with the GP — both for the person with dementia and for the carer themselves. Sleep deprivation in carers is a health issue that warrants professional attention and support.

--- Section 1. An enjoyable day ---
iSupport
for Dementia
Aotearoa-NZ

-- 114 of 232 --

End of the day: What is sundowning?
Sometimes people with dementia become more agitated,
aggressive or confused in the late afternoon or early
evening. This is often referred to as ‘sundowning’. It can be
particularly distressing for carers. The exact cause of
sundowning is not yet clear but a loss of routine might be
one of the reasons. Try to give the person something
meaningful to do at this time of day.
Let’s look at an example
Martha likes to go to a community centre every day from
12:00 until 15:00. She has lunch there and meets friends
to do activities together. At first Martha walks there by
herself but as her memory loss becomes more severe,
she cannot find her way to the centre anymore. Penny
asks another family member to take Martha to the centre
and bring her back home. This works well for a while but
eventually the family member is unable to take Martha.
Penny does not know what to do since she cannot be with
Martha every afternoon.
MODULE
4
115
It is important to respect the daily routines of the
person you care for and maintain them for as long as
possible.
When this is no longer possible, adapt the routine to the
best of your ability so that the key activities that are
important to the person with dementia are maintained
for as long as possible.

--- Section 1. An enjoyable day ---
iSupport
for Dementia
Aotearoa-NZ

-- 115 of 232 --

End of the day: Sundowning
MODULE
4
116
✓ Penny could ask another family member to help Martha.
This is a good idea. If others can come on a
regular basis, this is the best solution for Martha as it
maintains her routine and adapts to Martha’s changing
abilities.
🗴🗴 Penny could tell her mother to do a quiet activity in the
afternoons like watching television or listening to the
radio.
This is not likely to be a good solution at this time. It
isolates Martha from other people and doesn’t allow her
to engage in the activities that she enjoys. It might be a
better solution in the later stages of dementia, when
Martha’s abilities change.
Maintaining activities and interests outside the house.
✓ Penny could ask other people outside the family to walk
with Martha to the community center such as a
neighbour.
This is a good response. Family is not always
available and sometimes other people don’t know
how they can help. This is a concrete way that
Penny could ask for help.
What could Penny do?

</details>

## A4 (judge: 2 — All specific claims made in the answer are supported by the reference passages.)
**Q:** He keeps waking and wandering the house at night. How do I manage his sleep?

**Answer:**

I'm sorry to hear you're dealing with this challenging situation. It's understandable to feel concerned when someone with dementia wakes and wanders at night. Here are some strategies that might help manage his sleep and reduce night-time wandering:

1. **Establish a Consistent Routine**: Keeping a regular schedule for waking up, meals, and bedtime can help regulate his internal body clock. A consistent routine provides a sense of security and predictability, which can be comforting for someone with dementia [S4].

2. **Encourage Daytime Activity**: Physical activity during the day, such as a morning walk or gentle exercises, can help improve sleep at night. It's also beneficial to limit daytime naps to short periods, ideally 15 to 30 minutes, to ensure he is tired enough to sleep at night [S1][S2].

3. **Create a Calming Environment**: Before bedtime, engage in relaxing activities like listening to soothing music or reading. Ensure the bedroom is comfortable and conducive to sleep — some people prefer a dark room, while others might benefit from a nightlight to prevent disorientation if they wake up [S3].

4. **Manage Night-Time Needs**: If he wakes up, check if he needs to use the bathroom or is thirsty, and assist him as needed. This might help him settle back to sleep more easily [S3].

5. **Safety Measures**: If wandering is a safety concern, consider installing door alarms or using childproof locks to alert you if he tries to leave the house. These measures can help ensure his safety without being overly restrictive [S5].

If these strategies don't help or if his sleep disturbances are significantly affecting your wellbeing, it might be helpful to discuss the situation with his GP. They can check for any underlying medical issues that might be contributing to his sleep problems and offer further advice. Remember, your health is important too, and seeking support from family, friends, or professional carers can provide you with some much-needed respite.

<details><summary>Passages</summary>

--- Managing Sundowning Behaviour ---
Sundowning refers to a pattern of increased confusion, restlessness, and agitation that worsens in the late afternoon and evening in people with dementia. While the condition affects each person differently, sundowning is one of the most widely reported and challenging caregiving experiences.

Common contributing factors include fatigue accumulated throughout the day, reduced or changing light levels that create confusing shadows, disruption to the person's internal body clock, and overstimulation earlier in the day. Maintaining a consistent daily routine is one of the most effective strategies — when the day follows a predictable pattern, the brain can adapt even when explicit memory is impaired.

Ensure the home is well-lit in the late afternoon and evening, particularly in rooms where the person spends time. Reducing background noise and stimulation from around mid-afternoon onwards, and planning more demanding activities and outings for the morning when the person is most alert, can significantly reduce the severity of sundowning.

Calming activities approaching evening — gentle music, a slow walk, or hand massage — help transition into nighttime. A light nutritious snack before the sundowning period often helps. Avoid arguing or correcting the person if they become distressed; acknowledge their feelings and gently redirect. If sundowning is severe or creating safety risks, discuss this with the person's doctor. Keeping a brief diary of when sundowning occurs and what preceded it helps identify personal triggers.

In Australia, the National Dementia Helpline (1800 100 500) provides 24/7 advice. In New Zealand, contact Dementia NZ (0800 004 001) or Alzheimer's NZ for local support.

--- Sleep Disturbances and Night-Time Management ---
Sleep problems are common in dementia and affect both the person with dementia and their carer. The NHS recommends placing a dementia-friendly clock — one that clearly shows whether it is day or night — beside the bed, so that if the person wakes they can orient themselves more easily without becoming frightened.

Good sleep hygiene is the foundation of management: keep consistent bed and wake times seven days a week, increase exposure to natural daylight during the day (a morning walk is particularly effective), and reduce caffeine and alcohol in the evening. Physical activity during the day — even gentle movement — helps reduce night-time restlessness. Avoid long daytime naps, which reduce the drive to sleep at night.

If the person wakes and is confused or distressed at night, respond calmly and reassure them. Guide them gently back to bed rather than engaging in lengthy conversation or turning on bright lights, which can stimulate wakefulness. A nightlight in the hallway between bedroom and bathroom helps the person orient themselves if they wake without becoming fully alert.

If night-time wandering is a safety concern, door alarms and stair gates can alert carers without requiring physical restraint. If sleep problems are significantly affecting the carer's health, speak with the GP — both for the person with dementia and for the carer themselves. Sleep deprivation in carers is a health issue that warrants professional attention and support.

--- Door and Exit Management for Wanderers ---
Managing exits from the home for a person with dementia who wanders requires a layered approach that balances genuine safety with dignity. Alzheimer's NZ recommends strategies that create effective barriers without creating an institutional or confining atmosphere.

A combination of measures works better than any single solution: door alarms that chime when a door is opened alert carers immediately; childproof double locks or chain locks placed above or below the person's natural eye level are often overlooked; and camouflage techniques — painting exit doors the same colour as the surrounding wall, adding a full-length mirror over an exit door, or placing a bookcase-style cover over a door — reduce the visual salience of exits.

A doorstop alarm placed under the door creates resistance and sound. Smart doorbells with smartphone alerts can notify a carer instantly when movement near the door is detected.

The motivation behind wandering should inform the approach. If the person is anxious about a family member, addressing that anxiety may reduce wandering behaviour itself. If they are bored or restless, building more structured outdoor activity into the daily routine reduces the drive to leave independently.

Ensure a safely accessible garden or outdoor area is available if possible — a fenced garden with seating and sensory interest provides appropriate outdoor access and significantly reduces the drive to seek unsanctioned exit. As a last-resort safety net, a GPS tracking device worn as a watch or pendant provides location information if other prevention measures fail.

--- Section 5. Difficulty sleeping — activity ---
activity during the day.
This is a good idea! Physical exercise during the day
may help sleep at night.
✓ Limit daytime naps to 15 to 30 minutes.
This might be a good idea. It addresses the need for
sleep during the day, but it does not prevent Rosie
from falling asleep later on.
✓ Make lunch the bigger meal of the day.
This is helpful. A light dinner makes it easier to sleep.
✓ Try to ensure that Rosie does not drink coffee or too
much fluid a few hours before going to bed.
This is a good response. Coffee, tea, or too much
liquid can keep people awake, and cause frequent
urination.
✓ Create a bedtime routine, like lowering the lights,
washing face and teeth, and changing into pajamas.
This is a good response because a routine will relax
the person living with dementia.
✓ Play soothing music before bedtime to help Rosie
sleep.
Good idea. Find relaxing activities before bed such as
listening to music together, or reading to Rosie. Too
much activity before bed can cause a person to be
stimulated and stay awake.
✓ Keep in mind that some people may require less
sleep. Generally, 6 to 8 hours sleep from 20:00 means
night waking between 2:00 to 4:00 in the morning.
This is a good response. Select a normal sleeping
time as much as possible.
Responding to sleeping difficulties.
Here are some ways Grace and Rosie may work it out:
iSupport
for Dementia
Aotearoa-NZ

-- 190 of 232 --

2. How to deal with a person with dementia who
wakes up in the middle of the night?
Let’s look at another example
It is 3:00 in the morning, Vani wakes up and starts
walking around the house. Her daughter-in-law, Geeta, is
sleeping. Vani paces throughout the house and then goes
to Geeta and wakes her up.
Vani asks: “Where are we? I want to go home”. Geeta is
upset, because she has a long day at work tomorrow.
Geeta says: “Mother, you need to go back to bed, it is
3:00 in the morning.” Vani says: “I am not sleepy.”
Geeta yells: “I can’t take this anymore.”
MODULE
5

--- Module 5. Dealing with behaviour changes — activity (Part 2) ---
iSupport
Intervention
Manual
MODULE
5
220
iSupport
Intervention
Manual
220
9 Try to understand what will help Vani sleep. Some
people prefer to keep the room dark with no television
or as little noise as possible while others prefer a
night light, soft music or a television playing.
This answer is a good one. Each person is different
and you may need to try several possible solutions
before finding one that works.
9 Give Vani a favourite object to relax (e.g. blanket or
stuffed animal).
This response is a good one. It may help Vani feel
relaxed and secure.
What can Geeta do to keep Vani from wandering at 3:00 in the morning?
9 Schedule an appointment with the doctor to find out
if there is a medical reason for her trouble sleeping
(e.g. urinary tract infection, pain, medication causing
hallucinations).
While it is not necessary to seek medical attention
every time that a person living with dementia can’t
sleep, seek advice if it worries or upsets you or the
person living with dementia.
9 Develop an activity schedule to keep Vani awake and
busy during the day.
This is a good idea. It may improve sleep at night.
3. Check your understanding
Dealing with waking in the middle of the night (1).
ANSWERS- DEALING WITH BEHAVIOUR CHANGES • Lesson 5

-- 234 of 275 --

iSupport
Intervention
Manual
MODULE
5
221
iSupport
Intervention
Manual
221
9 Encourage physical exercise during the day (e.g.
walking, stretching).
This may be helpful to improve sleep at night.
8 Tell Vani that you won’t take care of her anymore if
you are continuously woken up at night.
This is not a good response. Keep in mind that
dementia is a disease and someone with dementia
will be dependent on the care that others provide.
9 Ask if Vani has to go to the bathroom or is hungry or
thirsty. If she says “yes”, then just assist her to meet
these needs.
This is helpful. Such a break might help the person go
back to sleep.
8 Physically take hold of Vani and put her back in bed.
Never do this. Although it may be very difficult to
deal with sleeping problems, respect the dignity of
someone with dementia. Moreover, they may become
agitated or angry. It definitely will not solve the
sleeping problems.
9 Ask for help from a family member, friend or a paid
professional.
This might be helpful. Eventually, the lack of sleep
can affect any family’s ability to provide care.
Someone else can assist by giving the family member
a night or a weekend off.
ANSWERS- DEALING WITH BEHAVIOUR CHANGES • Lesson 5
3. Check your understanding (continued)
Dealing with waking in the middle of the night (1).

-- 235 of 275 --

</details>

## A7 (judge: 2 — All specific claims about the stages of dementia and their characteristics are supported by the reference passages.)
**Q:** What are the different stages of dementia and what happens in each?

**Answer:**

Dementia generally progresses through three broad stages: mild (early), moderate (middle), and severe (late). It's important to remember that each person's experience with dementia is unique, and symptoms can vary widely depending on the type of dementia and individual factors [S1][S2].

In the mild (early) stage, individuals may experience memory lapses, difficulties with word-finding, occasional disorientation, and mild changes in personality or mood. Despite these challenges, many people can still manage daily activities independently with some support. This stage is crucial for planning, as the person can still participate in decisions about their future care and legal matters [S1].

As dementia progresses to the moderate (middle) stage, symptoms become more pronounced and wide-ranging. People often need help with daily tasks such as washing, dressing, and toileting. Communication difficulties, behavioural changes, and increased memory loss are common. This stage typically lasts the longest and can be particularly demanding for caregivers [S1][S2].

In the severe (late) stage, individuals require constant care. They may have significant difficulties with eating, drinking, and mobility. Communication becomes very limited, and the focus shifts to comfort and quality of life. The risk of infections, such as pneumonia, increases during this stage, and professional care is often necessary [S1].

Understanding these stages can help families plan appropriate support and anticipate future needs, ensuring that important conversations about care preferences happen before a crisis arises.

<details><summary>Passages</summary>

--- What is Alzheimer's disease? (Part 1) ---
It’s thought that two out of three people living with dementia in the UK have Alzheimer’s disease. It’s a physical illness which, as it progresses, damages a person’s brain.It starts many years before symptoms start to show. Eventually, Alzheimer’s causes so much damage to the brain that the person develops dementia – their thinking skills, memory and ability to carry out everyday tasks are reduced.Age is the biggest risk factor for Alzheimer’s, as it is for most types of dementia. This means that a person is more likely to get Alzheimer’s as they get older. Above the age of 65, a person’s risk of developing Alzheimer’s doubles about every five years.Symptoms of Alzheimer's diseaseAlzheimer’s disease affects everyone differently. For most people, Alzheimer’s disease starts in and around the part of the brain involved in memory. However, in some rarer types of dementia the disease starts in a different part of the brain and so causes a different set of symptoms. This is called ‘atypical Alzheimer’s’.The most common early symptoms include:memory problemsthinking and reasoning difficultieslanguage problemschanges to how they see and hear thingschanges in moodEarly symptoms of Alzheimer’s are mild and don’t prevent someone from doing everyday activities by themselves. This is called mild cognitive impairment (MCI).It’s often not possible at this stage to say for sure that the person’s symptoms are being caused by Alzheimer’s disease, as there could be many other causes.The symptoms of Alzheimer’s disease will get worse over time. As Alzheimer's disease progresses, a person will need increasing support with everyday living. Print and complete our symptoms checklist. Take it with you when you visit your GP to help describe your symptoms. View our symptoms checklist What causes Alzheimer's disease?The causes of Alzheimer’s disease are very complex, but one key part is the build-up of two substances inside the brain called amyloid and tau. When conditions in the brain aren’t right, these clump up and form tiny structures called plaques and tangles. These make it harder for the brain to work properly.Over time the disease causes certain parts to become smaller. It also reduces the amount of important chemicals needed to send messages around the brain.Eventually the brain struggles to cope with the damage and the person begins to have problems with memory and thinking. When it gets to the stage where these problems are making it difficult for the person to do everyday tasks that they used to do easily, this is called ‘dementia’.

--- Stages of Dementia: Mild, Moderate, and Severe ---
The Alzheimer's Society describes dementia progression in three broad stages, noting that symptoms vary significantly between individuals and types of dementia, and that the stages overlap rather than following a fixed sequence.

In the early (mild) stage, a person has symptoms that affect daily life but can still manage many things independently. Memory lapses, word-finding difficulties, occasional disorientation, and mild personality or mood changes are common. With support and adjustments, people in this stage often maintain a good quality of life. This is the most important time to undertake legal and financial planning while the person can actively participate in decisions.

In the middle (moderate) stage, symptoms become more severe and wide-ranging. The person begins to need help with more basic daily tasks — the Alzheimer's Society notes that assistance with washing, dressing, and toileting becomes necessary. Behavioural changes, communication difficulties, and increasing memory loss are characteristic. This is typically the longest stage and places the greatest demands on carers and support networks.

In the late (severe) stage, the person needs more constant care. Difficulty with eating, drinking, and moving around becomes prominent, and professional care is usually required. Communication is severely limited, and comfort-focused care becomes the priority. The risk of infections — particularly pneumonia — increases significantly in this stage.

Understanding the current stage helps families plan appropriate support, anticipate what is coming, and have important conversations about future care preferences before a crisis arises.

--- Alzheimer's Disease, Vascular Dementia, and Lewy Body Dementia ---
The Alzheimer's Society identifies over 200 types of dementia, with four being most prevalent: Alzheimer's disease, vascular dementia, dementia with Lewy bodies, and frontotemporal dementia.

Alzheimer's disease is the most common cause of dementia. Early signs include memory problems — particularly forgetting recent events — difficulties with thinking, language challenges, and perception issues. The disease progresses gradually; the person may ask the same questions repeatedly and gradually withdraw from activities.

Vascular dementia, the second most common type, results from damage to blood vessels supplying the brain — following strokes or small vessel disease. Early symptoms often include problems with planning and concentrating, and short periods of sudden confusion. Unlike Alzheimer's, which tends to progress gradually, vascular dementia may follow a "stepped" pattern — periods of stability interrupted by sudden decline.

Dementia with Lewy bodies is characterised by fluctuating alertness, detailed visual hallucinations, and problems with movement and sleep. People with Lewy body dementia require particular caution with certain medications — some antipsychotics can cause severe adverse reactions in this group.

Frontotemporal dementia (sometimes called Pick's disease) causes early changes to personality and behaviour and/or difficulties with language — memory loss is less prominent initially, which can delay diagnosis. It is more common in people under 65.

Young-onset dementia — diagnosed before age 65 — is less likely to involve memory loss as the first symptom and more likely to involve changes in behaviour, language, or personality.

--- Section 1. Types of dementia and the progression ---
iSupport
for Dementia
Aotearoa-NZ

-- 14 of 232 --

Vascular dementia
Vascular dementia occurs due to poor blood supply to the
brain. This can appear either suddenly, following a stroke, or
over time, through a series of small strokes. Some people might
develop both vascular dementia and Alzheimer's disease.
The symptoms of vascular dementia vary depending on the
parts of the brain affected. This might involve difficulties in
language and communication or in executive function, which
includes planning and making a decision.
Dementia with Lewy bodies
Dementia with Lewy bodies is similar to Alzheimer’s disease in
that it is caused by deteriorating and dying nerve cells in the
brain. It takes its name from abnormal build-ups of protein called
Lewy bodies in the nerve cells of the brain. It may account for
around 10% of all cases of dementia.
It is quite common for people who have dementia with Lewy
bodies to experience visual hallucinations, and also symptoms of
Parkinson’s disease, such as tremor, stiffness, or slow movement.
MODULE
1
15
Alzheimer’s disease
Alzheimer’s disease is the most common cause of dementia. It
affects the brain cells and nerves by disrupting the transmitters
that carry messages in the brain. This usually start in parts of
the brain which are responsible for storing memories, before
progressing to other parts. A common problem often
experienced by someone with Alzheimer's disease early on is
easily forgetting a recent event or conversation and
repetitively asking the same question. If your loved one has
Alzheimer’s disease, you might be interested to check Module 5

--- Section 1. Types of dementia and the progression ---
-- 15 of 232 --

3. What happens to people with
dementia as the disease progresses?
Every person is unique and dementia affects people differently.
No two people will develop the same difficulties in exactly the
same way. It is not just the brain damage that determines how
dementia affects someone, but also other factors including an
individual’s personality, life course, general health and
functioning, and living environment.
Do all people with dementia have memory loss?
MODULE
1
16
Dementia symptoms can range from minor memory loss or thinking
problems to severe difficulties with memory or thinking that make it
difficult to manage daily activities without help. Not all people with
dementia will have all symptoms and some of the symptoms may
only appear at one stage of the disease.
It can be helpful to view dementia progression as an increase of the
person's need for support and help in doing their day-to-
day activities.
For example, someone early in the early stages of Alzheimer's
disease might be fairly independent, but needs reminders to take
their medication, attend an appointment, or pay a bill. As the
dementia progresses, they might need more help in activities such
as dressing, washing, eating, or going to the toilet. We will talk
about ways to support people in these activities in Module 4.
Later, people with dementia might have difficulties in
communication, and changes in behaviour. They may need a lot of
support to stay connected with their family/whānau and friends.

</details>

## A10 (judge: 2 — All specific claims about legal documents, including the Enduring Power of Attorney and Advance Care Plan, are supported by the reference passages.)
**Q:** What legal documents should we sort out while she can still make decisions?

**Answer:**

It's great that you're thinking ahead about legal planning. While your loved one still has the capacity to make decisions, it's important to arrange several key documents to ensure her wishes are respected in the future.

1. **Enduring Power of Attorney (EPA)**: This is crucial for both financial and personal care decisions. An EPA for financial matters allows someone to manage her finances and property, while an EPA for personal care and welfare covers health and lifestyle decisions. These documents must be completed while she has full legal capacity and should be registered with the Public Trust or executed with a lawyer in New Zealand [S1][S3].

2. **Advance Care Plan (ACP)**: This document outlines her values, treatment preferences, and wishes for end-of-life care. It's less formal than an EPA but equally important for guiding care decisions when she can no longer communicate her wishes. Sharing this plan with her GP and other healthcare providers ensures her preferences are known and respected [S1][S4].

3. **Will**: Ensuring her will is up-to-date is also important. This document specifies how her assets should be distributed after her passing and can prevent family disputes.

4. **Emergency Support Plan**: Consider creating a plan for emergencies, detailing who to contact and what steps to take if she becomes unwell or needs immediate assistance [S4].

These steps can prevent future stress and ensure her wishes are honoured. For guidance, you can contact Dementia NZ (dementia.nz) or Alzheimer's NZ (alzheimers.org.nz) for support and advice on navigating these processes.

<details><summary>Passages</summary>

--- Advance Care Planning and Legal Documents ---
Advance care planning involves making decisions about future health care while the person with dementia still has the legal capacity to participate. Dementia NZ and dementia organisations across the region consistently emphasise that this is one of the most time-sensitive tasks following a diagnosis — and one that is too often delayed until a crisis makes it significantly harder.

Key legal documents include an Enduring Power of Attorney (EPA), which covers financial and property decisions, and an EPA for personal care and welfare, which covers health and lifestyle decisions. In New Zealand, EPAs must be completed while the person has full legal capacity and should be registered with the Public Trust or executed with a lawyer. In Australia, requirements vary by state — legal advice specific to your state or territory is important.

An Advance Care Plan is a less formal but equally important document that describes the person's values, preferences for treatment, and wishes about end-of-life care. Sharing this with the GP and other treating clinicians ensures the person's wishes guide care decisions when they can no longer speak for themselves.

Goals of care conversations should cover what matters most to the person, where they wish to be cared for, and their wishes about CPR, hospital admission, and artificial feeding in late-stage dementia. These conversations, though emotionally difficult, prevent family conflict and ensure wishes are honoured.

In New Zealand, contact Dementia NZ (dementia.nz) or Alzheimer's NZ (alzheimers.org.nz) for guidance. In Australia, contact Dementia Australia (dementia.org.au). Store documents where they can be found quickly and share them with the GP.

--- Section 4. Planning for the future ---
1. The importance of planning for the future
By planning for the future after the diagnosis, a person with
dementia can continue to play an important role in making
decisions regarding their life, such as on their treatment and
care, finances, and legal affairs.
People may want to consider changes that happens in their life,
such as who will manage their finances, what happens if they
become unwell, or if they are no longer able to drive.
This might include thinking about:
• Managing finances
• Driving
• Enduring Power of Attorney (EPA)
• Making a will
• Respite services and additional support
• Emergency support plan
• Advanced Care Plan (ACP)

--- Section 3. Supported decision-making ---
60
iSupport
for Dementia
Aotearoa-NZ

-- 60 of 232 --

You can make decisions in the best interest of a person living with
dementia by taking the following aspects into account.
● Their past and present wishes and feelings (and, in particular,
any relevant statement written when they did not have
dementia).
● Beliefs and values that may have influenced the person’s
decision when he or she did not have dementia.
● The views of anyone named by the person you care for as
someone to be consulted to help with making decisions.
● Be aware that the best interest of the person you care for is not
always the same as your own best interest or that of other
family members. In the end, it is the best interest of the person
you care for that counts, since the decision concerns them.
● Take into account that someone’s past wishes can be different
from their present ones.
Preparing for decisions
To prepare for decisions that you might have to make
for the person living with dementia it is important to:
● Gather the information you need to make
informed choices for the person as early in the
course of the disease as possible.
● Talk about decisions with your family, friends,
doctor and any others close to you to help with
decisions that are important to you both.
● Prepare instructions that accurately reflect the
wishes of the person living with dementia, such
as in an Advanced Care Plan, and inform each
other and your doctor about your preferences
and decisions concerning medical treatment.
For further information on Advanced Care
Planning, you may wish to read Planning for the
Future in Module 1.
Remember
MODULE
2

--- After a Dementia Diagnosis: Navigating the First Months ---
Dementia Australia describes the period following a dementia diagnosis as a critically important window — because the person retains legal capacity to make decisions, express wishes, and participate in planning their own care and future. Acting on several priorities in the weeks following diagnosis makes an enormous difference to future wellbeing for both the person and their family.

Legal and financial planning is the most urgent priority. While the person has capacity, arrange an Enduring Power of Attorney for both financial decisions and personal care decisions. In Australia, requirements vary by state and territory. In New Zealand, consult a lawyer or the Public Trust for EPA registration. Once capacity is lost, legal processes become significantly more complex and stressful for everyone.

Connect with support services promptly: Dementia Australia (dementia.org.au, 1800 100 500) and Dementia Support Australia (dementia.com.au) in Australia; Dementia NZ (dementia.nz, 0800 004 001) and Alzheimer's NZ (alzheimers.org.nz) in New Zealand. These organisations offer post-diagnosis navigation, information, and connection to local services.

If the person still drives, arrange a formal occupational therapy driving assessment. Ask the GP for a referral to My Aged Care (Australia) or appropriate home support services (New Zealand) to understand what funded support may be available.

A dementia diagnosis does not end a person's life — many people live well with dementia for years. Focus on what the person can still do and enjoy, and involve them in all decisions about their care and life for as long as possible.

--- Financial Assistance and Government Supports for Carers ---
Caring for a person with dementia has significant financial implications — reduced employment, costs of care services, home modifications, and eventually residential care. Understanding available supports early is essential for sustainable planning.

In Australia, key financial supports for carers include Carer Payment and Carer Allowance through Services Australia. For the person with dementia, in-home and community supports are accessed through My Aged Care (myagedcare.gov.au), including the Commonwealth Home Support Programme and Home Care Package pathways. Carer Gateway (carergateway.gov.au) provides practical planning, coaching, and respite support for carers. Financial planning advice from a licensed aged care financial adviser is strongly recommended before residential placement — fee structures are complex and early advice can significantly reduce costs.

For younger onset dementia (diagnosed under 65), NDIS pathways may apply in Australia. Dementia Australia (dementia.org.au) can help families identify the most appropriate entry point to the support system.

In New Zealand, Work and Income NZ provides carer support payments and financial assistance for eligible carers. Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) can help navigate available services and identify locally accessible support.

Arranging an Enduring Power of Attorney while the person still has legal capacity is also essential — it enables financial management decisions to be made on their behalf when they are no longer able to act independently, and is significantly harder to put in place once capacity is lost.

</details>

## A13 (judge: 1 — The assistant's mention of reaching out to support services like Alzheimers New Zealand (0800 004 001) is presented as a specific fact without support from the passages.)
**Q:** My mum says she sees people in the house who aren't there. How should I respond?

**Answer:**

It's understandable to feel concerned when your mum experiences hallucinations, but there are supportive ways to respond that can help her feel safe. First, reassure her in a calm voice, letting her know that she is safe and you are with her. This can help reduce any fear or insecurity she might be feeling [S2].

Next, consider the environment. Sometimes, shadows or reflections can contribute to these experiences. Check if there are any environmental factors, like poor lighting or patterns, that might be causing confusion, and make adjustments if necessary, such as improving lighting or removing mirrors [S2][S4].

It's important not to argue or try to convince her that what she's seeing isn't real, as this can increase distress. Instead, acknowledge her feelings and gently redirect her attention if possible. For example, you might say, "That sounds frightening. Let's go have a cup of tea together" [S4].

If these experiences are new or have suddenly worsened, it might be worth discussing them with her GP, as they could be related to changes in her health or medication [S2][S4]. Remember, you're not alone in this — reaching out to support services like Alzheimers New Zealand (0800 004 001) can provide additional guidance and reassurance.

<details><summary>Passages</summary>

--- Managing Hallucinations and Paranoia ---
Hallucinations — seeing, hearing, or sensing things that are not present — and paranoid beliefs are particularly common in dementia with Lewy bodies, as the Alzheimer's Society notes, but occur across other dementia types as well, especially in later stages.

Not all hallucinations require intervention. Some people with Lewy body dementia experience non-threatening visual hallucinations — of children, animals, or people — that do not cause distress. Only intervene if the experience is causing fear or unsafe behaviour.

Never argue against or try to disprove a hallucination or paranoid belief — this rarely works and consistently increases distress. Instead, acknowledge the emotion: "That sounds frightening. I'm here with you and you're safe."

Environmental factors often contribute to misperceptions: shadows from poor lighting, patterns on wallpaper or curtains that suggest faces, and reflections in mirrors can trigger false perceptions. Improving lighting, covering or removing mirrors, and simplifying visual patterns in the environment can reduce episodes.

Paranoid beliefs — that someone is stealing, that a family member is an imposter, or that there is danger — should be taken seriously rather than dismissed. Look for misplaced items, and keep duplicates of commonly "lost" items (reading glasses, a purse) to produce when needed. Respond to the fear underneath the accusation: "I can hear you're worried. Let's look together."

If hallucinations or delusions are causing significant distress or dangerous behaviour, speak with the person's GP — pharmacological management may be considered but requires careful specialist oversight.

--- Responding to Accusations and Mistrust ---
Accusations of stealing, lying, being an imposter, or acting with malicious intent are painful for family carers who are doing their best to help. Dementia Australia emphasises that these accusations arise from memory loss and the brain's attempt to make sense of a confusing world — the person genuinely believes what they are saying, and the accusations are not personal attacks.

The most common scenario is accusations of theft: the person hides or misplaces objects and, unable to remember doing so, concludes they have been stolen. Do not argue or try to convince the person they are wrong. Instead, remain calm and empathetic: "I understand you're worried about your purse — let's look for it together." Search with them, maintain a sense of shared problem-solving, and keep spare copies of commonly "lost" items to produce when needed.

Understanding the emotional message behind an accusation helps: "You stole from me" may mean "I am frightened and something feels wrong." Address the fear, not the accusation.

If the person believes a family member is an imposter — not recognising them despite their physical presence — do not argue about identity. Simply introduce yourself calmly ("I'm your daughter Sarah, and I'm here to help") and allow the relationship to re-establish through the warmth and consistency of the interaction over time.

Document serious or recurring accusations. If they are accompanied by sudden increased agitation or represent a significant change from baseline, raise this with the person's doctor — in some cases, escalating accusations reflect a delirium or medication change rather than the dementia itself.

--- When the Person Doesn't Recognise You ---
One of the most emotionally painful experiences in dementia caregiving is when the person no longer recognises a spouse, child, or close friend. The Alzheimer's Society emphasises that this is a symptom of brain disease — not a reflection of the strength of the relationship or what it has meant.

Not being recognised does not mean the person does not feel connection. Many people with dementia respond warmly to the care and emotional presence of people they cannot name — the relationship continues, even without explicit recognition.

Do not introduce yourself in a hurt or corrective tone ("Mum, it's me — your daughter!"). Instead, introduce yourself simply and calmly: "Hello Mum, I'm Sarah, I've come to see you." Allow the connection to re-establish through the quality of the interaction — warmth, calmness, and consistency — rather than through explicit identification. Over time, many people with dementia come to trust certain people through consistent, caring presence even without naming them.

Grief about this loss is real and legitimate. Many carers describe a form of "anticipatory grief" — mourning the loss of the relationship as it was, even while the person is still present. This experience benefits from acknowledgment and support, whether from a counsellor, a support group, or other family members who understand.

The Alzheimer's Society encourages carers to focus on the quality of the present moment rather than on what has been lost. Even without name-recognition, the person with dementia can still experience comfort, joy, and love in the interaction.

--- Section 9. Delusions and hallucinations ---
221
✔ Soothe her in a calm voice.
This is a good response because people with delusions
and hallucinations may feel frightened and insecure.
✔ Lead her away from the woman in the park.
This is a good response because it will distract her
from the young woman in the park.
🗶🗶 Directly tell the truth, harshly, to set the record
straight.
This is not a good response as it may make Betty even
more upset.
✔ Say that the young woman in the park is someone who
looks like her, but it is not her.
This is a good response because it maintains a positive
social environment.
🗶🗶 Argue with Betty that the young woman is not her
sister.
This is not a good response as it may make Betty even
more upset.
✔ Say “When we get home, you can look at pictures of
Susan and remember her”.
This is a good response because Martin addresses
the importance of her sister, without arguing that
the young woman Betty saw in the park was not her
sister.
What could Martin do?
iSupport
for Dementia
Aotearoa-NZ

-- 221 of 232 --

Seeing people that are not there.
Now let’s look at another example
Mercedes’ father Larry is living with dementia. One day, Larry is a bit restless. Suddenly, he starts to look very frightened while
staring at a corner in the room. He calls out to his daughter and says, “Do you see them talking?” He screams, “What are you doing
there?” Mercedes is so overwhelmed that she feels like running away. She thinks to herself “Dad’s illness is much worse than I
thought it was.”
MODULE
5

--- Section 9. Delusions and hallucinations ---
222
✔ Soothe him, by saying in a calm voice “You are safe, I am with you”.
This is a good response because people with delusions and hallucinations may feel frightened and insecure.
🗶🗶 Say that it is simply not true, that there are no other people in the room.
This is not a good response because arguing about what one sees or hears will not help a person experiencing delusions
or hallucinations to calm down.
✔ Check if there is anything in the environment that could be causing his hallucinations, such as shadows in the room from
the sunlight. Make changes as necessary.
This is a good response because although a person’s brain may be misinterpreting the environment there could still be
a reasonable cause for confusion.
✔ Lead him away from the room.
This is a good response because changing the environment may distract her father and end the hallucination.
What could Mercedes do?
iSupport
for Dementia
Aotearoa-NZ

-- 222 of 232 --

Things to consider if the person you care for is hearing or seeing things that are not there:
• Consider changes to the environment that may be contributing. Ideally keep their environment as familiar as
possible – don’t move furniture or possessions out of their normal place. You may also find that turning on more
lights to get rid of dark areas/shadows, and using a bright night light may help.
• Check the facts: Sometimes what we think is a fake idea or delusion may actually be true e.g. someone has been
taking their money. It is important to consider whether this may be the case.
• Check hearing and vision: Sometimes people misinterpret what they are seeing or hearing because of poor
eyesight or hearing.
• If false ideas or delusions and hallucinations start suddenly, it may be that the person with dementia has delirium.
In these cases, it is important to see the doctor. Refer to the next page for information about delirium.
• Remember that the experience for the person with dementia is very real.
Tips
MODULE
5

</details>

## A16 (judge: 2 — All specific claims made in the answer are supported by the reference passages.)
**Q:** What's the best way to talk to someone with dementia so they understand me?

**Answer:**

Communicating with someone who has dementia can be challenging, but there are effective strategies to help ensure understanding and maintain a positive connection. It's important to adapt your communication style to their current abilities, as expecting them to adapt to you can lead to frustration for both parties.

Start by speaking slowly and clearly in a calm, low-pitched voice. Use short, simple sentences that convey one idea at a time. This helps the person process what you're saying without becoming overwhelmed. Avoid open-ended questions, which can be confusing, and instead offer limited, concrete choices. For example, ask "Would you like tea or coffee?" rather than "What would you like to drink?" [S1][S2].

Face the person directly at their eye level and use their preferred name to gain and hold their attention. This shows respect and helps them focus on the conversation. If they struggle to find words, offer gentle assistance without rushing them, which helps preserve their communication confidence and dignity [S1][S2].

Non-verbal communication is also crucial. Use gestures, facial expressions, and touch to support your words. A warm, patient expression and gentle touch can convey reassurance and connection, even if the words themselves are not fully understood. Pay attention to their body language as well, as it can provide clues about how they are feeling [S4].

By making these adjustments, you can create a more supportive and effective communication environment for someone with dementia.

<details><summary>Passages</summary>

--- Effective Verbal Communication Techniques ---
Dementia Australia emphasises that effective communication with a person with dementia requires adapting to their current abilities rather than expecting them to adapt to you. As dementia progresses, word-finding, sentence processing, and the ability to follow complex instructions all decline — but connection remains possible with the right approach.

Speak slowly and clearly in a calm, low-pitched voice. Use short, simple sentences with one idea at a time. Ask one question at a time, then wait — longer than feels comfortable — for a response. Avoid open-ended questions ("What would you like to eat?") and instead offer limited, concrete choices ("Would you like soup or a sandwich?").

Face the person directly at their eye level before speaking. Use their preferred name at the start of sentences to gain and hold attention. Avoid pronouns like "he," "she," or "they" — use people's names instead. Never speak about the person to others in their presence as if they are not there.

When the person struggles to find a word, offer it gently without rushing or consistently finishing all their sentences. This preserves communication confidence and dignity. If something is not understood, rephrase it rather than simply repeating at a higher volume.

Keep sentences positive where possible — "Let's go for a walk" is more motivating than "Don't just sit there." These small adjustments in how we speak make a substantial difference to the person's ability to engage, feel respected, and maintain the sense that communication is still possible and worthwhile.

--- Non-Verbal Communication and Body Language ---
As dementia progresses and verbal communication becomes more difficult, non-verbal communication — touch, facial expression, gesture, tone of voice, posture, and eye contact — becomes increasingly important. The Alzheimer's Society notes that the emotional message of an interaction is retained far longer than the words spoken: a person may forget what was said but retain how the interaction made them feel.

Your facial expression should convey warmth, calm, and patience. Even when you are feeling frustrated, consciously adopting a relaxed, open, and gentle expression changes the quality of the interaction for both of you. Maintain comfortable eye contact at the person's level — sit or crouch down rather than standing over them.

Gentle touch on the hand or forearm conveys reassurance and connection, but remain attentive to whether the person welcomes touch — some find unexpected contact startling. Your tone of voice carries more meaning than your words alone; a soft, unhurried, warm tone reassures even when the specific words are not fully understood.

Use gesture to support verbal communication — pointing, demonstrating an action, or using pictures helps bridge gaps in language comprehension. Mirror the person's body language subtly to create a sense of connection and ease.

Music and singing — particularly songs from the person's younger years — are powerful forms of non-verbal communication that remain effective even in advanced dementia when verbal language has largely been lost. They can open connection, evoke emotional responses, and create moments of genuine engagement when other forms of communication have become very difficult.

--- Simple Language and Visual Communication Aids ---
As dementia progresses, abstract language, complex sentences, and implied meanings become increasingly difficult to process. Dementia Australia emphasises the value of adapting language and supplementing verbal communication with visual cues to make daily interactions more successful.

Use concrete, literal language: instead of "Get yourself ready," say "Put on your shirt." Avoid metaphors, sarcasm, and idioms, which are often interpreted literally and cause confusion. Write down key words or names as you speak them — this can help some people process information more effectively by combining hearing and reading.

Visual communication aids include: large-print labels on cupboards, drawers, and doors with both words and pictures; a whiteboard or notice board showing the day's planned activities; a photo of the toilet on the bathroom door; and picture menus or communication boards showing common choices and requests.

For people who have lost verbal speech but retain some literacy or symbol recognition, Augmentative and Alternative Communication (AAC) tools — ranging from low-tech picture cards to speech-generating apps — can provide an ongoing means of expression and maintain independence. A speech-language therapist can assess communication abilities and recommend the most appropriate tools.

In residential care or when multiple carers are involved, ensure that all staff know the person's communication preferences, abilities, and any specialist tools they use. A one-page communication profile — describing how the person communicates, what helps, and what does not — can make a significant difference when shared across the care team.

--- Section 2. Improving communication ---
45
🗴🗴 Raise your voice or
shout.
Raising your voice is not a respectful way to gain
attention. It may even make the person living with
dementia feel sad, frustrated or angry.
✓ Speak clearly, slowly, at a volume that is
comfortable for the person, face to face and at eye
level.
This is an appropriate way to make contact. It shows
that you are seeking contact in a respectful manner.
✓▪Touch their hand, arm or front of the shoulder.
This is a good way to attract the attention of a person
living with dementia.
✓▪Call the person living with dementia by a name that
he or she recongises.
This is a good way to attract the attention of a person
living with dementia. You might use their first name or
a nickname that was used in the past.
Below are some suggested ways to get the
attention of a person living with dementia.
iSupport
for Dementia
Aotearoa-NZ

-- 45 of 232 --

● Ask or tell the person living with dementia one
thing at a time.
● Use simple language and keep sentences short.
Avoid long and complicated sentences, focus on
one subject at a time.
● When needed, change from open-ended to closed-
ended questions that can be answered with YES or
NO.
● Make sure there are no distracting background
noises such as a television or radio, as this can
make it more difficult to focus or listen to what
someone is saying. This can be frustrating or
distressing for the person with dementia.
Often the language we use to get a message across is too
complicated. Keeping it simple will help the person you care
for understand you better.
4. Keep it simple

--- Section 2. Improving communication ---
47
John is visiting his father who has dementia. When his father
wants to describe his morning to John, he cannot find the right
words. John says to his wife in front of his father: “I have no
clue what he means!” His wife answers: “Yes, I don’t know
either. He is just like a child!”
Let's look at an example
⬛ John should not talk about his father when he is in same
the room. John could have said: “It is difficult to
understand what you mean.” In addition, he could have
asked some questions that his father could have
answered with ‘YES’ or ‘NO’. For example: “Have you
gone outside this morning?”
⬛ John and his wife could be more patient and give his
father time to find the right words.
⬛ John and his wife could ask John’s father if it is okay
when they try to guess what he wants to say.
⬛ It is important that John and his wife talk about the
difficulty with John’s father so that they can agree on
how to manage things together.
Responding with respect
Here are some ways John may be able to
respond:
iSupport
for Dementia
Aotearoa-NZ

-- 47 of 232 --

You can tell a lot from the way someone speaks and looks. For
example, if someone is smiling, you can assume that this
person is in a good mood. Keeping this in mind will help you
communicate with the person you care for.
6. Pay attention to reactions and body language
● Facial expressions and body language tell us how a
person is feeling. Other examples of body language
include fidgeting, having arms crossed or pacing.
These can give us messages about how the person
may be feeling. For example, whether the person
may be nervous, upset or anxious.
● Take notice of the responses and body language of
the person you care for. This may be a good
indication if the person is not able to express how
they are feeling with words.
● It is important to think about your own body
language when talking to a person with dementia.
● If you can’t find the words to make yourself
understood, remember that facial expressions,
pointing and gestures can help.
● But remember, the same goes for negative body
language. Sighs, hands on hips, raised eyebrows and
angry expressions will likely be picked up, so try to
be kind in your tone of voice and facial expressions.

</details>

## A19 (judge: 2 — All specific claims made in the answer are supported by the reference passages.)
**Q:** How can I make the bathroom safer to prevent falls?

**Answer:**

Making the bathroom safer for someone with dementia is crucial, as it is one of the highest-risk areas for falls. Here are some effective strategies:

1. **Install Grab Rails**: Securely mount grab rails beside the toilet, inside the bath, and in or beside the shower. These provide support and stability when sitting, standing, or moving around the bathroom [S1].

2. **Use Non-Slip Mats**: Place non-slip mats inside the bath or shower and use non-slip rugs on the bathroom floor. This helps prevent slipping on wet surfaces [S1].

3. **Shower Chair and Handheld Showerhead**: A shower chair or bath seat allows for seated showering, reducing the risk of falls. A handheld showerhead offers more control and flexibility [S1].

4. **Temperature Control**: Set the hot water thermostat to a maximum of 50°C to prevent scalding, as individuals with dementia may not recognize or react to hot water appropriately [S1].

5. **Improve Lighting**: Ensure the bathroom is well-lit at all times. Install a nightlight for night-time visits to the toilet to reduce disorientation and falls [S1].

6. **Clear Visual Cues**: Use clear signs on the toilet door to help the person find their way, especially at night. A raised toilet seat with arms can also make sitting and rising safer [S1].

7. **Footwear**: Ensure the person wears well-fitting, closed-toe, flat shoes with non-slip soles rather than loose slippers or socks alone [S1].

These modifications can significantly reduce the risk of falls and enhance safety in the bathroom. If you need further assistance, consider arranging a home safety assessment through an occupational therapist, which can often be organised via the person's GP or Alzheimer's New Zealand.

<details><summary>Passages</summary>

--- Fall Prevention Strategies in Dementia Care ---
Falls are among the most serious and frequent safety incidents in dementia care. People with dementia are at approximately two to three times greater risk of falls than cognitively intact older adults — due to gait and balance changes, reduced hazard awareness, medication side effects affecting balance and blood pressure, and dementia's direct impact on spatial orientation and reaction time. The Jockey Club Centre for Positive Ageing (JCCPA) and Dementia Australia both identify fall prevention as a priority component of safe dementia care.

A comprehensive falls risk assessment should include: a physiotherapist assessment of mobility, strength, and balance; a medication review with the GP or pharmacist, paying specific attention to drugs causing dizziness, sedation, or orthostatic hypotension (a sudden drop in blood pressure on standing); a vision check; and a thorough home hazard assessment. Any fall — even one without apparent injury — warrants medical review to check for fractures or head injury, because people with dementia may not reliably report pain.

Environmental modifications that significantly reduce fall risk include: removing loose rugs and all trip hazards from walkways; ensuring all areas of the home including outdoor paths are well-lit, particularly at night; installing grab rails beside the toilet and in the shower; using non-slip mats in the bathroom; and ensuring the person always wears well-fitting, flat-soled, non-slip enclosed shoes rather than loose slippers. A nightlight in the hallway between bedroom and bathroom is one of the single most effective interventions for preventing night-time falls.

Regular supervised physical activity specifically targeting strength, balance, and coordination — including physiotherapy-guided programmes, tai chi, and seated exercises — reduces falls risk and should be maintained for as long as possible. In Australia, physiotherapy can be accessed through a My Aged Care Home Care Package or on GP referral. In New Zealand, contact Dementia NZ (dementia.nz) or the person's GP for referral to community physiotherapy.

--- Bathroom Fall Prevention and Safety ---
The bathroom is the highest-risk room for falls in the home, and falls in people with dementia carry particular danger because impaired responses mean injuries may not be reported or recognised promptly. The NHS recommends a series of modifications that significantly reduce this risk.

Install grab rails beside the toilet, inside the bath, and inside or beside the shower — these must be professionally mounted into wall studs to safely bear weight. Non-slip mats inside the bath or shower and non-slip rugs on the bathroom floor (with non-slip backing and secured edges) reduce slipping risk. A shower chair or bath seat allows seated showering, and a handheld showerhead gives greater flexibility and control.

Set the hot water thermostat to a maximum of 50°C to prevent scalding — a person with dementia may not be able to recognise or respond appropriately to burning water. Ensure good lighting in the bathroom at all times, and install a nightlight for night-time toilet visits.

The NHS recommends using clear visual signs on the toilet door to help the person find their way, particularly at night. A raised toilet seat with arms makes sitting and rising safer. Keep the bathroom uncluttered and remove unnecessary items from the floor.

Review footwear throughout the home: the person should wear well-fitting, closed-toe, flat shoes with non-slip soles rather than loose slippers or socks alone. After any fall, arrange a medical review and, where possible, an occupational therapy home assessment.

--- Stair Safety, Signage, and Environmental Cues ---
Environmental modifications throughout the home reduce confusion, falls, and unsafe behaviour for people with dementia. The Alzheimer's Society and occupational therapists specialising in dementia recommend a comprehensive home assessment at diagnosis and as the condition progresses.

Stairs are a significant fall risk: apply non-slip treads to each step, ensure banisters are secure and ideally on both sides, and use high-contrast edge strips to make each step edge clearly visible. A stair gate at the top of the stairs may be necessary if the person regularly becomes disoriented.

Good signage uses both words and pictures: large, clearly printed labels on doors — TOILET with a picture, BEDROOM with a personalised photo, KITCHEN — help the person navigate independently. In the bathroom, colour-code hot and cold taps. Personalise the bedroom door with a meaningful photograph or familiar object so the person can identify their room.

Install motion-activated nightlights in the hallway between the bedroom and bathroom — adequate lighting at night dramatically reduces falls and disorientation. Remove large mirrors in corridors if the person is startled or distressed by their own reflection.

Clear pathways through the home of at least 90cm between furniture, remove rugs that are not securely fixed, tape down trailing cords, and eliminate trip hazards from all walkways. An occupational therapy home visit for a comprehensive safety assessment is strongly recommended and can often be arranged through the person's GP or through Alzheimer's NZ (alzheimers.org.nz) in New Zealand.

--- Section 5. Toileting and continence care ---
146
✓ Make some simple changes to the environment and
clothing, such as putting an image of a toilet on the
bathroom door, using a contrasting colour for the
toilet seat or changing Fu’s trousers to a pair of pants
that do not need a belt.
This is the best answer. People with dementia may
have difficulties finding and using the toilet, so these
changes could help Fu.
How could Zhen respond?
🗴🗴 Tell her husband that he is making trouble and
punish him by not taking him for his daily walk in
their neighbourhood.
This is not a good answer. You should never threaten
people with dementia in this way. Fu will feel
ashamed and embarrassed and this response could
cause him to become upset.
iSupport
for Dementia
Aotearoa-NZ

-- 146 of 232 --

What other factors may contribute to urinating on the floor or losing bladder control?
MODULE
4
147
Recommended solutions Contributing factors
● Direct the person you care for to the toilet
● Provide a bedside commode at night
A long distance to go to the
toilet in the house
Not being able to find the
toilet
Not enough colour contrast of
the toilet seat
Not enough lighting in the
hallway
Not enough lighting in the
toilet
● Put a picture of a toilet on the toilet door
● Replace the toilet seat with a different colour to increase the
contrast
● Provide adequate lighting in the hallway
● Provide adequate lighting in the toilet

--- Module 4. Providing everyday care (Part 11) ---
iSupport
Intervention
Manual
130
Contributing factors Recommended solutions
A long distance to go to the
toilet in the house
Public toilet that is at a distance
from the house
Not being able to find the toilet
Not enough colour contrast
of the toilet seat
Not enough lighting in the hallway
Not enough lighting in the toilet
z Direct the person you care for to the toilet
z Provide a bedside commode at night
z Use nightlights in the bedroom and the house
z Provide a commode for them to use in the house
z Put a picture of a toilet on the toilet door
z Replace the toilet seat with a different colour to increase the contrast
z Provide adequate lighting in the hallway
z Provide adequate lighting in the toilet
What other factors may contribute to urinating on the floor or losing bladder control?
Lesson 3. Toileting and continence care

-- 144 of 275 --

iSupport
Intervention
Manual
131
Contributing factors Recommended solutions
Narrow toilet doors that do not
allow the walker or wheelchair
to pass
Visual impairment
Unable to undo trousers
Forgetting what to do in the toilet
z Modify the door opening to allow a walker or wheelchair to pass
z Direct the person you care for to the toilet during the day
z Provide a bedside commode at night
z Change trousers to ones that are easily undone and removed
z Assist the person you care for to pull on and do up trousers
z Remind the person you care for of the activities they need to do
z Provide step-by-step instructions for them to use the toilet
Lesson 3. Toileting and continence care

-- 145 of 275 --

</details>

## A22 (judge: 2 — All specific claims about respite care options are supported by the reference passages.)
**Q:** I need a break. What respite care options are there for carers?

**Answer:**

It's completely understandable to feel the need for a break when caring for someone with dementia. Taking regular respite is not just beneficial but essential for maintaining your own health and wellbeing, which in turn helps you provide better care [S1].

In New Zealand, there are several respite care options available:

1. **In-home respite**: A trained care worker can come to your home to look after the person with dementia, allowing you to take a break while they remain in a familiar environment. This is often the least disruptive option for the person with dementia.

2. **Community day programmes**: These programmes offer structured activities, social interaction, and meals for several days a week. Many people with dementia enjoy these once they become accustomed to the routine.

3. **Overnight or residential respite**: This involves the person staying in an aged care facility for a period ranging from one night to several weeks. While it can be more disruptive, it provides you with a longer break to recharge.

4. **Carer support subsidy**: This financial assistance can help cover the cost of hiring a support person or accessing day centres [S2].

It's important to plan for respite care before it becomes urgently needed. Building a network of trusted relief carers and services can make it easier to access support when you need it most. For more information and assistance in finding local respite options, you can contact Dementia NZ (dementia.nz) or Carers NZ (carers.net.nz) [S1][S2].

<details><summary>Passages</summary>

--- Caregiver Burnout: Recognising and Preventing Exhaustion ---
Caregiver burnout is a state of physical, emotional, and mental exhaustion that results from the sustained demands of caring for a person with dementia. Carers Australia notes that it is extremely common — and that it is not a personal failing, but a predictable consequence of providing high-intensity care without adequate support or relief.

Warning signs include: persistent fatigue that does not improve with rest; withdrawing from friends, family, and activities you previously enjoyed; feeling hopeless or resentful; neglecting your own health needs; increasing irritability with the person you are caring for; and feeling that caregiving is endless with no prospect of relief.

Prevention requires actively accepting help — which is harder than it sounds. Many carers believe they should manage alone, or that organising support costs more energy than it saves. Research consistently shows that carers who accept help maintain their own health better and provide higher-quality care for longer.

Key strategies include: taking up all offers of respite care; attending a carer support group through Carers Australia (carersaustralia.com.au) or Carer Gateway (carergateway.gov.au); speaking with your GP if experiencing depression or anxiety — these are medical conditions that respond to treatment; accessing counselling from a psychologist with experience in carer issues; and setting realistic daily expectations.

In New Zealand, Carers NZ (carers.net.nz) offers support, guidance, and connection to local carer resources and peer networks.

--- Section 4. Planning for the future ---
-- 27 of 232 --

MODULE
1
28
Long-term residential care
In some cases, as the dementia progresses, some persons will
need more constant support, or they might have significant
medical needs which proves difficult to be provided at home.
Long-term residential care might be considered in this
situation.
Please see the Ministry of Health's website for more
information about respite support and services:
https://www.health.govt.nz/your-health/services-and-
support/disability-services/types-disability-
support/respite/respite-supports-and-services
For more information about NASC, please visit:
https://www.govt.nz/browse/health/help-in-your-
home/needs-assessment/
You may also find more information on local supports
available in your area through Alzheimers NZ's page:
https://alzheimers.org.nz/get-support/where-to-go-for-help/
6.Respite services and additional support (continued)
Here we describe some of the available respite services and support you
may consider. It is important to remember that the need of every person
with dementia and every family is different. Therefore, it is a good idea to
start talking and discussing these options early on when the person with
dementia can still talk about their wishes.
Carer support group
Meeting with other carers, who are in the same shoes as
you, might provide you with greater moral support. You can also learn
from each other's experiences. Please contact Alzheimers NZ to find
out more about available support groups around your area.
Respite
Respite means taking a break from your caring responsibilities.
There might be times when for some reason you need someone else to
take over your caring responsibilities for a temporary period. It can
be because you need to rest, to travel, or to take care of another
important matter. There are various forms of respite support and services,
for example:
- having a family/whānau/friend to come over several hours each week
- hiring a professional support person
- organising activities the person you are caring for can go to
- receiving a carer support subsidy which can help you to pay for a support
person or a day centre
- using a facility-based respite where the person you are caring for
can stay overnight.
iSupport
for Dementia
Aotearoa-NZ

--- Section 10. Putting it all together — section summary ---
228 l A well-rested carer can respond better to the needs of the person with dementia. There are available respite support and services to help you take a rest. If you want to learn more about the available support and how to access this, take a look at Section 4.

--- Respite Care Options for Family Carers ---
Regular respite is not a luxury for dementia carers — it is a clinical necessity for sustainable care. My Aged Care emphasises that taking breaks allows carers to maintain their own health, relationships, and wellbeing, which directly improves the quality of care they can provide.

Options range from a few hours to several weeks. In-home respite involves a trained care worker coming to the person's home while the carer takes time away — this is the least disruptive option for the person with dementia, as they remain in a familiar environment. Community day programmes (day centres or memory care programmes) provide structured activities, social connection, and meals several days per week; many people with dementia enjoy these once they become familiar with the routine.

Overnight or residential respite in an aged care facility gives the carer a longer break of one to four weeks. This option can be more disruptive — the person may take time to re-settle after returning home — but provides the carer with genuine recovery time.

In Australia, respite and in-home supports are accessed through My Aged Care (myagedcare.gov.au). Carer Gateway (carergateway.gov.au) provides coaching, peer support, and practical planning for carers. In New Zealand, respite and carer supports are available through Carers NZ (carers.net.nz) and local health services — Dementia NZ (dementia.nz) can assist with identifying local options.

Plan respite before it is urgently needed. In a carer health crisis, organising respite becomes significantly harder. Building a trusted network of relief carers and services before they are needed is one of the most important things a carer can do.

--- Maintaining Your Own Health While Caregiving ---
The NHS emphasises that carers who neglect their own health cannot sustain high-quality care over time. Research across multiple countries consistently shows that dementia carers are significantly more likely than non-carers to experience depression, anxiety, sleep deprivation, social isolation, and physical health problems.

Register with your GP as a carer and request a carer's assessment where available. Tell your GP that you are a full-time carer: this context is important for interpreting your symptoms and planning appropriate support. Do not cancel your own medical appointments to manage caregiving demands — this is one of the most common and most damaging carer habits.

Sleep is particularly critical: chronic sleep deprivation caused by night-time caregiving is a medical issue, not merely tiredness. Seek help with night-time supervision so you can sleep adequately. Physical activity — even 20 to 30 minutes of walking three to five times per week — significantly reduces depression and anxiety and is feasible even during intensive caregiving periods.

Maintain social connections even when it is difficult to get out. Phone calls, video calls, and brief visits sustain the relationships that provide emotional resilience. Maintain at least one activity each week that is purely for your own enjoyment.

If you are experiencing persistent sadness, tearfulness, loss of interest in activities you previously enjoyed, or feelings of hopelessness, speak with your GP. Depression in carers is extremely common, frequently unrecognised, and responds well to treatment when identified.

</details>

## A25 (judge: 2 — The assistant's answer accurately reflects the process for accessing funded home-care services in New Zealand as described in the reference passages.)
**Q:** How do I access funded home-care services in New Zealand?

**Answer:**

Accessing funded home-care services in New Zealand involves a few key steps. First, it's important to contact your GP, who can provide guidance and refer you to the Needs Assessment Service Co-ordination (NASC) team. The NASC team will conduct an assessment to determine the type of support needed and your eligibility for government-funded services [S2].

Once the assessment is completed, the NASC team will help coordinate the appropriate services based on the needs identified. These services can include personal care, household assistance, and respite care, among others. It's beneficial to start this process early, as it can take time to arrange the necessary support.

Additionally, organisations like Dementia NZ (0800 004 001) and Alzheimers NZ can assist in identifying local home support and community services that might be available in your area [S3]. They can also provide guidance on navigating the system and accessing the support you need.

<details><summary>Passages</summary>

--- Section 4. Planning for the future ---
-- 26 of 232 --

MODULE
1
27
5. Making a will
A Will is a legal document which details about how someone
wants their possessions to be distributed after their death.
Similar to EPA, it only has legal power if it is signed by the
person making it when they are still capable of understanding
what it all means.
4. Enduring Power of Attorney (EPA)
Setting up an EPA means someone can appoint a person/people
they trust to look after them and make decisions on behalf of
them if they became incapable of doing so themselves.
There are two types of EPA:
• Personal care and welfare (for decisions about medical
treatment or care). It will be enacted only when a doctor
decided the person can no longer make good, safe decisions
for themselves.
• Finances (for financial decisions, such as regarding bank
accounts, assets, property)
EPA is a legal document which has to be set up when the
person is still mentally capable. Therefore, it is important to
support the person you are caring for to seek legal support to
set this up.
If the person no longer has the mental capacity to set up an
EPA, the family has to apply to the Family Court to be allowed
to make decisions on their behalf.
For more information on EPA and Family Court, please visit:
• https://alzheimers.org.nz/get-support/living-with-
dementia/the-future-wills-epa/
• https://www.justice.govt.nz/family/powers-to-make-
decisions/the-court-and-enduring-power-of-attorney-
epa/#:~:text=An%20enduring%20power%20of%20attorney,a%
20lawyer%20or%20trustee%20corporation.
6.Respite services and additional support
In your caring journey, there might be times when you need
more support outside your whānau and friends. It might be
because you need help from someone with a specific skills, or you
and your whānau need some time to rest or to deal with an
important matter that requires someone else to care for your
loved one.
There are supports available in New Zealand from the government
or non-governmental organisations. The type of supports available
might differ from one area to another, and your GP can advise you
on this. They can provide you with information and refer you to
the Needs Assessment Service Co-ordination (NASC) team. NASC
will do an assessment to work out the type of support your loved
one and your whānau need and determine if you are eligible for
some government-funded support.
iSupport
for Dementia
Aotearoa-NZ

--- Section 4. Planning for the future ---
-- 27 of 232 --

MODULE
1
28
Long-term residential care
In some cases, as the dementia progresses, some persons will
need more constant support, or they might have significant
medical needs which proves difficult to be provided at home.
Long-term residential care might be considered in this
situation.
Please see the Ministry of Health's website for more
information about respite support and services:
https://www.health.govt.nz/your-health/services-and-
support/disability-services/types-disability-
support/respite/respite-supports-and-services
For more information about NASC, please visit:
https://www.govt.nz/browse/health/help-in-your-
home/needs-assessment/
You may also find more information on local supports
available in your area through Alzheimers NZ's page:
https://alzheimers.org.nz/get-support/where-to-go-for-help/
6.Respite services and additional support (continued)
Here we describe some of the available respite services and support you
may consider. It is important to remember that the need of every person
with dementia and every family is different. Therefore, it is a good idea to
start talking and discussing these options early on when the person with
dementia can still talk about their wishes.
Carer support group
Meeting with other carers, who are in the same shoes as
you, might provide you with greater moral support. You can also learn
from each other's experiences. Please contact Alzheimers NZ to find
out more about available support groups around your area.
Respite
Respite means taking a break from your caring responsibilities.
There might be times when for some reason you need someone else to
take over your caring responsibilities for a temporary period. It can
be because you need to rest, to travel, or to take care of another
important matter. There are various forms of respite support and services,
for example:
- having a family/whānau/friend to come over several hours each week
- hiring a professional support person
- organising activities the person you are caring for can go to
- receiving a carer support subsidy which can help you to pay for a support
person or a day centre
- using a facility-based respite where the person you are caring for
can stay overnight.
iSupport
for Dementia
Aotearoa-NZ

--- Financial Assistance and Government Supports for Carers ---
Caring for a person with dementia has significant financial implications — reduced employment, costs of care services, home modifications, and eventually residential care. Understanding available supports early is essential for sustainable planning.

In Australia, key financial supports for carers include Carer Payment and Carer Allowance through Services Australia. For the person with dementia, in-home and community supports are accessed through My Aged Care (myagedcare.gov.au), including the Commonwealth Home Support Programme and Home Care Package pathways. Carer Gateway (carergateway.gov.au) provides practical planning, coaching, and respite support for carers. Financial planning advice from a licensed aged care financial adviser is strongly recommended before residential placement — fee structures are complex and early advice can significantly reduce costs.

For younger onset dementia (diagnosed under 65), NDIS pathways may apply in Australia. Dementia Australia (dementia.org.au) can help families identify the most appropriate entry point to the support system.

In New Zealand, Work and Income NZ provides carer support payments and financial assistance for eligible carers. Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) can help navigate available services and identify locally accessible support.

Arranging an Enduring Power of Attorney while the person still has legal capacity is also essential — it enables financial management decisions to be made on their behalf when they are no longer able to act independently, and is significantly harder to put in place once capacity is lost.

--- Asking for and Accepting Help ---
One of the hardest aspects of dementia caregiving is asking for and accepting help from others. Many carers feel a sense of duty ("This is my responsibility"), pride ("I should be able to manage"), or fear of burdening others. Dementia NZ and carer organisations consistently note that carers who accept help have better health outcomes and provide better quality care for longer.

Be specific when asking for help: "Can you sit with Dad from 2 to 4 on Thursday so I can attend my appointment?" is far more effective than a vague "I need help sometimes." Keep a list of tasks that others can do — shopping, driving to appointments, lawn mowing, phone calls to navigate systems, meal preparation — that you can offer when someone volunteers.

Accept imperfect help graciously. If someone does a task differently than you would, resist correcting unless it is genuinely unsafe. Focusing on whether the outcome meets the person's needs rather than whether the method matches yours makes it easier for others to continue helping sustainably.

Consider a formal family meeting to distribute caregiving tasks fairly among siblings and other family members. Shared responsibility is more sustainable than one person carrying the full burden. Use community services — home care, day programmes, and respite — rather than trying to do everything personally.

In New Zealand, Dementia NZ (dementia.nz, 0800 004 001) can help identify local home support and community services. Carers NZ (carers.net.nz) provides practical support for carers navigating what is available in their area.

--- My Aged Care — Australia's Gateway to Funded Home and Residential Care ---
My Aged Care (myagedcare.gov.au) is the Australian Government's central access point for funded aged care services. For dementia carers, understanding the My Aged Care pathway is essential for securing funded support that can significantly improve quality of life and delay premature residential placement — but the system is complex and early engagement produces far better outcomes than last-minute crisis navigation.

The process begins with an eligibility assessment, initiated by calling My Aged Care on 1800 200 422 or registering online. A Regional Assessment Service (RAS) assessor determines eligibility for the Commonwealth Home Support Programme (CHSP) — entry-level services including domestic assistance, personal care, meals, transport, and social support provided on a co-contribution basis. For people with higher or more complex care needs, an Aged Care Assessment Team (ACAT) assessment determines eligibility for a Home Care Package (HCP), ranging from Level 1 (basic care needs) to Level 4 (high care needs, approximately $60,000 per year in funded support). For dementia, Level 3 or Level 4 packages are typically needed as the condition progresses.

Wait times for higher-level Home Care Packages can be significant. Applying as soon as care needs begin to increase — well before a crisis — prevents the gap between need and support from becoming unmanageable. Interim CHSP services can usually be arranged while waiting for a higher-level package.

For residential aged care, the ACAT assessment is also required. My Aged Care's service finder allows comparison of residential providers, understanding of fee structures, and identification of facilities with specific dementia expertise or secure memory care units. Dementia Australia (dementia.org.au, 1800 100 500) provides guidance specifically for families navigating My Aged Care for the first time, including self-advocacy and provider selection.

</details>

## A28 (judge: 1 — The assistant's mention of calling or texting 1737 for a trained counsellor is presented authoritatively without support from the passages.)
**Q:** My husband is only 58 and was just diagnosed. Where can younger people get support?

**Answer:**

I'm sorry to hear about your husband's diagnosis. It's understandable to feel overwhelmed, but there are resources available to support both of you during this time.

In New Zealand, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) offer support specifically tailored for younger onset dementia, which is when dementia is diagnosed before the age of 65. These organisations can provide guidance, resources, and connect you with local support groups that understand the unique challenges faced by younger individuals and their families [S1].

Younger onset dementia often involves different life circumstances, such as active employment, financial obligations, and children who may still be at home. It's important to seek support that addresses these specific needs. Partners and children may also benefit from psychological support to help them cope with the changes they are experiencing [S1].

Additionally, connecting with others who are in similar situations can be incredibly beneficial. Carer support groups, facilitated by organisations like Dementia NZ and Alzheimer's NZ, offer a space to share experiences, learn practical strategies, and reduce feelings of isolation [S3]. Remember, it's okay to reach out for help and take care of your own wellbeing too. If you ever need someone to talk to, you can call or text 1737 to speak with a trained counsellor.

<details><summary>Passages</summary>

--- The Dementia Diagnosis Process ---
Receiving a dementia diagnosis is often described as overwhelming, but understanding the process can reduce anxiety for the person and their family. Dementia Australia emphasises that early diagnosis, while emotionally challenging, provides access to support, time to plan, and time to access treatment.

Diagnosis typically begins with a GP visit. The doctor takes a detailed history, reviews medications (some cause reversible cognitive impairment), and performs cognitive screening tests such as the Mini-Mental State Examination (MMSE) or Montreal Cognitive Assessment (MoCA). Blood tests are ordered to rule out treatable causes including thyroid disease, vitamin B12 deficiency, and anaemia.

If dementia is suspected, the GP may refer to a specialist — a geriatrician, neurologist, or old age psychiatrist — for a more detailed assessment. This may include comprehensive neuropsychological testing, brain imaging (CT or MRI scan), and in some cases more specialised investigations.

In Australia, approximately 446,500 people are living with dementia, and dementia is now the leading cause of death for Australians. In New Zealand, tens of thousands of people live with dementia, with numbers expected to rise significantly as the population ages. Early diagnosis means earlier access to support, treatment, and the opportunity for the person to participate in planning their own care.

After a diagnosis in Australia, contact Dementia Australia (dementia.org.au, 1800 100 500) for post-diagnosis navigation and local support. In New Zealand, contact Dementia NZ (dementia.nz, 0800 004 001) or Alzheimer's NZ (alzheimers.org.nz).

--- Section 4. Involving others ---
63
iSupport
for Dementia
Aotearoa-NZ

-- 63 of 232 --

2. Types of help and support that you might need
First let’s look at an example to find out whether Li, David
and Fatima are receiving help, and if so, what kind of help.
● Li takes care of her mother who has dementia. She
receives no help from others. She spends a lot of time
taking care of her mother and feels overwhelmed. She
would like to get some help from others.
● David takes care of his wife who has dementia. David
has involved his two sisters in the care. The sisters
regularly take his wife out for shopping or help clean
the house.
● Fatima takes care of her husband who has dementia.
Fatima receives help from her family, friends and
neighbours. Some helpers assist with shopping or
cleaning the home, others take her husband for a walk
or just listen to the difficulties she has with his memory
loss.
● Friends: Mohammed is always there to listen
when I need it.
The types of help and support that Fatima receives are presented
below.
Practical help
● Family: once a month my sister helps with
cleaning the house.
● Friends: once a week my friend Hiba comes over
to help with shopping and cooking.
● Family: several family members take my husband
out for a walk on a regular basis.
Help with pleasant activities
Emotional support
Providing information
● Acquaintances/neighbours: my neighbours help to
find information on dementia.
MODULE
2

--- Section 4. Involving others ---
72
iSupport
for Dementia
Aotearoa-NZ

-- 72 of 232 --

Sometimes there may not be a friend or family/whanau member
that can provide us with help or support. Or there might be
times when you need more support than your family/whanau
and friends can provide.
In New Zealand, there are a number of government and non-
government organisations that may be able to help. The type of
support available might differ from one area to another, and
your GP can advise you on this. They can also provide you with
information and refer you to the Needs Assessment Service
Coordination (NASC) team if needed. NASC will do an assessment
to work out the type of support your loved one and
your whānau need and determine if you are eligible for some
government-funded support.
Organizations such as Alzheimer’s New Zealand also provide
support, education and information which may be of help. They
also have a list of other organisations which provide help and
support depending on what you and the person you care for need
(https://alzheimers.org.nz/get-support/where-to-go-for-help/)
MODULE
2

--- Younger Onset Dementia: Under 65 — Unique Challenges and Support ---
The Alzheimer's Society notes that dementia diagnosed before age 65 — known as young-onset or early-onset dementia — is less likely to present with memory loss as the first symptom and more likely to involve changes in behaviour, language, or personality. This atypical presentation frequently delays diagnosis, sometimes by years.

Frontotemporal dementia, which causes early personality and language changes, is proportionally more common in younger onset cases than in late-onset dementia. Genetic causes are also more likely to be relevant — genetic counselling may be appropriate for the person and their family.

The life circumstances of younger people with dementia differ substantially from those of older people: employment may be suddenly disrupted at a critical career stage; mortgages and financial obligations are typically active; children may still be at home and dependent; and the person may themselves be a carer for others. These circumstances require different support approaches from those designed primarily for older populations.

Partners of people with younger onset dementia often face sudden changes in roles, loss of a peer relationship, and the need to assume sole financial responsibility. Children in the household may need dedicated psychological support to make sense of the changes they are witnessing.

In New Zealand, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) provide support tailored to younger onset dementia. In Australia, Dementia Australia (dementia.org.au) provides dedicated resources and connection to NDIS pathways, which may apply for people diagnosed under 65.

--- Carer Support Groups and Peer Networks ---
Connecting with others who understand the experience of dementia caregiving is consistently identified by carers as one of the most valuable sources of support. Dementia Australia facilitates support groups — in-person and online — where carers can speak honestly about their experiences without fear of judgment or of burdening family members.

Key benefits of carer support groups include: normalising difficult emotions such as resentment, grief, and exhaustion; learning practical strategies from people who have navigated similar challenges; reducing social isolation, which is a significant risk factor for carer depression; and gaining a sense of community and belonging that sustains motivation over the long term.

In Australia, Dementia Australia (dementia.org.au, 1800 100 500) runs support groups and can connect carers to local options. Forward with Dementia (forwardwithdementia.au) and Dementia Support Australia (dementia.com.au) also provide resources and referrals. Carer Gateway (carergateway.gov.au) offers coaching, counselling, and connection to peer support.

In New Zealand, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) run local support programmes. Carers NZ (carers.net.nz) provides peer support, coaching, and practical assistance for family carers across the country.

The right group is one where you feel safe to speak honestly. It may take trying more than one group to find the right fit — this is expected and entirely worth the effort.

</details>
