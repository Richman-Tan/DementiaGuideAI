// Dementia care knowledge base — 70 chunks, 10 per category.
// Content paraphrased from authoritative sources; see source_url per chunk.
// `embedding` is null at build time; populated at runtime from cache or API.

export const KNOWLEDGE_BASE = [
  // ─── CAREGIVING (7) ──────────────────────────────────────────────────────────
  {
    id: 'caregiving_001',
    category: 'caregiving',
    title: 'Managing Sundowning Behaviour',
    content: `Sundowning refers to a pattern of increased confusion, restlessness, and agitation that worsens in the late afternoon and evening in people with dementia. While the condition affects each person differently, sundowning is one of the most widely reported and challenging caregiving experiences.

Common contributing factors include fatigue accumulated throughout the day, reduced or changing light levels that create confusing shadows, disruption to the person's internal body clock, and overstimulation earlier in the day. Maintaining a consistent daily routine is one of the most effective strategies — when the day follows a predictable pattern, the brain can adapt even when explicit memory is impaired.

Ensure the home is well-lit in the late afternoon and evening, particularly in rooms where the person spends time. Reducing background noise and stimulation from around mid-afternoon onwards, and planning more demanding activities and outings for the morning when the person is most alert, can significantly reduce the severity of sundowning.

Calming activities approaching evening — gentle music, a slow walk, or hand massage — help transition into nighttime. A light nutritious snack before the sundowning period often helps. Avoid arguing or correcting the person if they become distressed; acknowledge their feelings and gently redirect. If sundowning is severe or creating safety risks, discuss this with the person's doctor. Keeping a brief diary of when sundowning occurs and what preceded it helps identify personal triggers.

In New Zealand, the Alzheimers NZ support line (0800 004 001) offers advice and can connect you with your local Dementia NZ or Alzheimers NZ service, and Healthline (0800 611 116) gives free 24/7 nurse advice.`,
    tags: ['sundowning', 'agitation', 'evening', 'routine', 'behaviour'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'caregiving_002',
    category: 'caregiving',
    title: 'Responding to Repetitive Questions and Actions',
    content: `Repetitive questioning and repeated actions are among the most commonly reported challenges in dementia caregiving. The Alzheimer's Society explains that memory loss means that each time a person asks a question, it genuinely feels like the first time they have asked it — they are not being difficult, they simply cannot retain the answer.

The emotional tone of a response is retained longer than the words themselves, so responding with irritation — even understandable irritation — leaves the person feeling distressed without resolving the underlying need. Phrases like "I already told you" are worth consciously avoiding.

Try to understand the feeling or need behind the question rather than its literal content. A repeated question about "going home" often reflects anxiety, discomfort, or a need for reassurance rather than a literal desire to leave. Addressing that underlying feeling — "You're safe here, and I'm with you" — is typically more effective than repeating the factual answer.

Distraction and redirection are practical tools: a favourite snack, a familiar activity, or a piece of music can gently shift attention. Visual cues like a whiteboard showing the day, date, and key information reduce some types of repetitive questioning. For repetitive physical actions such as folding and sorting, provide a purposeful task that channels the behaviour constructively — a pile of items to fold, a simple sorting activity.

Accepting that some repetition cannot be eliminated, and focusing on managing your own response calmly, is an important part of sustainable caregiving.`,
    tags: ['repetitive questioning', 'memory loss', 'patience', 'redirection', 'behaviour'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'caregiving_003',
    category: 'caregiving',
    title: 'Personal Hygiene and Bathing Assistance',
    content: `Helping someone with dementia maintain personal hygiene requires balancing safety with dignity and respect for their preferences. The NHS recommends several practical approaches that carers find effective.

Prepare everything before starting — warm the bathroom, lay out clean clothes and towels, and have everything within easy reach. A bath seat or shower chair and a handheld showerhead make seated showering safer and reduce the anxiety associated with standing. Throughout the process, reassure the person clearly: telling them "I'm not going to let you get hurt" can significantly reduce resistance.

Ask how the person would like to be helped rather than assuming, and respect their preferred method wherever safely possible. Explain each step before it happens using short, simple instructions. If the person refuses or becomes distressed, do not push — try again later or on a different day. Flexibility reduces confrontation and preserves trust.

For oral hygiene, supervise or assist with brushing using a soft-bristled toothbrush and fluoride toothpaste. Establishing a consistent routine helps — many people with dementia accept personal care more readily at the same time each day once it becomes part of a familiar pattern.

Check the skin for redness, rashes, or soreness during hygiene routines. As dementia progresses, sponge baths may become more appropriate than full showers or baths. If significant resistance to personal care continues, speak with the person's GP or a dementia support worker for further strategies.`,
    tags: ['bathing', 'hygiene', 'dignity', 'resistance', 'personal care'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'caregiving_004',
    category: 'caregiving',
    title: 'Nutrition, Hydration, and Meal Management',
    content: `Maintaining good nutrition and hydration in dementia becomes increasingly challenging as the condition progresses. The NHS recommends involving the person in meal preparation where possible, and offering foods they are known to enjoy in smaller portions — large meals can be overwhelming and reduce overall intake.

Finger foods are practical when using cutlery becomes difficult. Brightly coloured plates that contrast with the food help the person see and identify what they are eating. Reduce distractions at mealtimes — turning off the television and minimising table clutter allows the person to focus on eating. Sit at the same level as the person, allow plenty of time, and offer assistance only as needed to preserve independence and dignity.

Adequate hydration is critically important: dehydration worsens confusion and can contribute to urinary tract infections, which can cause sudden deterioration. Offer drinks regularly throughout the day, not only at mealtimes. Foods with high water content — such as watermelon and oranges — and soups also contribute to fluid intake.

Watch for signs of swallowing difficulty: coughing, choking, food collecting in the cheek, or a wet or gurgly voice after eating. If these are observed, ask the GP for a referral to a speech and language therapist, who can advise on appropriate food textures and feeding techniques. Unexplained weight loss should always be reviewed medically. In later stages, pureed or soft foods may become necessary to maintain safe and comfortable eating.`,
    tags: ['nutrition', 'hydration', 'mealtimes', 'swallowing', 'appetite', 'weight loss'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'caregiving_005',
    category: 'caregiving',
    title: 'Sleep Disturbances and Night-Time Management',
    content: `Sleep problems are common in dementia and affect both the person with dementia and their carer. The NHS recommends placing a dementia-friendly clock — one that clearly shows whether it is day or night — beside the bed, so that if the person wakes they can orient themselves more easily without becoming frightened.

Good sleep hygiene is the foundation of management: keep consistent bed and wake times seven days a week, increase exposure to natural daylight during the day (a morning walk is particularly effective), and reduce caffeine and alcohol in the evening. Physical activity during the day — even gentle movement — helps reduce night-time restlessness. Avoid long daytime naps, which reduce the drive to sleep at night.

If the person wakes and is confused or distressed at night, respond calmly and reassure them. Guide them gently back to bed rather than engaging in lengthy conversation or turning on bright lights, which can stimulate wakefulness. A nightlight in the hallway between bedroom and bathroom helps the person orient themselves if they wake without becoming fully alert.

If night-time wandering is a safety concern, door alarms and stair gates can alert carers without requiring physical restraint. If sleep problems are significantly affecting the carer's health, speak with the GP — both for the person with dementia and for the carer themselves. Sleep deprivation in carers is a health issue that warrants professional attention and support.`,
    tags: ['sleep', 'night wandering', 'insomnia', 'sleep hygiene', 'nighttime', 'disturbance'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'caregiving_006',
    category: 'caregiving',
    title: 'Managing Incontinence with Dignity',
    content: `Incontinence is common in moderate to advanced dementia and requires sensitive management that preserves the person's dignity. Dementia NZ notes that people with dementia may become incontinent not because of a physical bladder problem, but because they forget where the toilet is, cannot recognise the sensation in time, or have difficulty undoing clothing quickly enough.

The first step is ruling out treatable causes. A urinary tract infection (UTI) can cause sudden incontinence and significant cognitive worsening in someone with dementia, and warrants prompt medical attention. Constipation is another common but often overlooked cause.

Establish a regular prompted toileting routine — offer the toilet every two to three hours, after meals, and before bed, regardless of whether the person indicates a need. Clearly mark or sign the toilet door with both a picture and the word "TOILET" to help the person find it independently. The NHS also recommends using sensor lighting at night so the pathway is clearly visible. Clothing with elastic waists and minimal fastenings makes self-management easier.

Use absorbent pads or underwear discreetly as needed, choosing the most dignified option available. When accidents occur, respond calmly and matter-of-factly — no expressions of frustration or embarrassment, as the person cannot control this and emotional reactions increase shame and distress.

Keep skin clean and dry after accidents to prevent irritation and breakdown. If incontinence is worsening or causing significant difficulty, ask the GP for a referral to a continence nurse specialist who can advise on appropriate products and personalised management strategies.`,
    tags: ['incontinence', 'toileting', 'dignity', 'urinary tract infection', 'continence', 'personal care'],
    source_url: 'https://dementia.nz/about-dementia/',
    source_org: 'Dementia NZ',
    embedding: null,
  },
  {
    id: 'caregiving_007',
    category: 'caregiving',
    title: 'Establishing Daily Routine and Structure',
    content: `A predictable, structured daily routine is one of the most effective tools in dementia care. Dementia Australia emphasises that even when explicit memory is impaired, the brain can learn and adapt to consistent patterns — making daily care tasks smoother and reducing anxiety and confusion for the person with dementia.

Keep the sequence of daily activities consistent: waking, hygiene, breakfast, morning activity, lunch, rest, afternoon activity, dinner, and bedtime in the same order each day. Schedule medical appointments and more demanding activities during mid-morning when the person is typically most alert and rested. Build in meaningful activities that connect with the person's history and interests — gardening, music, simple cooking tasks, crafts, or sorting and folding — as these provide purpose and engagement without overwhelming.

Avoid over-scheduling; too many activities causes fatigue and agitation. Provide visual anchors for the day — a large-print planner, a whiteboard showing the date and planned activities, or the reliable structure of favourite television programmes at consistent times.

When the routine must change — for hospital appointments, family visits, or other disruptions — keep disruptions as brief as possible and return to the usual routine quickly. Introduce any permanent changes very gradually and expect some period of adjustment.

Share the routine with all family members and any respite carers so the person receives consistent care regardless of who is present. Dementia Australia recommends a written routine plan accessible to everyone involved in the person's care as a practical tool for coordination across multiple carers.`,
    tags: ['routine', 'structure', 'daily schedule', 'predictability', 'consistency'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },

  // ─── CLINICAL (7) ─────────────────────────────────────────────────────────────
  {
    id: 'clinical_001',
    category: 'clinical',
    title: 'Stages of Dementia: Mild, Moderate, and Severe',
    content: `The Alzheimer's Society describes dementia progression in three broad stages, noting that symptoms vary significantly between individuals and types of dementia, and that the stages overlap rather than following a fixed sequence.

In the early (mild) stage, a person has symptoms that affect daily life but can still manage many things independently. Memory lapses, word-finding difficulties, occasional disorientation, and mild personality or mood changes are common. With support and adjustments, people in this stage often maintain a good quality of life. This is the most important time to undertake legal and financial planning while the person can actively participate in decisions.

In the middle (moderate) stage, symptoms become more severe and wide-ranging. The person begins to need help with more basic daily tasks — the Alzheimer's Society notes that assistance with washing, dressing, and toileting becomes necessary. Behavioural changes, communication difficulties, and increasing memory loss are characteristic. This is typically the longest stage and places the greatest demands on carers and support networks.

In the late (severe) stage, the person needs more constant care. Difficulty with eating, drinking, and moving around becomes prominent, and professional care is usually required. Communication is severely limited, and comfort-focused care becomes the priority. The risk of infections — particularly pneumonia — increases significantly in this stage.

Understanding the current stage helps families plan appropriate support, anticipate what is coming, and have important conversations about future care preferences before a crisis arises.`,
    tags: ['stages', 'mild dementia', 'moderate dementia', 'severe dementia', 'progression', 'planning'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/how-dementia-progresses/progression-stages-dementia',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'clinical_002',
    category: 'clinical',
    title: 'Alzheimer\'s Disease, Vascular Dementia, and Lewy Body Dementia',
    content: `The Alzheimer's Society identifies over 200 types of dementia, with four being most prevalent: Alzheimer's disease, vascular dementia, dementia with Lewy bodies, and frontotemporal dementia.

Alzheimer's disease is the most common cause of dementia. Early signs include memory problems — particularly forgetting recent events — difficulties with thinking, language challenges, and perception issues. The disease progresses gradually; the person may ask the same questions repeatedly and gradually withdraw from activities.

Vascular dementia, the second most common type, results from damage to blood vessels supplying the brain — following strokes or small vessel disease. Early symptoms often include problems with planning and concentrating, and short periods of sudden confusion. Unlike Alzheimer's, which tends to progress gradually, vascular dementia may follow a "stepped" pattern — periods of stability interrupted by sudden decline.

Dementia with Lewy bodies is characterised by fluctuating alertness, detailed visual hallucinations, and problems with movement and sleep. People with Lewy body dementia require particular caution with certain medications — some antipsychotics can cause severe adverse reactions in this group.

Frontotemporal dementia (sometimes called Pick's disease) causes early changes to personality and behaviour and/or difficulties with language — memory loss is less prominent initially, which can delay diagnosis. It is more common in people under 65.

Young-onset dementia — diagnosed before age 65 — is less likely to involve memory loss as the first symptom and more likely to involve changes in behaviour, language, or personality.`,
    tags: ['Alzheimer\'s', 'vascular dementia', 'Lewy body', 'types of dementia', 'diagnosis', 'prognosis'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/types-dementia',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'clinical_003',
    category: 'clinical',
    title: 'Medications Used in Dementia: Benefits, Limits, and Side Effects',
    content: `The NHS states clearly: "there is currently no cure for dementia," but several medications can help manage symptoms for a period. Understanding what these drugs can and cannot do helps carers and families set realistic expectations.

Three acetylcholinesterase inhibitors are approved: donepezil (Aricept), rivastigmine (Exelon), and galantamine (Reminyl). These prevent the breakdown of acetylcholine, a brain chemical involved in memory and learning. They are used for Alzheimer's disease, dementia with Lewy bodies, and Parkinson's disease dementia — but not for vascular dementia or frontotemporal dementia, where they are not effective. Common side effects include nausea and appetite loss, which usually resolve within a few weeks.

Memantine works on the glutamate pathway and is used for moderate to severe Alzheimer's disease and Lewy body dementia. Temporary side effects may include headaches and dizziness.

The Alzheimer's Society notes that when these medications are effective, benefits typically last between six and twelve months before symptoms gradually worsen again, and that everyone responds differently. They do not stop, slow, or reverse the underlying disease — they may temporarily help with memory and thinking for some people.

Antipsychotic medications — such as risperidone or haloperidol — may be prescribed for severe agitation, aggression, or distress when other approaches have not worked. These carry significant risks in dementia and should only be used under specialist supervision, at the lowest effective dose, for the shortest possible duration.

Non-medication approaches including cognitive stimulation therapy, cognitive rehabilitation, and reminiscence work have good evidence for improving mood and quality of life.`,
    tags: ['donepezil', 'memantine', 'medication', 'cholinesterase inhibitor', 'antipsychotic', 'treatment'],
    source_url: 'https://www.nhs.uk/conditions/dementia/treatment/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'clinical_004',
    category: 'clinical',
    title: 'When to Seek Urgent Medical Review',
    content: `The NHS emphasises that sudden significant worsening of confusion, behaviour, or physical ability in a person with dementia should never be dismissed as "just the dementia getting worse." A rapid change — over hours or days — almost always signals a treatable physical cause requiring prompt medical attention.

The most common causes are urinary tract infections, chest infections, dehydration, constipation, uncontrolled pain, and medication side effects. This state — known as delirium superimposed on dementia — can resemble severe dementia worsening but is usually reversible with appropriate treatment.

Urgent signs requiring same-day medical assessment include: a sudden marked increase in confusion or agitation beyond the person's usual baseline; new onset fever or chills; obvious signs of pain or discomfort; a fall with concern about fracture; refusal to eat or drink for more than 24 hours; signs of infection such as redness, swelling, or wound discharge; sudden weakness, facial drooping, or speech difficulty (possible stroke); and unexplained bruising.

Keep a brief written record of what has changed and when, including the person's current medications and diagnoses. This information significantly speeds medical assessment.

Contact your GP for urgent advice or call Healthline (0800 611 116) for free 24/7 nurse guidance. In an emergency, call 111.`,
    tags: ['delirium', 'urgent', 'infection', 'sudden deterioration', 'emergency', 'medical review'],
    source_url: 'https://www.nhs.uk/conditions/dementia/symptoms/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'clinical_005',
    category: 'clinical',
    title: 'The Dementia Diagnosis Process',
    content: `Receiving a dementia diagnosis is often described as overwhelming, but understanding the process can reduce anxiety for the person and their family. Dementia Australia emphasises that early diagnosis, while emotionally challenging, provides access to support, time to plan, and time to access treatment.

Diagnosis typically begins with a GP visit. The doctor takes a detailed history, reviews medications (some cause reversible cognitive impairment), and performs cognitive screening tests such as the Mini-Mental State Examination (MMSE) or Montreal Cognitive Assessment (MoCA). Blood tests are ordered to rule out treatable causes including thyroid disease, vitamin B12 deficiency, and anaemia.

If dementia is suspected, the GP may refer to a specialist — a geriatrician, neurologist, or old age psychiatrist — for a more detailed assessment. This may include comprehensive neuropsychological testing, brain imaging (CT or MRI scan), and in some cases more specialised investigations.

In Australia, approximately 446,500 people are living with dementia, and dementia is now the leading cause of death for Australians. In New Zealand, tens of thousands of people live with dementia, with numbers expected to rise significantly as the population ages. Early diagnosis means earlier access to support, treatment, and the opportunity for the person to participate in planning their own care.

After a diagnosis in Australia, contact Dementia Australia (dementia.org.au, 1800 100 500) for post-diagnosis navigation and local support. In New Zealand, contact Alzheimers NZ (alzheimers.org.nz, 0800 004 001) or Dementia NZ (dementia.nz).`,
    tags: ['diagnosis', 'GP', 'specialist', 'cognitive testing', 'MMSE', 'MRI', 'memory clinic'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'clinical_006',
    category: 'clinical',
    title: 'Recognising and Managing Pain in People with Dementia',
    content: `Pain is frequently undertreated in people with dementia because cognitive impairment affects the ability to report pain in familiar ways. The Alzheimer's Society notes that a person with dementia may not be able to say "I am in pain" but may instead express it through changes in behaviour — increased agitation, calling out, withdrawal, grimacing, guarding a body part, resistance to care, or changes in appetite and sleep.

Before attributing behavioural changes to the dementia itself, pain should always be considered and investigated. Common pain sources include arthritis, dental problems, urinary tract infections, constipation, pressure sores, and undetected fractures from falls.

Validated observational pain assessment tools — such as the Abbey Pain Scale or PAINAD scale — are designed for people who cannot self-report. They involve observing facial expression, body language, vocalisation, and response to movement at rest and during care.

Regular scheduled paracetamol — rather than only offering pain relief when obvious distress is observed — can significantly reduce agitation in people with dementia who have known pain conditions. Research has demonstrated measurable improvements in behaviour from this approach.

Non-pharmacological pain management is also important: repositioning, gentle massage, heat or cold therapy, and addressing the underlying cause all have a role. Review all medications regularly, as some may no longer be appropriate as dementia progresses. Any new or worsening pain should be investigated medically rather than simply attributed to the dementia and managed behaviourally.`,
    tags: ['pain', 'pain assessment', 'agitation', 'non-verbal', 'Abbey Pain Scale', 'paracetamol'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'clinical_007',
    category: 'clinical',
    title: 'Advance Care Planning and Legal Documents',
    content: `Advance care planning involves making decisions about future health care while the person with dementia still has the legal capacity to participate. Dementia NZ and dementia organisations across the region consistently emphasise that this is one of the most time-sensitive tasks following a diagnosis — and one that is too often delayed until a crisis makes it significantly harder.

Key legal documents include an Enduring Power of Attorney (EPA), which covers financial and property decisions, and an EPA for personal care and welfare, which covers health and lifestyle decisions. In New Zealand, EPAs must be completed while the person has full legal capacity and should be registered with the Public Trust or executed with a lawyer. In Australia, requirements vary by state — legal advice specific to your state or territory is important.

An Advance Care Plan is a less formal but equally important document that describes the person's values, preferences for treatment, and wishes about end-of-life care. Sharing this with the GP and other treating clinicians ensures the person's wishes guide care decisions when they can no longer speak for themselves.

Goals of care conversations should cover what matters most to the person, where they wish to be cared for, and their wishes about CPR, hospital admission, and artificial feeding in late-stage dementia. These conversations, though emotionally difficult, prevent family conflict and ensure wishes are honoured.

In New Zealand, contact Dementia NZ (dementia.nz) or Alzheimer's NZ (alzheimers.org.nz) for guidance. In Australia, contact Dementia Australia (dementia.org.au). Store documents where they can be found quickly and share them with the GP.`,
    tags: ['advance care planning', 'power of attorney', 'advance directive', 'legal', 'capacity', 'end of life'],
    source_url: 'https://dementia.nz/about-dementia/',
    source_org: 'Dementia NZ',
    embedding: null,
  },

  // ─── BEST PRACTICES — BEHAVIOURAL (7) ─────────────────────────────────────────
  {
    id: 'bestpractices_001',
    category: 'best-practices',
    title: 'Handling Physical Aggression and Agitation',
    content: `Physical aggression in dementia — hitting, scratching, pushing, or biting — is distressing for carers but is almost always a form of communication. The Alzheimer's Society emphasises that the person is typically expressing fear, pain, confusion, or a reaction to care they do not understand — not deliberately causing harm.

The first step is identifying the trigger. Common triggers include pain during physical care tasks, feeling threatened during personal care, being startled, or misinterpreting what is happening. In any incident, step back and give space — never restrain unless there is immediate safety risk. Use a calm, slow voice and get to the person's eye level. Acknowledge their feelings ("You seem upset — I'm not here to hurt you") and temporarily withdraw from the care task that triggered the behaviour.

Prevention is more effective than responding after the fact. Explain care tasks step by step before beginning. Ask permission before touching. Approach from the front so you are visible. Ensure all physical needs — hunger, thirst, pain, toileting — are met before starting care tasks.

Diary-keeping after incidents helps identify patterns: the time of day, the preceding activity, and the person's physical state often reveal consistent triggers that can be proactively addressed.

If aggression escalates or results in injury, seek specialist behavioural assessment through the person's GP or dementia support team. Antipsychotic medications may be considered as an absolute last resort under specialist supervision, given their significant risks in older people with dementia.`,
    tags: ['aggression', 'agitation', 'de-escalation', 'behaviour', 'violence', 'triggers'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'bestpractices_002',
    category: 'best-practices',
    title: 'Reducing Anxiety Through Environment Design',
    content: `Dementia Australia highlights that the physical environment plays a powerful role in reducing anxiety, agitation, and confusion for people with dementia. As the brain's ability to process complex environments diminishes, thoughtful design can substantially reduce distress and challenging behaviour — often more effectively than medication.

Key principles include: reducing clutter and visual noise, which creates confusion and overstimulation; ensuring good lighting with no harsh shadows (well-lit environments reduce misperceptions and hallucinations, particularly in the late afternoon and evening); and using contrasting colours to help distinguish floors, walls, doors, and furniture.

Mark important rooms clearly — particularly the toilet — with large, simple picture signs. Keep the home layout consistent; rearranging furniture disrupts learned patterns and increases disorientation. Display family photographs, familiar objects, and items the person has always valued — these reinforce identity and provide comfort.

Sound management matters: reduce background television and radio noise, which contributes to sensory overload. Familiar music from the person's life, played at a comfortable volume, has significant calming benefits and can be used intentionally to reduce agitation.

Access to a safe outdoor space or garden has wellbeing benefits that extend beyond the physical — fresh air, natural light, and the sensory experience of being outside reduce restlessness and improve mood. If wandering is a risk, ensure the outdoor area is securely fenced. Temperature comfort also matters: people with dementia often feel cold and may not be able to communicate this — check regularly and adjust accordingly.`,
    tags: ['environment', 'design', 'anxiety', 'lighting', 'clutter', 'noise', 'sensory'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'bestpractices_003',
    category: 'best-practices',
    title: 'Redirection and De-escalation Techniques',
    content: `Redirection involves gently guiding a person with dementia away from a distressing thought, situation, or behaviour toward something more positive — without confrontation. The NHS and dementia organisations consistently identify it as one of the most effective non-pharmacological tools available to carers.

Effective redirection requires identifying the emotion behind the behaviour rather than its literal content. A person repeatedly saying they need to go to work may be expressing a need for purpose and structure, not a literal desire to commute. Address the feeling: "It sounds like you want to feel useful — would you help me with this?" followed by a meaningful activity.

Do not argue, correct, or reason logically with a person who is in emotional distress — the brain cannot easily process logical information when emotionally activated. Instead, acknowledge and validate: "I can hear you're worried. You're safe here, and I'm with you" — then gently redirect to a favourite activity, snack, piece of music, or change of environment.

Timing matters: attempt redirection when the person is beginning to escalate, not at the height of distress. If redirection fails in the moment, simply withdrawing calmly and returning in fifteen minutes — after the emotional state has had time to settle — is often the most effective approach.

Sensory distractions are particularly useful: a favourite food, a meaningful photograph, a familiar object to hold, or a piece of music can shift attention more effectively than verbal persuasion alone.`,
    tags: ['redirection', 'de-escalation', 'distraction', 'behaviour management', 'communication'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'bestpractices_004',
    category: 'best-practices',
    title: 'Managing Hallucinations and Paranoia',
    content: `Hallucinations — seeing, hearing, or sensing things that are not present — and paranoid beliefs are particularly common in dementia with Lewy bodies, as the Alzheimer's Society notes, but occur across other dementia types as well, especially in later stages.

Not all hallucinations require intervention. Some people with Lewy body dementia experience non-threatening visual hallucinations — of children, animals, or people — that do not cause distress. Only intervene if the experience is causing fear or unsafe behaviour.

Never argue against or try to disprove a hallucination or paranoid belief — this rarely works and consistently increases distress. Instead, acknowledge the emotion: "That sounds frightening. I'm here with you and you're safe."

Environmental factors often contribute to misperceptions: shadows from poor lighting, patterns on wallpaper or curtains that suggest faces, and reflections in mirrors can trigger false perceptions. Improving lighting, covering or removing mirrors, and simplifying visual patterns in the environment can reduce episodes.

Paranoid beliefs — that someone is stealing, that a family member is an imposter, or that there is danger — should be taken seriously rather than dismissed. Look for misplaced items, and keep duplicates of commonly "lost" items (reading glasses, a purse) to produce when needed. Respond to the fear underneath the accusation: "I can hear you're worried. Let's look together."

If hallucinations or delusions are causing significant distress or dangerous behaviour, speak with the person's GP — pharmacological management may be considered but requires careful specialist oversight.`,
    tags: ['hallucinations', 'paranoia', 'delusions', 'Lewy body', 'psychosis', 'behaviour'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/types-dementia',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'bestpractices_005',
    category: 'best-practices',
    title: 'Wandering Prevention and Safe-Return Strategies',
    content: `Wandering — leaving the home without a clear destination or becoming disoriented outdoors — is a significant safety concern in dementia care. It can result in exposure to traffic, extreme weather, falls, or the person being found far from home. Alzheimer's NZ and similar organisations note that understanding the cause is the starting point for effective prevention.

The person may be searching for a familiar place or person (often deceased), responding to a physical need such as hunger or needing the toilet, acting on a former daily routine like walking to work, or expressing anxiety or boredom through movement.

Prevention strategies include: ensuring physical needs are consistently met; building regular supervised outdoor activity into the daily routine to reduce restlessness; installing door alarms or motion-sensor alerts that notify carers when doors are opened; using door handle covers or locks placed above or below the person's natural line of sight; and camouflage techniques such as painting exit doors the same colour as surrounding walls.

Enrol the person in a safe-return support programme through Alzheimer's NZ (alzheimers.org.nz) or Dementia NZ (dementia.nz) in New Zealand, or Dementia Australia (dementia.org.au) in Australia. Ensure the person carries identification — a medic alert bracelet with name and contact number is practical. GPS tracking devices worn as watches or pendants are widely available and provide significant reassurance.

Inform neighbours: a note with the person's photo and a contact number means more people looking out. A safely accessible garden or outdoor area reduces the drive to leave by meeting the need for outdoor experience.`,
    tags: ['wandering', 'safe return', 'GPS', 'elopement', 'door alarm', 'safety', 'lost'],
    source_url: 'https://alzheimers.org.nz/',
    source_org: 'Alzheimer\'s NZ',
    embedding: null,
  },
  {
    id: 'bestpractices_006',
    category: 'best-practices',
    title: 'Responding to Accusations and Mistrust',
    content: `Accusations of stealing, lying, being an imposter, or acting with malicious intent are painful for family carers who are doing their best to help. Dementia Australia emphasises that these accusations arise from memory loss and the brain's attempt to make sense of a confusing world — the person genuinely believes what they are saying, and the accusations are not personal attacks.

The most common scenario is accusations of theft: the person hides or misplaces objects and, unable to remember doing so, concludes they have been stolen. Do not argue or try to convince the person they are wrong. Instead, remain calm and empathetic: "I understand you're worried about your purse — let's look for it together." Search with them, maintain a sense of shared problem-solving, and keep spare copies of commonly "lost" items to produce when needed.

Understanding the emotional message behind an accusation helps: "You stole from me" may mean "I am frightened and something feels wrong." Address the fear, not the accusation.

If the person believes a family member is an imposter — not recognising them despite their physical presence — do not argue about identity. Simply introduce yourself calmly ("I'm your daughter Sarah, and I'm here to help") and allow the relationship to re-establish through the warmth and consistency of the interaction over time.

Document serious or recurring accusations. If they are accompanied by sudden increased agitation or represent a significant change from baseline, raise this with the person's doctor — in some cases, escalating accusations reflect a delirium or medication change rather than the dementia itself.`,
    tags: ['accusations', 'mistrust', 'theft', 'imposter', 'behaviour', 'paranoia', 'family'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'bestpractices_007',
    category: 'best-practices',
    title: 'Caregiver Burnout: Recognising and Preventing Exhaustion',
    content: `Caregiver burnout is a state of physical, emotional, and mental exhaustion that results from the sustained demands of caring for a person with dementia. Carers Australia notes that it is extremely common — and that it is not a personal failing, but a predictable consequence of providing high-intensity care without adequate support or relief.

Warning signs include: persistent fatigue that does not improve with rest; withdrawing from friends, family, and activities you previously enjoyed; feeling hopeless or resentful; neglecting your own health needs; increasing irritability with the person you are caring for; and feeling that caregiving is endless with no prospect of relief.

Prevention requires actively accepting help — which is harder than it sounds. Many carers believe they should manage alone, or that organising support costs more energy than it saves. Research consistently shows that carers who accept help maintain their own health better and provide higher-quality care for longer.

Key strategies include: taking up all offers of respite care; attending a carer support group through Carers Australia (carersaustralia.com.au) or Carer Gateway (carergateway.gov.au); speaking with your GP if experiencing depression or anxiety — these are medical conditions that respond to treatment; accessing counselling from a psychologist with experience in carer issues; and setting realistic daily expectations.

In New Zealand, Carers NZ (carers.net.nz) offers support, guidance, and connection to local carer resources and peer networks.`,
    tags: ['burnout', 'caregiver stress', 'depression', 'exhaustion', 'carer wellbeing', 'self-care'],
    source_url: 'https://www.carersaustralia.com.au/information-for-carers/',
    source_org: 'Carers Australia',
    embedding: null,
  },

  // ─── COMMUNICATION (7) ────────────────────────────────────────────────────────
  {
    id: 'communication_001',
    category: 'communication',
    title: 'Effective Verbal Communication Techniques',
    content: `Dementia Australia emphasises that effective communication with a person with dementia requires adapting to their current abilities rather than expecting them to adapt to you. As dementia progresses, word-finding, sentence processing, and the ability to follow complex instructions all decline — but connection remains possible with the right approach.

Speak slowly and clearly in a calm, low-pitched voice. Use short, simple sentences with one idea at a time. Ask one question at a time, then wait — longer than feels comfortable — for a response. Avoid open-ended questions ("What would you like to eat?") and instead offer limited, concrete choices ("Would you like soup or a sandwich?").

Face the person directly at their eye level before speaking. Use their preferred name at the start of sentences to gain and hold attention. Avoid pronouns like "he," "she," or "they" — use people's names instead. Never speak about the person to others in their presence as if they are not there.

When the person struggles to find a word, offer it gently without rushing or consistently finishing all their sentences. This preserves communication confidence and dignity. If something is not understood, rephrase it rather than simply repeating at a higher volume.

Keep sentences positive where possible — "Let's go for a walk" is more motivating than "Don't just sit there." These small adjustments in how we speak make a substantial difference to the person's ability to engage, feel respected, and maintain the sense that communication is still possible and worthwhile.`,
    tags: ['verbal communication', 'language', 'speech', 'instructions', 'conversation', 'technique'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'communication_002',
    category: 'communication',
    title: 'Non-Verbal Communication and Body Language',
    content: `As dementia progresses and verbal communication becomes more difficult, non-verbal communication — touch, facial expression, gesture, tone of voice, posture, and eye contact — becomes increasingly important. The Alzheimer's Society notes that the emotional message of an interaction is retained far longer than the words spoken: a person may forget what was said but retain how the interaction made them feel.

Your facial expression should convey warmth, calm, and patience. Even when you are feeling frustrated, consciously adopting a relaxed, open, and gentle expression changes the quality of the interaction for both of you. Maintain comfortable eye contact at the person's level — sit or crouch down rather than standing over them.

Gentle touch on the hand or forearm conveys reassurance and connection, but remain attentive to whether the person welcomes touch — some find unexpected contact startling. Your tone of voice carries more meaning than your words alone; a soft, unhurried, warm tone reassures even when the specific words are not fully understood.

Use gesture to support verbal communication — pointing, demonstrating an action, or using pictures helps bridge gaps in language comprehension. Mirror the person's body language subtly to create a sense of connection and ease.

Music and singing — particularly songs from the person's younger years — are powerful forms of non-verbal communication that remain effective even in advanced dementia when verbal language has largely been lost. They can open connection, evoke emotional responses, and create moments of genuine engagement when other forms of communication have become very difficult.`,
    tags: ['non-verbal', 'body language', 'touch', 'tone of voice', 'facial expression', 'connection'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'communication_003',
    category: 'communication',
    title: 'Validation Therapy Approach',
    content: `Validation therapy, developed by Naomi Feil, is an approach to communicating with people with moderate to late-stage dementia that emphasises entering the person's subjective reality rather than correcting or reorienting them. It is widely used and recommended by organisations including Dementia NZ as a person-centred communication framework.

The core principle is that all behaviour has meaning and that feelings are valid regardless of whether their content is factually accurate. Rather than telling a person "Your mother died twenty years ago" when they are asking for her, validation therapy suggests responding to the emotion: "You're missing your mum. Tell me about her — what was she like?"

This approach acknowledges the person's feelings, reduces distress, maintains dignity, and often creates meaningful moments of connection. Key techniques include: using the person's preferred name and a warm, respectful tone; maintaining comfortable eye contact; asking open, curious questions about their experience; and responding to the emotional truth rather than the literal content of what is said.

Validation therapy is not about uncritically agreeing with everything — it is about responding to the emotional reality of the person's experience. Someone who is frightened, however irrationally, deserves to have that fear acknowledged and responded to with genuine warmth rather than argued away.

For carers, learning to respond this way rather than automatically correcting or reorienting represents an achievable but significant shift in approach — one that typically reduces distress for both the person with dementia and the carer over time.`,
    tags: ['validation therapy', 'Naomi Feil', 'therapeutic communication', 'feelings', 'empathy', 'advanced dementia'],
    source_url: 'https://dementia.nz/about-dementia/',
    source_org: 'Dementia NZ',
    embedding: null,
  },
  {
    id: 'communication_004',
    category: 'communication',
    title: 'Reminiscence Therapy and Life Review',
    content: `The NHS identifies reminiscence and life story work as an evidence-supported non-medication treatment for dementia, noting that it helps improve mood and wellbeing. This approach draws on the relative preservation of long-term memory in dementia — people often retain vivid memories of their youth and significant life events for many years after diagnosis.

Reminiscence can be informal — naturally weaving discussion of the past into daily conversation — or structured, using a life review approach with photographs, music, and meaningful objects as prompts. A personalised life story book or memory box is a particularly powerful tool: gather photographs from different decades of the person's life, objects connected to hobbies or work, music from significant eras, and items associated with cultural identity and family history.

These can be shared with professional carers, respite workers, and residential care settings so that the person's identity, history, and preferences are preserved and honoured across all care contexts. A one-page life history summary — covering key relationships, occupations, interests, significant places, and cultural background — can make a significant difference in care quality.

Benefits of reminiscence include improved mood, reduced agitation, stronger connection between the person and their carer, and maintenance of identity and self-esteem. For group reminiscence, shared historical experiences and popular culture create community and belonging.

Reminiscence is not simply an exercise in nostalgia — it is a vehicle for connection, dignity, and personhood in the present moment.`,
    tags: ['reminiscence', 'life review', 'memory', 'life story', 'long-term memory', 'connection', 'identity'],
    source_url: 'https://www.nhs.uk/conditions/dementia/treatment/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'communication_005',
    category: 'communication',
    title: 'Simple Language and Visual Communication Aids',
    content: `As dementia progresses, abstract language, complex sentences, and implied meanings become increasingly difficult to process. Dementia Australia emphasises the value of adapting language and supplementing verbal communication with visual cues to make daily interactions more successful.

Use concrete, literal language: instead of "Get yourself ready," say "Put on your shirt." Avoid metaphors, sarcasm, and idioms, which are often interpreted literally and cause confusion. Write down key words or names as you speak them — this can help some people process information more effectively by combining hearing and reading.

Visual communication aids include: large-print labels on cupboards, drawers, and doors with both words and pictures; a whiteboard or notice board showing the day's planned activities; a photo of the toilet on the bathroom door; and picture menus or communication boards showing common choices and requests.

For people who have lost verbal speech but retain some literacy or symbol recognition, Augmentative and Alternative Communication (AAC) tools — ranging from low-tech picture cards to speech-generating apps — can provide an ongoing means of expression and maintain independence. A speech-language therapist can assess communication abilities and recommend the most appropriate tools.

In residential care or when multiple carers are involved, ensure that all staff know the person's communication preferences, abilities, and any specialist tools they use. A one-page communication profile — describing how the person communicates, what helps, and what does not — can make a significant difference when shared across the care team.`,
    tags: ['visual aids', 'labels', 'picture communication', 'AAC', 'language', 'speech pathologist'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'communication_006',
    category: 'communication',
    title: 'When the Person Doesn\'t Recognise You',
    content: `One of the most emotionally painful experiences in dementia caregiving is when the person no longer recognises a spouse, child, or close friend. The Alzheimer's Society emphasises that this is a symptom of brain disease — not a reflection of the strength of the relationship or what it has meant.

Not being recognised does not mean the person does not feel connection. Many people with dementia respond warmly to the care and emotional presence of people they cannot name — the relationship continues, even without explicit recognition.

Do not introduce yourself in a hurt or corrective tone ("Mum, it's me — your daughter!"). Instead, introduce yourself simply and calmly: "Hello Mum, I'm Sarah, I've come to see you." Allow the connection to re-establish through the quality of the interaction — warmth, calmness, and consistency — rather than through explicit identification. Over time, many people with dementia come to trust certain people through consistent, caring presence even without naming them.

Grief about this loss is real and legitimate. Many carers describe a form of "anticipatory grief" — mourning the loss of the relationship as it was, even while the person is still present. This experience benefits from acknowledgment and support, whether from a counsellor, a support group, or other family members who understand.

The Alzheimer's Society encourages carers to focus on the quality of the present moment rather than on what has been lost. Even without name-recognition, the person with dementia can still experience comfort, joy, and love in the interaction.`,
    tags: ['recognition', 'identity', 'grief', 'relationship', 'imposter syndrome', 'connection'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'communication_007',
    category: 'communication',
    title: 'Communicating with Non-Verbal Patients',
    content: `In advanced dementia, the ability to use and understand spoken language may be severely reduced or absent. As the NHS notes, communication does not end at this stage — it evolves. Understanding non-verbal signals becomes the primary means of connection and care.

Signs of comfort in a person with late-stage dementia include: relaxed facial muscles, soft eyes, still or gently moving body, quiet vocalisation or sighing, and accepting touch. Signs of discomfort or distress include: furrowed brow, clenched jaw or fists, pulling away from touch, moaning, calling out, and increased muscular rigidity.

Respond to these signals attentively. Assume all communication has meaning and try to identify and address the underlying need. Introduce yourself and narrate care activities throughout — "I'm going to help you wash your face now" — even if you believe the person cannot understand the words. Hearing a familiar, calm voice provides comfort regardless of whether the language is fully comprehended.

Music — particularly songs meaningful to the person from earlier in their life — remains one of the most powerful communication tools in advanced dementia. It can evoke emotional responses and moments of genuine connection long after verbal language has faded. The NHS acknowledges music, gentle touch, and familiar sensory experiences as important in late-stage care.

Gentle touch — holding a hand, a reassuring hand on the shoulder — conveys care and presence. Familiar scents associated with the person's life can also be meaningful. In all interactions at this stage, comfort and dignity are the primary goals of care.`,
    tags: ['non-verbal', 'advanced dementia', 'late stage', 'comfort', 'pain signals', 'touch', 'music'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },

  // ─── HOME SAFETY (7) ──────────────────────────────────────────────────────────
  {
    id: 'homesafety_001',
    category: 'home-safety',
    title: 'Kitchen and Cooking Safety',
    content: `The kitchen contains significant hazards for people with dementia, and managing these risks requires a graduated approach as the condition progresses. The NHS advises carers to adapt kitchen arrangements to the person's current abilities, involving them in food preparation for as long as safely possible.

Early-stage strategies include: installing an automatic stove shut-off device or stove guard; moving cleaning products and medications to a locked cabinet; decluttering countertops and securing sharp knives; and labelling cupboards clearly with pictures and words. Cooking alongside the person — breaking tasks into simple steps such as stirring, washing vegetables, or setting the table — preserves involvement and a sense of purpose while maintaining safety.

The NHS recommends ensuring adequate hydration as part of kitchen routines: drinks should be readily available and offered regularly throughout the day, not just at mealtimes.

As the condition progresses and unsupervised kitchen use becomes unsafe, consider removing the stove knobs when the person is alone, or installing an induction cooktop that only heats when a pan is present. Check smoke detectors and carbon monoxide alarms regularly. In late-stage dementia, disconnect or disable appliances when the person is unsupervised.

When assessing kitchen safety, consider the pattern of behaviour over recent weeks rather than a single incident — increasing near-misses or forgotten food on the stove signal that greater safety measures are needed, even if no accident has yet occurred.`,
    tags: ['kitchen', 'cooking', 'stove', 'fire', 'safety', 'appliances', 'supervision'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'homesafety_002',
    category: 'home-safety',
    title: 'Bathroom Fall Prevention and Safety',
    content: `The bathroom is the highest-risk room for falls in the home, and falls in people with dementia carry particular danger because impaired responses mean injuries may not be reported or recognised promptly. The NHS recommends a series of modifications that significantly reduce this risk.

Install grab rails beside the toilet, inside the bath, and inside or beside the shower — these must be professionally mounted into wall studs to safely bear weight. Non-slip mats inside the bath or shower and non-slip rugs on the bathroom floor (with non-slip backing and secured edges) reduce slipping risk. A shower chair or bath seat allows seated showering, and a handheld showerhead gives greater flexibility and control.

Set the hot water thermostat to a maximum of 50°C to prevent scalding — a person with dementia may not be able to recognise or respond appropriately to burning water. Ensure good lighting in the bathroom at all times, and install a nightlight for night-time toilet visits.

The NHS recommends using clear visual signs on the toilet door to help the person find their way, particularly at night. A raised toilet seat with arms makes sitting and rising safer. Keep the bathroom uncluttered and remove unnecessary items from the floor.

Review footwear throughout the home: the person should wear well-fitting, closed-toe, flat shoes with non-slip soles rather than loose slippers or socks alone. After any fall, arrange a medical review and, where possible, an occupational therapy home assessment.`,
    tags: ['falls', 'bathroom', 'grab rails', 'shower chair', 'fall prevention', 'safety modifications'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'homesafety_003',
    category: 'home-safety',
    title: 'Medication Management and Safe Storage',
    content: `Medication management is a significant and often underestimated risk in dementia care. The NHS notes that people with dementia may forget to take medications, take them more than once, take someone else's medication, or mistake tablets for food or sweets.

All medications should be stored in a locked box or cabinet to prevent unsupervised access. Use a clearly labelled pill organiser filled each week by the carer or pharmacist — but supervise administration to ensure the correct dose is taken at the correct time. Blister-packed medication systems (available through most pharmacies), where each day's doses are individually sealed, make it immediately visible if a dose has been missed or taken twice.

Keep a current, accurate medication list — including drug name, dose, frequency, and prescribing doctor — accessible in the home and in the person's bag for emergency situations. This information is critical for any medical assessment, particularly in an emergency.

Review all medications at least every six months with the GP or pharmacist. Some medications appropriate at diagnosis become unsuitable as dementia progresses — reviewing the full medication list regularly avoids unnecessary risk. Never split, crush, or dissolve tablets without pharmacist advice — some slow-release formulations are dangerous if the coating is broken.

Medication reminder apps and automatic pill dispensers with alarms can supplement — but should not replace — carer supervision of medication taking. When in doubt about a missed or doubled dose, contact the pharmacist or GP rather than guessing.`,
    tags: ['medication', 'pill organiser', 'locked storage', 'medication errors', 'blister pack', 'safety'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'homesafety_004',
    category: 'home-safety',
    title: 'Fire Safety and Electrical Hazards',
    content: `Fire risk in the home increases significantly with dementia. Forgotten cooking, unattended smoking, misuse of heaters, and confusion about appliances are all common fire causes. Dementia Australia and fire services across Australia and New Zealand recommend a proactive approach.

Install interconnected smoke alarms in every room including bedrooms and the kitchen, and test them monthly. A heat-activated alarm in the kitchen provides additional safety near cooking areas. Many local fire services — including Fire and Emergency NZ (fireandemergency.nz) — offer free home safety visits and may supply or install alarms for eligible households.

If the person smokes, do not allow unsupervised smoking indoors. Remove matches, lighters, and candles from accessible areas. Use flameless LED candles where candles serve a cultural or religious purpose.

Ensure all heaters have automatic tip-over switches and are kept at least one metre from curtains and furniture. Remove the stove knobs or install a stove guard if unsupervised cooking is a safety risk.

Keep electrical cords in good repair and avoid running them under rugs. Know the home's fire escape plan — ensure the person cannot be locked in by deadlock keys that require a key to open from the inside. Store emergency contact information and a summary of the person's diagnoses and current medications near the main door so it is accessible to emergency responders. Check and replace smoke alarm batteries twice per year.`,
    tags: ['fire safety', 'smoke alarm', 'stove', 'heater', 'electrical', 'cooking', 'prevention'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'homesafety_005',
    category: 'home-safety',
    title: 'Door and Exit Management for Wanderers',
    content: `Managing exits from the home for a person with dementia who wanders requires a layered approach that balances genuine safety with dignity. Alzheimer's NZ recommends strategies that create effective barriers without creating an institutional or confining atmosphere.

A combination of measures works better than any single solution: door alarms that chime when a door is opened alert carers immediately; childproof double locks or chain locks placed above or below the person's natural eye level are often overlooked; and camouflage techniques — painting exit doors the same colour as the surrounding wall, adding a full-length mirror over an exit door, or placing a bookcase-style cover over a door — reduce the visual salience of exits.

A doorstop alarm placed under the door creates resistance and sound. Smart doorbells with smartphone alerts can notify a carer instantly when movement near the door is detected.

The motivation behind wandering should inform the approach. If the person is anxious about a family member, addressing that anxiety may reduce wandering behaviour itself. If they are bored or restless, building more structured outdoor activity into the daily routine reduces the drive to leave independently.

Ensure a safely accessible garden or outdoor area is available if possible — a fenced garden with seating and sensory interest provides appropriate outdoor access and significantly reduces the drive to seek unsanctioned exit. As a last-resort safety net, a GPS tracking device worn as a watch or pendant provides location information if other prevention measures fail.`,
    tags: ['door alarms', 'exit', 'locks', 'wandering prevention', 'GPS', 'camouflage', 'home safety'],
    source_url: 'https://alzheimers.org.nz/',
    source_org: 'Alzheimer\'s NZ',
    embedding: null,
  },
  {
    id: 'homesafety_006',
    category: 'home-safety',
    title: 'Driving and Dementia: When to Stop',
    content: `Driving cessation is one of the most emotionally charged conversations in dementia care. Dementia NZ acknowledges that for many people, driving represents independence, identity, and social connection — and that the transition requires compassion as well as clarity about safety.

Driving safely requires divided attention, rapid reaction times, spatial judgement, and rule-following — all abilities that dementia erodes progressively. A diagnosis does not automatically mean immediate cessation, but regular reassessment is essential and the period during which driving remains safe is typically limited.

Family members often notice declining driving safety before the person does: getting lost on familiar routes, difficulty at roundabouts or intersections, unexplained dents or near-misses, or confusion about road rules. If you have concerns, raise them with the person's doctor. In New Zealand, GPs have reporting obligations to the New Zealand Transport Agency (NZTA) when a medical condition may impair driving safety. A formal occupational therapy driving assessment provides an objective, independent evaluation that is more reliable than self-assessment.

Do not secretly disable the vehicle — this erodes trust and creates significant distress without addressing the underlying issue. Instead, involve the doctor in an honest, empathetic conversation with the person about safety.

Plan alternatives well before they are needed: family driving rosters, local transport options, community transport services, and taxi or rideshare accounts all support continued independence and social connection after driving ends. Acknowledge the loss with genuine empathy — it is a significant change that deserves respect.`,
    tags: ['driving', 'driving cessation', 'road safety', 'occupational therapist', 'licence', 'independence'],
    source_url: 'https://dementia.nz/about-dementia/',
    source_org: 'Dementia NZ',
    embedding: null,
  },
  {
    id: 'homesafety_007',
    category: 'home-safety',
    title: 'Stair Safety, Signage, and Environmental Cues',
    content: `Environmental modifications throughout the home reduce confusion, falls, and unsafe behaviour for people with dementia. The Alzheimer's Society and occupational therapists specialising in dementia recommend a comprehensive home assessment at diagnosis and as the condition progresses.

Stairs are a significant fall risk: apply non-slip treads to each step, ensure banisters are secure and ideally on both sides, and use high-contrast edge strips to make each step edge clearly visible. A stair gate at the top of the stairs may be necessary if the person regularly becomes disoriented.

Good signage uses both words and pictures: large, clearly printed labels on doors — TOILET with a picture, BEDROOM with a personalised photo, KITCHEN — help the person navigate independently. In the bathroom, colour-code hot and cold taps. Personalise the bedroom door with a meaningful photograph or familiar object so the person can identify their room.

Install motion-activated nightlights in the hallway between the bedroom and bathroom — adequate lighting at night dramatically reduces falls and disorientation. Remove large mirrors in corridors if the person is startled or distressed by their own reflection.

Clear pathways through the home of at least 90cm between furniture, remove rugs that are not securely fixed, tape down trailing cords, and eliminate trip hazards from all walkways. An occupational therapy home visit for a comprehensive safety assessment is strongly recommended and can often be arranged through the person's GP or through Alzheimer's NZ (alzheimers.org.nz) in New Zealand.`,
    tags: ['stairs', 'signage', 'labels', 'nightlights', 'occupational therapist', 'fall prevention', 'home modifications'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },

  // ─── CAREGIVER WELLBEING (7) ──────────────────────────────────────────────────
  {
    id: 'wellbeing_001',
    category: 'wellbeing',
    title: 'Respite Care Options for Family Carers',
    content: `Regular respite is not a luxury for dementia carers — it is a clinical necessity for sustainable care. My Aged Care emphasises that taking breaks allows carers to maintain their own health, relationships, and wellbeing, which directly improves the quality of care they can provide.

Options range from a few hours to several weeks. In-home respite involves a trained care worker coming to the person's home while the carer takes time away — this is the least disruptive option for the person with dementia, as they remain in a familiar environment. Community day programmes (day centres or memory care programmes) provide structured activities, social connection, and meals several days per week; many people with dementia enjoy these once they become familiar with the routine.

Overnight or residential respite in an aged care facility gives the carer a longer break of one to four weeks. This option can be more disruptive — the person may take time to re-settle after returning home — but provides the carer with genuine recovery time.

In Australia, respite and in-home supports are accessed through My Aged Care (myagedcare.gov.au). Carer Gateway (carergateway.gov.au) provides coaching, peer support, and practical planning for carers. In New Zealand, respite and carer supports are available through Carers NZ (carers.net.nz) and local health services — Dementia NZ (dementia.nz) can assist with identifying local options.

Plan respite before it is urgently needed. In a carer health crisis, organising respite becomes significantly harder. Building a trusted network of relief carers and services before they are needed is one of the most important things a carer can do.`,
    tags: ['respite', 'day program', 'in-home care', 'My Aged Care', 'carer support', 'relief'],
    source_url: 'https://www.myagedcare.gov.au/',
    source_org: 'My Aged Care',
    embedding: null,
  },
  {
    id: 'wellbeing_002',
    category: 'wellbeing',
    title: 'Emotional Stages of Becoming a Dementia Caregiver',
    content: `Becoming a carer for a person with dementia is a profound life transition that commonly involves a complex and shifting range of emotions. Carers Australia emphasises that there is no single right way to feel, and that many carers experience emotions cycling and recurring rather than resolving in a neat sequence.

Common emotional experiences include: shock and disbelief at the time of diagnosis; grief for the person as they were before dementia and for the future you had planned together; fear about progression, about your own capacity to cope, and about the unknown; guilt — for not doing enough, for choosing respite, for moments of anger, or for feeling relief; anger — at the disease, at the person for how they have changed, or at other family members who are not equally involved; and profound love — the most enduring motivation for most carers.

Many carers ultimately find that caregiving, despite its intensity and difficulty, becomes one of the most meaningful experiences of their lives. This does not make the hard moments less real or less valid.

These emotions are all legitimate. Seeking counselling or support group connection normalises them and prevents the social isolation that makes caregiving harder. Carers Australia (carersaustralia.com.au) provides counselling referrals and connection to local carer support groups across Australia. In New Zealand, Carers NZ (carers.net.nz) offers equivalent support, guidance, and connection to local peer networks.`,
    tags: ['grief', 'guilt', 'carer emotions', 'adjustment', 'counselling', 'support', 'wellbeing'],
    source_url: 'https://www.carersaustralia.com.au/information-for-carers/',
    source_org: 'Carers Australia',
    embedding: null,
  },
  {
    id: 'wellbeing_003',
    category: 'wellbeing',
    title: 'Carer Support Groups and Peer Networks',
    content: `Connecting with others who understand the experience of dementia caregiving is consistently identified by carers as one of the most valuable sources of support. Dementia Australia facilitates support groups — in-person and online — where carers can speak honestly about their experiences without fear of judgment or of burdening family members.

Key benefits of carer support groups include: normalising difficult emotions such as resentment, grief, and exhaustion; learning practical strategies from people who have navigated similar challenges; reducing social isolation, which is a significant risk factor for carer depression; and gaining a sense of community and belonging that sustains motivation over the long term.

In Australia, Dementia Australia (dementia.org.au, 1800 100 500) runs support groups and can connect carers to local options. Forward with Dementia (forwardwithdementia.au) and Dementia Support Australia (dementia.com.au) also provide resources and referrals. Carer Gateway (carergateway.gov.au) offers coaching, counselling, and connection to peer support.

In New Zealand, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) run local support programmes. Carers NZ (carers.net.nz) provides peer support, coaching, and practical assistance for family carers across the country.

The right group is one where you feel safe to speak honestly. It may take trying more than one group to find the right fit — this is expected and entirely worth the effort.`,
    tags: ['support group', 'peer support', 'Dementia Australia', 'Carer Gateway', 'isolation', 'community'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'wellbeing_004',
    category: 'wellbeing',
    title: 'Financial Assistance and Government Supports for Carers',
    content: `Caring for a person with dementia has significant financial implications — reduced employment, costs of care services, home modifications, and eventually residential care. Understanding available supports early is essential for sustainable planning.

In Australia, key financial supports for carers include Carer Payment and Carer Allowance through Services Australia. For the person with dementia, in-home and community supports are accessed through My Aged Care (myagedcare.gov.au), including the Commonwealth Home Support Programme and Home Care Package pathways. Carer Gateway (carergateway.gov.au) provides practical planning, coaching, and respite support for carers. Financial planning advice from a licensed aged care financial adviser is strongly recommended before residential placement — fee structures are complex and early advice can significantly reduce costs.

For younger onset dementia (diagnosed under 65), NDIS pathways may apply in Australia. Dementia Australia (dementia.org.au) can help families identify the most appropriate entry point to the support system.

In New Zealand, Work and Income NZ provides carer support payments and financial assistance for eligible carers. Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) can help navigate available services and identify locally accessible support.

Arranging an Enduring Power of Attorney while the person still has legal capacity is also essential — it enables financial management decisions to be made on their behalf when they are no longer able to act independently, and is significantly harder to put in place once capacity is lost.`,
    tags: ['financial', 'Carer Payment', 'Carer Allowance', 'My Aged Care', 'NDIS', 'Home Care Package', 'government support'],
    source_url: 'https://www.myagedcare.gov.au/',
    source_org: 'My Aged Care',
    embedding: null,
  },
  {
    id: 'wellbeing_005',
    category: 'wellbeing',
    title: 'Maintaining Your Own Health While Caregiving',
    content: `The NHS emphasises that carers who neglect their own health cannot sustain high-quality care over time. Research across multiple countries consistently shows that dementia carers are significantly more likely than non-carers to experience depression, anxiety, sleep deprivation, social isolation, and physical health problems.

Register with your GP as a carer and request a carer's assessment where available. Tell your GP that you are a full-time carer: this context is important for interpreting your symptoms and planning appropriate support. Do not cancel your own medical appointments to manage caregiving demands — this is one of the most common and most damaging carer habits.

Sleep is particularly critical: chronic sleep deprivation caused by night-time caregiving is a medical issue, not merely tiredness. Seek help with night-time supervision so you can sleep adequately. Physical activity — even 20 to 30 minutes of walking three to five times per week — significantly reduces depression and anxiety and is feasible even during intensive caregiving periods.

Maintain social connections even when it is difficult to get out. Phone calls, video calls, and brief visits sustain the relationships that provide emotional resilience. Maintain at least one activity each week that is purely for your own enjoyment.

If you are experiencing persistent sadness, tearfulness, loss of interest in activities you previously enjoyed, or feelings of hopelessness, speak with your GP. Depression in carers is extremely common, frequently unrecognised, and responds well to treatment when identified.`,
    tags: ['carer health', 'self-care', 'depression', 'GP', 'sleep', 'exercise', 'social connection'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'wellbeing_006',
    category: 'wellbeing',
    title: 'Asking for and Accepting Help',
    content: `One of the hardest aspects of dementia caregiving is asking for and accepting help from others. Many carers feel a sense of duty ("This is my responsibility"), pride ("I should be able to manage"), or fear of burdening others. Dementia NZ and carer organisations consistently note that carers who accept help have better health outcomes and provide better quality care for longer.

Be specific when asking for help: "Can you sit with Dad from 2 to 4 on Thursday so I can attend my appointment?" is far more effective than a vague "I need help sometimes." Keep a list of tasks that others can do — shopping, driving to appointments, lawn mowing, phone calls to navigate systems, meal preparation — that you can offer when someone volunteers.

Accept imperfect help graciously. If someone does a task differently than you would, resist correcting unless it is genuinely unsafe. Focusing on whether the outcome meets the person's needs rather than whether the method matches yours makes it easier for others to continue helping sustainably.

Consider a formal family meeting to distribute caregiving tasks fairly among siblings and other family members. Shared responsibility is more sustainable than one person carrying the full burden. Use community services — home care, day programmes, and respite — rather than trying to do everything personally.

In New Zealand, Alzheimers NZ (alzheimers.org.nz, 0800 004 001) and your local Dementia NZ service (dementia.nz) can help identify local home support and community services. Carers NZ (carers.net.nz) provides practical support for carers navigating what is available in their area.`,
    tags: ['help-seeking', 'family support', 'delegating', 'carer support', 'burnout prevention', 'community services'],
    source_url: 'https://dementia.nz/about-dementia/',
    source_org: 'Dementia NZ',
    embedding: null,
  },
  {
    id: 'wellbeing_007',
    category: 'wellbeing',
    title: 'Transitioning to Residential Aged Care',
    content: `The decision to transition a loved one to residential aged care is one of the most emotionally difficult decisions a family carer faces. My Aged Care emphasises that residential care — when the right facility is chosen and the transition is managed well — can provide a quality of life that is genuinely difficult to achieve at home once care needs become very high.

Common triggers for considering residential care include: care needs that exceed what one person can safely provide at home; significant safety risks that cannot be managed in a home environment; serious health consequences for the primary carer from ongoing caregiving; or the recognition that the person would benefit from consistent professional care, structured activity, and specialist staffing.

In Australia, use My Aged Care (myagedcare.gov.au) to compare residential care providers, understand funding, and apply for assessment. Visit multiple facilities, observe how staff interact with residents, and ensure the facility can meet the specific needs of someone with dementia — including whether a secure memory care unit is available. In New Zealand, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) can help families understand residential care options.

Involve the person with dementia in the decision where they retain capacity. The transition period typically takes four to eight weeks for the person to feel settled — continue to visit regularly, bring familiar objects from home, and remain actively involved in care decisions.

Transition to residential care is not abandonment — it is a form of love that acknowledges when the level of care needed has moved beyond what one household can safely provide.`,
    tags: ['residential care', 'nursing home', 'transition', 'aged care', 'guilt', 'decision', 'placement'],
    source_url: 'https://www.myagedcare.gov.au/',
    source_org: 'My Aged Care',
    embedding: null,
  },

  // ─── PREVENTION & EARLY DETECTION (7) ────────────────────────────────────────
  {
    id: 'prevention_001',
    category: 'prevention',
    title: 'The 14 Modifiable Risk Factors for Dementia',
    content: `The 2024 Lancet Commission on dementia prevention, intervention, and care identified 14 modifiable risk factors that together account for approximately 45 percent of all dementia cases worldwide. The Alzheimer's Society highlights this research as evidence that dementia is not inevitable — addressing these factors across the life course can delay or prevent a significant proportion of cases.

The 14 factors span life stages. In early life: low educational attainment — staying in education longer builds cognitive reserve. In midlife: hearing loss (the single largest modifiable risk factor — treat it promptly); high blood pressure (manage from midlife onwards, not just in older age); obesity; traumatic brain injury; excessive alcohol consumption (more than 21 standard drinks per week); and vision loss (added to the list in the 2024 update). In later life: smoking; depression; physical inactivity; diabetes; social isolation; air pollution; and high LDL cholesterol.

Each of these is modifiable — meaning that addressing it reduces risk, even if other factors remain present. The combined effect of addressing multiple risk factors simultaneously is substantial.

Non-modifiable factors include age (the largest overall risk factor), genetic variants such as APOE ε4, and family history. However, the Lancet Commission's key message is clear: genetics is not destiny, and lifestyle factors significantly influence whether genetic risk translates into dementia.

Prevention begins early and extends across the whole life course. The most impactful changes most people can make include: treating hearing and vision loss promptly; managing blood pressure and cholesterol from midlife; staying physically active; maintaining social connections; and avoiding smoking and excessive alcohol.`,
    tags: ['risk factors', 'prevention', 'Lancet Commission', 'modifiable risk', 'lifestyle', 'brain health'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'prevention_002',
    category: 'prevention',
    title: 'Recognising the Warning Signs of Dementia',
    content: `The NHS emphasises that dementia is not a normal part of ageing, and that warning signs should prompt a GP visit rather than being dismissed as expected age-related change. Recognising symptoms early enables earlier diagnosis, earlier access to support, and time for the person to participate in planning their own care.

Early symptoms described by the NHS include: memory loss — particularly forgetting recent events, names, and faces; difficulty concentrating, planning, or following a familiar recipe; problems completing familiar tasks such as driving a known route; confusion about time, place, or what is currently happening; trouble understanding visual information and spatial relationships; difficulty finding words in speaking or writing; misplacing items and being unable to retrace steps; poor or changed judgement; withdrawal from hobbies, social activities, or work; and changes in mood or personality — including increased anxiety, suspicion, or irritability in situations that previously would not have caused distress.

The key distinction from normal ageing: occasional forgetfulness of a name or misplacing an item, with later recall, is within normal range. Dementia-related changes are more persistent, worsen over time, and begin to meaningfully interfere with daily life.

If you notice several of these signs in yourself or someone you care about, book an appointment with a GP. In New Zealand, contact Alzheimers NZ (alzheimers.org.nz, 0800 004 001) or Dementia NZ (dementia.nz) for information and guidance. In Australia, contact Dementia Australia (dementia.org.au, 1800 100 500).`,
    tags: ['warning signs', 'early detection', 'memory loss', 'diagnosis', 'symptoms'],
    source_url: 'https://www.nhs.uk/conditions/dementia/symptoms/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'prevention_003',
    category: 'prevention',
    title: 'Physical Activity and Brain Health: Exercise as Prevention',
    content: `Dementia Australia highlights physical activity as one of the most well-evidenced and modifiable protective factors against dementia. Regular exercise achieves this through multiple pathways: improving cardiovascular function and cerebral blood flow; reducing neuroinflammation; promoting the release of brain-derived neurotrophic factor (BDNF), which supports brain cell growth and maintenance; reducing vascular risk factors including high blood pressure, diabetes, and obesity; and improving sleep quality and mood — all of which independently benefit brain health.

The FINGER study (Finnish Geriatric Intervention Study to Prevent Cognitive Impairment and Disability) — one of the largest dementia prevention trials — demonstrated that a multi-domain lifestyle intervention including physical exercise improved cognitive performance significantly compared to a control group in older adults at elevated risk.

For brain health, aim for at least 150 minutes of moderate-intensity aerobic activity per week — for example, 30-minute sessions five days per week. Moderate intensity means your heart rate increases and you can hold a conversation but not easily sing. Suitable activities include brisk walking, swimming, cycling, dancing, and water aerobics.

Resistance training two to three times per week provides additional brain health benefits and is especially important for older adults. Balance and coordination exercises such as tai chi and yoga reduce fall risk and have cognitive benefits.

Even short bouts of movement help. Starting slowly and building gradually is more sustainable than an intensive start. Many councils and community centres in Australia and New Zealand offer low-cost or free exercise programmes for older adults — your GP can help with referrals.`,
    tags: ['exercise', 'physical activity', 'prevention', 'FINGER study', 'brain health', 'BDNF', 'aerobic', 'resistance'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'prevention_004',
    category: 'prevention',
    title: 'Cognitive Engagement, Social Connection, and Brain Reserve',
    content: `Cognitive reserve is the brain's resilience to damage — the ability to function well despite accumulating pathology. The Alzheimer's Society notes that people with higher cognitive reserve sustain more brain damage before symptoms become apparent. Reserve is built across the life course through education, mentally stimulating work, and intellectually engaging leisure activities — and building it is possible at any age.

Cognitively stimulating activities that build reserve include: learning a new language (bilingualism is one of the most powerful reserve-builders, with some research suggesting it delays dementia onset by several years); learning a musical instrument; studying a new subject formally or informally; reading and writing regularly; playing chess, strategy games, or card games; and taking up a complex new hobby. The key is novelty and challenge — activities that have become routine and no longer feel mentally demanding provide less benefit than those that genuinely stretch capability.

Social connection is a separate but equally important protective factor. Social isolation is associated with significantly elevated dementia risk. Social engagement protects brain health through: cognitive stimulation from conversation and relationship navigation; emotional regulation and stress reduction; physical activity often associated with social participation; and sense of purpose and meaning.

Protective social activities include: maintaining regular contact with family and friends; joining clubs, community organisations, or volunteer groups; and mentoring or teaching others. In New Zealand, connection to community, whānau, and cultural identity is particularly protective — maintaining language, cultural practices, and kinship networks benefits cognitive health and overall wellbeing across the lifespan.`,
    tags: ['cognitive reserve', 'social connection', 'mental stimulation', 'bilingualism', 'prevention', 'brain health', 'learning'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'prevention_005',
    category: 'prevention',
    title: 'Younger Onset Dementia: Under 65 — Unique Challenges and Support',
    content: `The Alzheimer's Society notes that dementia diagnosed before age 65 — known as young-onset or early-onset dementia — is less likely to present with memory loss as the first symptom and more likely to involve changes in behaviour, language, or personality. This atypical presentation frequently delays diagnosis, sometimes by years.

Frontotemporal dementia, which causes early personality and language changes, is proportionally more common in younger onset cases than in late-onset dementia. Genetic causes are also more likely to be relevant — genetic counselling may be appropriate for the person and their family.

The life circumstances of younger people with dementia differ substantially from those of older people: employment may be suddenly disrupted at a critical career stage; mortgages and financial obligations are typically active; children may still be at home and dependent; and the person may themselves be a carer for others. These circumstances require different support approaches from those designed primarily for older populations.

Partners of people with younger onset dementia often face sudden changes in roles, loss of a peer relationship, and the need to assume sole financial responsibility. Children in the household may need dedicated psychological support to make sense of the changes they are witnessing.

In New Zealand, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) provide support tailored to younger onset dementia. In Australia, Dementia Australia (dementia.org.au) provides dedicated resources and connection to NDIS pathways, which may apply for people diagnosed under 65.`,
    tags: ['younger onset', 'early onset', 'under 65', 'frontotemporal', 'genetic', 'employment', 'financial', 'family'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/types-dementia',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },
  {
    id: 'prevention_006',
    category: 'prevention',
    title: 'After a Dementia Diagnosis: Navigating the First Months',
    content: `Dementia Australia describes the period following a dementia diagnosis as a critically important window — because the person retains legal capacity to make decisions, express wishes, and participate in planning their own care and future. Acting on several priorities in the weeks following diagnosis makes an enormous difference to future wellbeing for both the person and their family.

Legal and financial planning is the most urgent priority. While the person has capacity, arrange an Enduring Power of Attorney for both financial decisions and personal care decisions. In Australia, requirements vary by state and territory. In New Zealand, consult a lawyer or the Public Trust for EPA registration. Once capacity is lost, legal processes become significantly more complex and stressful for everyone.

Connect with support services promptly: Dementia Australia (dementia.org.au, 1800 100 500) and Dementia Support Australia (dementia.com.au) in Australia; Alzheimers NZ (alzheimers.org.nz, 0800 004 001) and Dementia NZ (dementia.nz) in New Zealand. These organisations offer post-diagnosis navigation, information, and connection to local services.

If the person still drives, arrange a formal occupational therapy driving assessment. Ask the GP for a referral to My Aged Care (Australia) or appropriate home support services (New Zealand) to understand what funded support may be available.

A dementia diagnosis does not end a person's life — many people live well with dementia for years. Focus on what the person can still do and enjoy, and involve them in all decisions about their care and life for as long as possible.`,
    tags: ['post-diagnosis', 'first steps', 'power of attorney', 'advance care plan', 'driving', 'disclosure', 'support services'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'prevention_007',
    category: 'prevention',
    title: 'Mild Cognitive Impairment: What It Means and What to Expect',
    content: `Mild Cognitive Impairment (MCI) is a condition where a person's cognitive abilities have declined more than expected for their age and education level, but not to a degree that significantly disrupts daily independence. The Alzheimer's Society describes it as sitting on a spectrum between normal ageing and dementia.

MCI is important to understand because some — but not all — people with MCI will go on to develop dementia. Approximately 10 to 15 percent of people with MCI progress to dementia each year; however, a significant proportion remain stable, and some return to normal cognitive function. MCI does not inevitably lead to dementia.

There are two main subtypes: amnestic MCI (memory is primarily affected) and non-amnestic MCI (executive function, language, or visuospatial abilities are primarily affected). Factors associated with higher risk of progression include the amnestic subtype, the APOE ε4 genetic variant, cardiovascular risk factors, depression, sleep disorders, and a faster rate of cognitive change over time.

If you or someone you care about has MCI, address all modifiable risk factors — particularly blood pressure, cholesterol, blood glucose, hearing, vision, physical activity, sleep quality, and social engagement. These lifestyle modifications are the most evidence-based approach currently available for slowing progression. Attend regular GP monitoring appointments (typically six-monthly) to track changes.

Ensure legal and financial affairs are in order while capacity is fully intact — do not wait for a dementia diagnosis. In New Zealand, contact Dementia NZ (dementia.nz) or Alzheimer's NZ (alzheimers.org.nz) for information. In Australia, contact Dementia Australia (dementia.org.au) or StepUp for Dementia Research (stepupfordementiaresearch.org.au) to learn about research participation.`,
    tags: ['MCI', 'mild cognitive impairment', 'early stage', 'progression', 'monitoring', 'APOE', 'risk', 'normal ageing'],
    source_url: 'https://www.alzheimers.org.uk/about-dementia/symptoms-and-diagnosis/symptoms',
    source_org: 'Alzheimer\'s Society UK',
    embedding: null,
  },

  // ─── CAREGIVING (extended: 008–010) ─────────────────────────────────────────
  {
    id: 'caregiving_008',
    category: 'caregiving',
    title: 'Dementia Support Australia — Specialist In-Home Behavioural Support',
    content: `Dementia Support Australia (DSA) provides free, specialist consultative support for people living with dementia who are experiencing behavioural and psychological symptoms that are difficult to manage. Funded by the Australian Government, DSA operates nationally through a network of specialist dementia advisers, nurses, and clinicians, and its services are available to people with dementia at home, in residential care, and to the family carers and support workers who care for them.

Behavioural and psychological symptoms of dementia (BPSD) — including agitation, aggression, wandering, sleep disturbance, depression, anxiety, and hallucinations — affect up to 90 percent of people with dementia at some point in the course of the illness. These symptoms are among the most stressful aspects of caregiving and a primary driver of premature residential placement. DSA's specialist consultants work directly with families to identify the underlying triggers of these behaviours and develop personalised, non-pharmacological management strategies.

DSA treats behaviour as communication — asking what unmet need, physical discomfort, emotional distress, or environmental factor is driving the behaviour, and addressing that underlying cause rather than seeking to suppress the behaviour with medication. This philosophy aligns with national and international best-practice guidelines and reduces the use of antipsychotic medications, which carry significant risks including increased risk of stroke and death in older people with dementia.

To access DSA services in Australia, call the National Dementia Helpline 1800 100 500 (available 24 hours a day, seven days a week) or visit dementia.com.au. Services are free regardless of whether the person has a formal aged care package in place. DSA also provides educational resources and telephone guidance for carers dealing with acute behavioural crises. A GP referral is not required.`,
    tags: ['Dementia Support Australia', 'behaviour support', 'BPSD', 'agitation', 'specialist', 'helpline'],
    source_url: 'https://www.dementia.com.au/',
    source_org: 'Dementia Support Australia',
    embedding: null,
  },
  {
    id: 'caregiving_009',
    category: 'caregiving',
    title: 'Carer Gateway — Australia\'s Dedicated Support Programme for Carers',
    content: `Carer Gateway (carergateway.gov.au) is an Australian Government programme providing free, coordinated services and emotional and practical support specifically for people in a caring role. For dementia carers — who face sustained, intensive demands and are at significantly elevated risk of physical and mental health deterioration — Carer Gateway is a critical and often underutilised resource.

Services available through Carer Gateway include tailored support packages that fund practical assistance such as cleaning, meal preparation, home maintenance, or transport for the carer; professional counselling for carers experiencing emotional difficulty, anxiety, or depression; planned and emergency respite so that carers have reliable relief when needed; structured coaching from trained carer coaches to help carers develop sustainable strategies; and online skills courses covering topics from managing carer stress to navigating the aged care system.

Carer Gateway also connects carers to peer support groups — both in-person and online — facilitated by people with lived experience of caring. Research consistently identifies peer connection as among the most valued and effective supports for dementia carers, reducing isolation and building resilience over the long term.

To access Carer Gateway services, call 1800 422 737 (Monday to Friday, 8am to 5pm Australian Eastern Standard Time) or use the eligibility checker at carergateway.gov.au. Services are available for carers of any age caring for a person with any long-term illness, disability, or dementia-related condition. Access is also available through My Aged Care (myagedcare.gov.au). Translated resources for carers from non-English-speaking backgrounds are available through the website.`,
    tags: ['Carer Gateway', 'respite', 'counselling', 'carer support', 'coaching', 'practical support', 'Australia'],
    source_url: 'https://www.carergateway.gov.au/',
    source_org: 'Carer Gateway',
    embedding: null,
  },
  {
    id: 'caregiving_010',
    category: 'caregiving',
    title: 'Forward with Dementia — Evidence-Based Guidance for the Year After Diagnosis',
    content: `Forward with Dementia (forwardwithdementia.au) is an internationally developed, evidence-based programme and website designed specifically for people in the first year following a dementia diagnosis and those who support them. It was created by a research consortium spanning universities in Australia (UNSW, University of Sydney, University of Wollongong), Canada, the United Kingdom, the Netherlands, and Poland, in partnership with Dementia Alliance International.

The programme addresses the disorientation and overwhelm that characterise the first year after diagnosis by providing structured, clinician-reviewed guidance on what to expect, what decisions need to be made early, and how to prioritise next steps. Content is developed for three distinct audiences: people living with dementia, family carers, and healthcare professionals — each of whom has different information needs and concerns in the immediate post-diagnosis period.

Topics covered include understanding the specific diagnosis and what it means; managing daily activities; legal and financial planning; self-care for carers; communicating with the healthcare team; planning for future care needs; and accessing community supports. The site draws on the latest clinical research and presents it in accessible, practical language without requiring medical background knowledge. It also includes personal stories from people living with dementia and their carers.

For carers in Australia seeking guidance in the first year following a loved one's diagnosis, Forward with Dementia provides a valuable structured starting point alongside specialist services from Dementia Australia (dementia.org.au, 1800 100 500), Dementia Support Australia (dementia.com.au), and Carer Gateway (carergateway.gov.au). In New Zealand, complement it with Alzheimers NZ (alzheimers.org.nz, 0800 004 001) and Dementia NZ (dementia.nz).`,
    tags: ['post-diagnosis', 'first year', 'Forward with Dementia', 'guidance', 'planning', 'evidence-based'],
    source_url: 'https://www.forwardwithdementia.au/',
    source_org: 'Forward with Dementia',
    embedding: null,
  },

  // ─── CLINICAL (extended: 008–010) ────────────────────────────────────────────
  {
    id: 'clinical_008',
    category: 'clinical',
    title: 'Reversible and Treatable Causes of Dementia-Like Symptoms',
    content: `Mayo Clinic emphasises a crucial and frequently underappreciated fact: not all conditions causing memory loss, confusion, and cognitive impairment represent true, progressive dementia. A number of treatable medical conditions can produce dementia-like symptoms that closely mimic early Alzheimer's disease or other forms of dementia — and these must be systematically excluded before a dementia diagnosis is confirmed, because treating them can fully or substantially reverse cognitive decline.

Conditions that commonly cause reversible dementia-like symptoms include: hypothyroidism (underactive thyroid), which causes slowed thinking, memory impairment, and depression; vitamin B12 deficiency, particularly common in older adults, causing cognitive impairment that is fully reversible if caught early; medication side effects — particularly from sedatives, anticholinergic drugs (including some antihistamines and bladder medications), and certain blood pressure drugs; depression, which can cause pseudodementia with profound memory and concentration difficulties; urinary tract infections and other acute infections, which can cause sudden delirium that mimics severe dementia worsening; normal-pressure hydrocephalus, characterised by the triad of gait disturbance, urinary incontinence, and cognitive impairment; and subdural haematoma following a head injury, sometimes weeks or months earlier.

For this reason, every assessment for suspected dementia should include a comprehensive medical workup: blood tests for thyroid function, vitamin B12, folate, full blood count, glucose, renal and liver function; a full medication review including all over-the-counter preparations and supplements; and brain imaging (CT or MRI) to exclude structural causes.

Mayo Clinic notes that when a reversible cause is identified and treated promptly, cognitive function can improve substantially or normalise entirely. This makes a thorough initial evaluation — rather than an immediate dementia diagnosis — essential, particularly when symptom onset has been relatively sudden rather than gradual.`,
    tags: ['reversible dementia', 'treatable causes', 'B12 deficiency', 'hypothyroidism', 'delirium', 'medication', 'Mayo Clinic'],
    source_url: 'https://www.mayoclinic.org/diseases-conditions/dementia/symptoms-causes/syc-20352013',
    source_org: 'Mayo Clinic',
    embedding: null,
  },
  {
    id: 'clinical_009',
    category: 'clinical',
    title: 'Rare Dementias — Recognising Less Common Forms and Finding Support',
    content: `While Alzheimer's disease, vascular dementia, and Lewy body dementia account for the majority of dementia diagnoses, a significant proportion of people — particularly those with younger-onset dementia — have rarer forms that present very differently and require specialist diagnostic pathways. The Alzheimer's Society identifies over 200 subtypes of dementia. Rare dementias as a group are frequently misdiagnosed or subject to prolonged diagnostic delays, particularly because their early symptoms do not follow the familiar pattern of memory loss.

Rare dementias include: Posterior Cortical Atrophy (PCA), which primarily affects visual processing and spatial awareness rather than memory; Primary Progressive Aphasia (PPA), which targets language ability while other cognitive functions remain relatively preserved; Corticobasal Syndrome (CBS) and Progressive Supranuclear Palsy (PSP), both characterised by movement difficulties alongside cognitive change; Huntington's disease, an autosomal dominant inherited condition causing progressive movement disorder and dementia; and Creutzfeldt-Jakob Disease (CJD), a rapidly progressive prion disease that is rare but requires urgent specialist assessment.

Diagnosis typically requires specialist neurological evaluation, detailed neuropsychological testing, and often specialised brain imaging beyond standard MRI. Some rare dementias have specific genetic components, making genetic counselling an important consideration for the person and their family — particularly where children or siblings may be at heritable risk.

In Australia, Rare Dementia Support (raredementiasupport.org.au) provides dedicated support, information, and connection to specialist services for people with rare dementias and their families, recognising that standard dementia services may be unfamiliar with their specific condition. Dementia Australia (dementia.org.au, 1800 100 500) can also help navigate specialist referral pathways. In New Zealand, Alzheimers NZ (alzheimers.org.nz, 0800 004 001) and Dementia NZ (dementia.nz) provide guidance for families facing rare dementia diagnoses.`,
    tags: ['rare dementia', 'PCA', 'PPA', 'PSP', 'CBS', 'Huntington\'s', 'CJD', 'specialist', 'Rare Dementia Support'],
    source_url: 'https://www.raredementiasupport.org.au/',
    source_org: 'Rare Dementia Support Australia',
    embedding: null,
  },
  {
    id: 'clinical_010',
    category: 'clinical',
    title: 'The Wicking Dementia Research and Education Centre — Free Courses for All',
    content: `The Wicking Dementia Research and Education Centre at the University of Tasmania is one of Australia's foremost dementia research and education institutions. Established through a significant philanthropic gift, the Wicking Centre integrates biomedical research with population health approaches and a deep commitment to accessible public education about dementia.

One of the Wicking Centre's most impactful contributions is the Understanding Dementia Massive Open Online Course (MOOC), which has been accessed by hundreds of thousands of people worldwide. The course runs approximately ten weeks, is available free online, and provides a rigorous, evidence-based foundation in dementia — its biology, its progression, its management, and its human and social impact. A companion course, Preventing Dementia, covers the evidence on modifiable risk factors and protective lifestyle strategies. Both are appropriate for family carers, healthcare workers, community members, and people recently diagnosed with dementia or MCI.

The Wicking Centre also conducts peer-reviewed research across dementia prevention, care quality, end-of-life care in dementia, and the experiences of people living with dementia and their carers. It produces findings specifically relevant to Australian and Pacific populations, complementing the predominantly European and North American research literature that currently dominates the field.

For carers, family members, and health professionals seeking a deep, scientifically grounded understanding of dementia, the Wicking Centre's free online courses (available at utas.edu.au/wicking) are among the highest quality and most accessible resources available globally. Completion of the Understanding Dementia course is associated with increased carer confidence, improved care quality, and better understanding of what to expect as the condition progresses.`,
    tags: ['Wicking Dementia Centre', 'UTAS', 'MOOC', 'Understanding Dementia', 'education', 'research', 'free course'],
    source_url: 'https://www.utas.edu.au/wicking',
    source_org: 'Wicking Dementia Research and Education Centre',
    embedding: null,
  },

  // ─── BEST PRACTICES (extended: 008–010) ──────────────────────────────────────
  {
    id: 'bestpractices_008',
    category: 'best-practices',
    title: 'Fall Prevention Strategies in Dementia Care',
    content: `Falls are among the most serious and frequent safety incidents in dementia care. People with dementia are at approximately two to three times greater risk of falls than cognitively intact older adults — due to gait and balance changes, reduced hazard awareness, medication side effects affecting balance and blood pressure, and dementia's direct impact on spatial orientation and reaction time. The Jockey Club Centre for Positive Ageing (JCCPA) and Dementia Australia both identify fall prevention as a priority component of safe dementia care.

A comprehensive falls risk assessment should include: a physiotherapist assessment of mobility, strength, and balance; a medication review with the GP or pharmacist, paying specific attention to drugs causing dizziness, sedation, or orthostatic hypotension (a sudden drop in blood pressure on standing); a vision check; and a thorough home hazard assessment. Any fall — even one without apparent injury — warrants medical review to check for fractures or head injury, because people with dementia may not reliably report pain.

Environmental modifications that significantly reduce fall risk include: removing loose rugs and all trip hazards from walkways; ensuring all areas of the home including outdoor paths are well-lit, particularly at night; installing grab rails beside the toilet and in the shower; using non-slip mats in the bathroom; and ensuring the person always wears well-fitting, flat-soled, non-slip enclosed shoes rather than loose slippers. A nightlight in the hallway between bedroom and bathroom is one of the single most effective interventions for preventing night-time falls.

Regular supervised physical activity specifically targeting strength, balance, and coordination — including physiotherapy-guided programmes, tai chi, and seated exercises — reduces falls risk and should be maintained for as long as possible. In Australia, physiotherapy can be accessed through a My Aged Care Home Care Package or on GP referral. In New Zealand, contact Dementia NZ (dementia.nz) or the person's GP for referral to community physiotherapy.`,
    tags: ['falls', 'fall prevention', 'balance', 'physiotherapy', 'grab rails', 'JCCPA', 'home safety'],
    source_url: 'https://www.jccpa.org.hk/en/about-dementia/caring-tips/fall-prevention-tips/',
    source_org: 'Jockey Club Centre for Positive Ageing',
    embedding: null,
  },
  {
    id: 'bestpractices_009',
    category: 'best-practices',
    title: 'Oral Health and Dental Care for People with Dementia',
    content: `Oral health in people with dementia deteriorates significantly as the condition progresses and is frequently overlooked in broader care planning. The Jockey Club Centre for Positive Ageing (JCCPA) identifies oral care as a priority area, noting that poor oral health leads to pain, infection, difficulty eating, and aspiration pneumonia — all of which worsen quality of life and overall health and can significantly accelerate decline.

In the early stages, supervise and prompt tooth brushing twice daily using a soft-bristled toothbrush and fluoride toothpaste. Break the task into single, concrete steps — "Pick up the toothbrush," "Add the toothpaste," "Brush the front teeth" — to maintain the person's independent participation for as long as possible. An electric toothbrush with a large handle is often easier to manage for both the person and their carer. Dental check-ups should continue every six months; alerting the dentist in advance to the person's dementia allows them to adapt their approach accordingly.

As dementia progresses and self-care becomes difficult, the carer takes a more active role. If the person resists the toothbrush, try a foam mouth sponge or a clean gloved finger with a small amount of toothpaste. For denture wearers, remove and clean dentures nightly and inspect both the dentures and gums regularly for sores, ill-fitting areas, or signs of infection — ill-fitting dentures are a common and often unrecognised source of pain in people who cannot reliably report discomfort.

Dry mouth — a frequent side effect of many dementia medications — significantly increases the risk of tooth decay and oral infection. Encourage regular sips of water throughout the day and ask the pharmacist about saliva substitutes if dryness is significant. Any new reluctance to eat, facial grimacing around mealtimes, or unexplained behavioural change should prompt a dental review to exclude oral pain as a contributing cause.`,
    tags: ['oral health', 'dental care', 'toothbrushing', 'dentures', 'dry mouth', 'JCCPA', 'pain'],
    source_url: 'https://www.jccpa.org.hk/en/about-dementia/caring-tips/oral-care/',
    source_org: 'Jockey Club Centre for Positive Ageing',
    embedding: null,
  },
  {
    id: 'bestpractices_010',
    category: 'best-practices',
    title: 'Safe Physical Transfers and Mobility Assistance in Dementia Care',
    content: `As dementia progresses and mobility declines, assisting a person to move safely — from bed to chair, from chair to toilet, in and out of vehicles — becomes an increasingly important and potentially hazardous component of daily care. The Jockey Club Centre for Positive Ageing (JCCPA) provides guidance on safe transfer technique that protects both the person with dementia and their carer from injury.

The fundamental principle is to use the person's remaining mobility rather than lifting their full weight wherever possible. Where the person can weight-bear and follow simple instructions, a guided standing transfer — in which the carer supports and guides movement rather than lifting — is substantially safer than a manual lift for both parties. Break each transfer into one clear instruction at a time and allow adequate time for the person to respond before proceeding.

Carer back safety is as important as the person's safety — many dementia carers sustain serious back injuries from poor transfer technique. Maintain a wide base of support with feet apart, keep your back straight, bend at the knees, and stay close to the person throughout the movement. Never attempt to catch someone who is falling; instead, guide their descent gently and call for assistance. Attempting to catch a falling person is a leading cause of carer injury.

For people who can no longer weight-bear safely, mechanical aids — slide sheets, transfer boards, and ceiling or floor hoists — should be sourced and used before injury occurs, not after. An occupational therapist can assess the person's transfer needs and recommend appropriate equipment and technique. Dementia Training Australia (dta.com.au) and the person's occupational therapist provide formal training in safe manual handling, which is strongly recommended before attempting complex assisted transfers without professional guidance.`,
    tags: ['manual handling', 'transfers', 'mobility', 'back safety', 'JCCPA', 'hoist', 'occupational therapist'],
    source_url: 'https://www.jccpa.org.hk/en/about-dementia/caring-tips/safe-lifting/',
    source_org: 'Jockey Club Centre for Positive Ageing',
    embedding: null,
  },

  // ─── COMMUNICATION (extended: 008–010) ───────────────────────────────────────
  {
    id: 'communication_008',
    category: 'communication',
    title: 'Culturally Appropriate Dementia Care for Chinese Communities',
    content: `The Caring for People with Dementia Together (CPT) project (chinesedementia.org.nz) is a cross-community partnership involving Dementia Auckland, Age Concern Auckland, Health New Zealand Counties Manukau, the University of Auckland, and Vagus Centre. It was established to develop accessible and culturally relevant dementia services for Chinese New Zealanders — a community identified by the Dementia Economic Impact Report 2020 as accessing existing dementia services at lower rates than all other ethnic groups in New Zealand.

Cultural and linguistic factors play a significant role in this gap. Dementia information is overwhelmingly produced in English, making it inaccessible to Chinese older adults and family members who primarily communicate in Mandarin, Cantonese, or other Chinese languages. Significant stigma — including cultural beliefs that dementia is a normal part of ageing or a private family matter not to be discussed outside the immediate family — discourages help-seeking. Care approaches need to respect collective family decision-making, the importance of maintaining face, and traditional understandings of illness and care responsibility.

The CPT project focuses on three priorities: raising awareness within the Chinese community and promoting brain health to reduce dementia risk; providing education and support for carers and families in culturally appropriate formats, including Chinese-language resources and videos; and implementing a Living Well programme for Chinese people living with dementia that connects participants to culturally relevant activities and peer support.

For Chinese New Zealanders affected by dementia, chinesedementia.org.nz provides bilingual information in English and Chinese and can connect families to culturally appropriate local services. Contact chineseservices@dementiaauckland.org.nz for enquiries. In Australia, Dementia Australia (dementia.org.au, 1800 100 500) provides multilingual resources and connection to culturally appropriate support.`,
    tags: ['Chinese community', 'culturally appropriate', 'bilingual', 'Cantonese', 'Mandarin', 'stigma', 'CPT project', 'New Zealand'],
    source_url: 'https://www.chinesedementia.org.nz/',
    source_org: 'Chinese Dementia NZ (CPT Project)',
    embedding: null,
  },
  {
    id: 'communication_009',
    category: 'communication',
    title: 'Talk with Ted — AI-Assisted Communication Practice for Carers',
    content: `Talk with Ted is an AI-powered interactive learning tool developed by Dementia Australia to help family carers and care workers develop and practise communication skills with a person with dementia in a safe, consequence-free environment. Ted is an avatar — a virtual representation of a person living with dementia — that responds to the carer's communication attempts in realistic and nuanced ways, enabling deliberate skill development before applying techniques in real care situations.

The core value of Talk with Ted is experiential learning through safe practice. Carers can attempt different approaches to challenging scenarios — including managing agitation, responding to repetitive questioning, delivering unwelcome information, or supporting a distressed person — and receive immediate feedback on what worked, what escalated the situation, and what to try differently. This cycle of practice, feedback, and reflection is significantly more effective for skill development than learning communication theory without practical application.

Talk with Ted is particularly valuable for new carers who have not yet had opportunity to build confidence through real experience, and for experienced carers encountering unfamiliar or escalating situations. Its availability outside clinic hours and without requiring a trained facilitator makes it accessible to carers at the moment they need support — not only during scheduled appointments or training courses.

The tool reflects a broader move toward AI-assisted education in dementia care that extends learning beyond formal training contexts. It is used alongside — not instead of — face-to-face carer education programmes from Dementia Australia (dementia.org.au), Dementia Training Australia (dta.com.au), and Carer Gateway (carergateway.gov.au). For carers wanting to build confidence for a specific upcoming challenge or difficult conversation, Talk with Ted provides a uniquely accessible and low-risk practice environment.`,
    tags: ['Talk with Ted', 'AI avatar', 'communication practice', 'simulation', 'Dementia Australia', 'carer training', 'digital tool'],
    source_url: 'https://www.dementia.org.au/',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'communication_010',
    category: 'communication',
    title: 'Supporting Culturally and Linguistically Diverse People with Dementia',
    content: `For people from culturally and linguistically diverse (CALD) backgrounds, dementia creates a distinctive communication challenge: as the condition progresses, people commonly revert to their first language, losing the ability to communicate in a language learned later in life. A Chinese-born person who has spoken fluent English for decades may progressively lose their English and communicate only in Cantonese or Mandarin. A Pacific Islander may revert to their home language. An immigrant who learned the language of their adopted country as an adult may effectively lose that language well before other abilities decline.

Dementia Australia and the Alzheimer's Society emphasise the importance of recognising and accommodating this reversion. Language is deeply tied to identity, emotional memory, and sense of self. Communicating — or attempting to communicate — in a person's first language maintains connection, dignity, and emotional wellbeing even when explicit memory is severely impaired. Carers who speak the person's first language should be prioritised in care arrangements wherever possible.

Where bilingual carers are unavailable, professional interpreting services are the appropriate resource for medical appointments and clinical discussions. In Australia, the Translating and Interpreting Service (TIS National, 131 450) is available around the clock in over 100 languages. Plan for this in advance, and avoid using family members as interpreters in clinical settings — they may be emotionally affected by what is being discussed and may not accurately convey clinical information in either direction.

Non-verbal cultural connection through music from the person's country of origin, culturally significant foods, familiar cultural objects, and family photographs is valuable for all people with dementia but particularly for those whose verbal communication has become unreliable. For Chinese communities in New Zealand, chinesedementia.org.nz provides bilingual resources. For Pacific communities and all New Zealanders, Dementia NZ (dementia.nz) and Alzheimer's NZ (alzheimers.org.nz) can connect families to appropriate support.`,
    tags: ['CALD', 'culturally diverse', 'first language', 'interpreter', 'TIS National', 'multilingual', 'Pacific communities'],
    source_url: 'https://www.dementia.org.au/',
    source_org: 'Dementia Australia',
    embedding: null,
  },

  // ─── CAREGIVER WELLBEING (extended: 008–010) ─────────────────────────────────
  {
    id: 'wellbeing_008',
    category: 'wellbeing',
    title: 'Dementia Support Australia — Free Specialist Support for Behavioural Crises',
    content: `Dementia Support Australia (DSA) is an Australian Government-funded national service providing free specialist support for people with dementia experiencing behavioural and psychological symptoms of dementia (BPSD) — the most common and most stressful category of dementia-related difficulty for family carers. DSA is available to people with dementia living at home or in residential aged care, and the service is free at the point of access without requiring a GP referral.

Many carers reach a point where behaviours they previously managed — agitation, aggression, night-time wandering, distressed calling, refusal of personal care — become unmanageable without specialist input. DSA's clinical consultants conduct face-to-face assessments in the home or care setting, complete a thorough review of the person's history and circumstances, and develop an individualised management plan grounded in person-centred, non-pharmacological approaches.

The DSA approach treats behaviour as communication of an unmet need, physical discomfort, emotional distress, or environmental factor. The focus is on identifying and addressing that underlying cause rather than suppressing the behaviour with medication. This aligns with national and international best-practice guidelines and reduces the use of antipsychotic medications, which carry significant risks in older people with dementia including increased risk of stroke and falls.

For families who have been told nothing more can be done, or who are considering residential placement primarily because of unmanageable behaviour, a DSA consultation should be sought before that decision is made. In many cases, specialist assessment leads to significant improvement in behaviour and restored carer confidence. To access DSA services, call the National Dementia Helpline 1800 100 500 (24 hours a day, 7 days a week) or visit dementia.com.au.`,
    tags: ['Dementia Support Australia', 'DSA', 'BPSD', 'specialist support', 'behaviour management', 'non-pharmacological', 'helpline'],
    source_url: 'https://www.dementia.com.au/',
    source_org: 'Dementia Support Australia',
    embedding: null,
  },
  {
    id: 'wellbeing_009',
    category: 'wellbeing',
    title: 'Digital Support Tools: BrainTrack and Ask Annie',
    content: `Two digital tools developed specifically for the dementia care context — BrainTrack and Ask Annie — provide accessible, evidence-informed support for brain health monitoring and practical caregiving, extending the reach of professional guidance into everyday life.

BrainTrack is a free app designed for individuals who are concerned about their own cognitive health, as well as for people with a diagnosis of MCI or early dementia who want to monitor changes over time. The app enables users to complete brief, validated cognitive assessments at regular intervals; track lifestyle factors known to affect brain health including physical activity, sleep quality, diet, social connection, and mood; and generate a summary report suitable for sharing with a GP. This makes it easier to have an informed, evidenced conversation about cognitive concerns with a healthcare professional rather than relying solely on the memory of intermittent symptoms.

Ask Annie is a mobile app developed to support home care workers and family carers of people with dementia. It provides practical, evidence-based guidance on common caregiving challenges — including managing agitation, supporting personal hygiene, responding to difficult behaviours, recognising warning signs that warrant medical attention, and improving communication — in a searchable, in-the-moment format. Ask Annie is designed to be consulted during care delivery, making evidence-based guidance available regardless of whether a trainer or support coordinator is present.

Both tools complement — rather than replace — professional dementia support. For specialist clinical guidance, contact the Alzheimers NZ support line (0800 004 001), Healthline (0800 611 116) for free 24/7 nurse advice, or arrange a consultation with a GP. For ongoing carer support and skills development, Carers NZ (carers.net.nz) provides guidance and peer connection.`,
    tags: ['BrainTrack', 'Ask Annie', 'digital health', 'app', 'cognitive monitoring', 'carer support', 'technology'],
    source_url: 'https://www.dementia.org.au/',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'wellbeing_010',
    category: 'wellbeing',
    title: 'My Aged Care — Australia\'s Gateway to Funded Home and Residential Care',
    content: `My Aged Care (myagedcare.gov.au) is the Australian Government's central access point for funded aged care services. For dementia carers, understanding the My Aged Care pathway is essential for securing funded support that can significantly improve quality of life and delay premature residential placement — but the system is complex and early engagement produces far better outcomes than last-minute crisis navigation.

The process begins with an eligibility assessment, initiated by calling My Aged Care on 1800 200 422 or registering online. A Regional Assessment Service (RAS) assessor determines eligibility for the Commonwealth Home Support Programme (CHSP) — entry-level services including domestic assistance, personal care, meals, transport, and social support provided on a co-contribution basis. For people with higher or more complex care needs, an Aged Care Assessment Team (ACAT) assessment determines eligibility for a Home Care Package (HCP), ranging from Level 1 (basic care needs) to Level 4 (high care needs, approximately $60,000 per year in funded support). For dementia, Level 3 or Level 4 packages are typically needed as the condition progresses.

Wait times for higher-level Home Care Packages can be significant. Applying as soon as care needs begin to increase — well before a crisis — prevents the gap between need and support from becoming unmanageable. Interim CHSP services can usually be arranged while waiting for a higher-level package.

For residential aged care, the ACAT assessment is also required. My Aged Care's service finder allows comparison of residential providers, understanding of fee structures, and identification of facilities with specific dementia expertise or secure memory care units. Dementia Australia (dementia.org.au, 1800 100 500) provides guidance specifically for families navigating My Aged Care for the first time, including self-advocacy and provider selection.`,
    tags: ['My Aged Care', 'Home Care Package', 'CHSP', 'ACAT', 'aged care', 'Australia', 'residential care', 'funding'],
    source_url: 'https://www.myagedcare.gov.au/',
    source_org: 'My Aged Care',
    embedding: null,
  },

  // ─── PREVENTION & EARLY DETECTION (extended: 008–010) ────────────────────────
  {
    id: 'prevention_008',
    category: 'prevention',
    title: 'Brain Health for Adults — Health New Zealand Te Whatu Ora',
    content: `Health New Zealand Te Whatu Ora (healthnz.govt.nz) provides an evidence-based brain health framework for adults reinforcing a central and optimistic message: close to half of all dementia cases could be delayed or prevented through modifiable lifestyle factors, and it is never too early — or too late — to begin protecting brain health. The framework draws on the same evidence base as the 2024 Lancet Commission on Dementia Prevention and the FINGER trial (Finnish Geriatric Intervention Study).

The Health NZ framework organises brain health actions around three interconnected pillars. A healthy body encompasses: attending regular health check-ups to manage blood pressure, cholesterol, and blood glucose; taking preventive care of hearing and vision; maintaining a healthy body weight; being physically active; eating a nutritious diet; avoiding smoking; limiting alcohol consumption; and protecting the head from injury and concussion. A healthy mind and spirit covers: seeking help promptly for depression and anxiety; continuing to learn and engaging in mentally stimulating activities; managing stress; attending to spiritual wellbeing; achieving 6 to 10 hours of quality sleep per night; and practising stress-reduction techniques. Staying socially connected recognises that strong relationships and community participation independently protect brain health — social isolation is one of the major modifiable risk factors for dementia.

The framework explicitly recognises that lifestyle changes work best when they are suited to a person's age and stage of life, enjoyable, sustainable, ideally undertaken with others, and long-term. Starting small and building gradually is encouraged — small, consistent changes accumulate into significant protection over time.

This resource is freely available at healthnz.govt.nz and directly complements the work of Alzheimers NZ (alzheimers.org.nz, 0800 004 001) and Dementia NZ (dementia.nz) in supporting New Zealanders affected by or at risk of dementia. People with specific concerns about brain health should discuss personalised risk reduction priorities with their GP.`,
    tags: ['Health NZ', 'brain health', 'Te Whatu Ora', 'prevention', 'New Zealand', 'lifestyle', 'modifiable risk'],
    source_url: 'https://www.healthnz.govt.nz/health-topics/conditions-treatments/brain-and-nerves/dementia/brain-health-for-adults',
    source_org: 'Health New Zealand Te Whatu Ora',
    embedding: null,
  },
  {
    id: 'prevention_009',
    category: 'prevention',
    title: 'StepUp for Dementia Research — Volunteering for a Future Without Dementia',
    content: `StepUp for Dementia Research (stepupfordementiaresearch.org.au) is Australia's national dementia research registry, connecting people interested in participating in dementia and brain ageing studies with researchers seeking volunteers. It was developed by the University of Sydney in partnership with the University of Exeter and University College London, with initial funding from the Australian Government Department of Health, and supports a broad portfolio of dementia and ageing research across Australia.

Without research participants, even the most well-designed prevention and treatment studies cannot progress. StepUp matches registered volunteers to studies based on their individual profile, health status, age, and interests — and registration does not commit anyone to any specific study. After registration, volunteers receive information about relevant studies they may be eligible for, and can decide independently whether to participate in each.

Crucially, healthy volunteers are as valuable as those with dementia or cognitive impairment — many prevention and early detection studies specifically require cognitively healthy older adults as comparison groups. Family carers, people with MCI, people with a family history of dementia, and people who have received a dementia diagnosis are all encouraged to register. Participation options are diverse: some studies involve online surveys only; others involve cognitive assessments, blood tests, brain imaging, or lifestyle interventions.

Registering with StepUp for Dementia Research is free, takes approximately 15 minutes, and can be completed entirely online at stepupfordementiaresearch.org.au. For people who want to contribute to dementia prevention and treatment beyond their own health behaviours, participation in well-designed research is one of the most direct and meaningful contributions available.`,
    tags: ['StepUp', 'dementia research', 'clinical trials', 'research participation', 'prevention research', 'Australia', 'University of Sydney'],
    source_url: 'https://www.stepupfordementiaresearch.org.au/',
    source_org: 'StepUp for Dementia Research',
    embedding: null,
  },
  {
    id: 'prevention_010',
    category: 'prevention',
    title: 'Community-Based Brain Health Screening — The Jockey Club Model',
    content: `The Jockey Club "Brain Health" Dementia Screening and Community Support Project, operated by the Jockey Club Centre for Positive Ageing (JCCPA) in Hong Kong, provides a replicable model of community-based early detection and intervention that is internationally recognised for its integrated approach. The programme rests on robust evidence: individuals with mild cognitive impairment who receive no intervention face a 10 to 15 percent annual risk of progressing to dementia, while those who receive timely, evidence-based support have substantially better outcomes.

The programme serves community members aged 60 and above who have concerns about memory decline or have been identified as potentially having mild cognitive impairment or early dementia. Services are structured around "early detection, early diagnosis, and early intervention" and include: electronic cognitive screening; diagnostic services with up to 18 months of medical consultation and subsidised medication access for eligible participants; targeted post-diagnostic support services within the first year of diagnosis; and counselling and community resource referrals for family carers.

The programme operates through a network of community partner organisations across Hong Kong's districts, recognising that accessible, geographically distributed service delivery substantially increases help-seeking — particularly in communities where stigma reduces self-referral to centralised specialist services. A family intervention and empowerment approach, treating carer wellbeing and capability as equally important to the wellbeing of the person with dementia, is central to the programme's design.

This community-based proactive screening model reflects the direction of best practice globally. In New Zealand, Alzheimer's NZ (alzheimers.org.nz), Dementia NZ (dementia.nz), and Health NZ (healthnz.govt.nz) promote early assessment and provide post-diagnostic support consistent with these principles. In Australia, Dementia Australia (dementia.org.au) and Dementia Support Australia (dementia.com.au) deliver comparable early intervention and support services.`,
    tags: ['JCCPA', 'Jockey Club', 'community screening', 'early detection', 'Hong Kong', 'MCI', 'prevention programme', 'family empowerment'],
    source_url: 'https://www.jccpa.org.hk/en/projects/dscs/',
    source_org: 'Jockey Club Centre for Positive Ageing',
    embedding: null,
  },

  // ─── HOME SAFETY (extended: 008–010) ─────────────────────────────────────────
  {
    id: 'homesafety_008',
    category: 'home-safety',
    title: 'Assistive Technology for Home Safety and Independence',
    content: `Assistive technology encompasses devices and systems that extend safe independent living for people with dementia while reducing carer supervision burden. Dementia Australia and Alzheimer's NZ note that technology works best when introduced early — before a safety crisis makes urgent adoption necessary — and when the person with dementia is involved in selecting and becoming familiar with devices before they become critical.

Medication management devices include automatic pill dispensers that open at programmed times, sound an alarm if a dose is not collected, and in some models lock individual compartments to prevent unintended access to other doses. These significantly reduce medication errors in early to moderate dementia without requiring constant carer supervision. Smart home technology includes motion-activated lighting that turns on automatically when the person moves at night — one of the most effective single interventions for preventing night-time falls; smart plugs that can cut power to a stove left on unattended; door sensors that send instant phone alerts when external doors are opened; and video doorbell systems for remote monitoring.

Personal safety devices include GPS tracking wristbands and pendants that provide real-time location information when a person wanders; medic alert bracelets engraved with the person's name, diagnosis, and emergency contact; and personal emergency response buttons that summon help if the person falls or becomes distressed alone. Telehealth and remote check-in services allow family members to maintain connection and monitor wellbeing from a distance — particularly valuable when the primary carer does not live in the same household.

Introduce assistive technology collaboratively and transparently. A sudden introduction of monitoring technology without explanation can feel invasive and damage trust. Explaining what each device does, involving the person in choosing it, and framing it around their safety and continued independence is the most effective and respectful approach.`,
    tags: ['assistive technology', 'GPS tracker', 'pill dispenser', 'smart home', 'medic alert', 'remote monitoring', 'independence'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
  {
    id: 'homesafety_009',
    category: 'home-safety',
    title: 'Water Safety and Temperature Hazards in the Home',
    content: `Water-related hazards present significant risks for people with dementia that are often overlooked in home safety planning. Dementia impairs the ability to recognise and respond appropriately to temperature extremes — a person may not notice that bathwater or tap water is dangerously hot, or may fail to respond to feeling cold. Both scalding and cold exposure are real and preventable risks.

The most important single water safety intervention is setting the household hot water thermostat to a maximum of 50°C. At this temperature, extended contact causes no immediate tissue damage; at 60°C, serious burns can occur within seconds. This adjustment is straightforward and permanent, requiring no ongoing vigilance from the carer. Anti-scald devices fitted to individual taps and shower fixtures provide an additional layer of protection by preventing water above a set temperature from flowing — these are available from plumbing suppliers and can generally be installed without major renovation.

Cold exposure is an underappreciated hazard: people with dementia may sit in cold rooms without recognising discomfort, wear seasonally inappropriate clothing without initiating a change, or go outdoors in cold weather without adequate protection. Regularly check body temperature and room temperature — particularly in winter — rather than relying on the person to self-report feeling cold. Establish a habit of checking that the person's clothing is appropriate for current conditions.

Unsupervised access to garden ponds, swimming pools, or open water features requires specific attention: dementia impairs hazard recognition and a fall near or into water can be fatal. Fence or secure all open water features, and ensure the person cannot access them without supervision. For people known to seek out water, assess whether a locked garden gate or other barrier is warranted.`,
    tags: ['water safety', 'scalding', 'temperature', 'hot water thermostat', 'hypothermia', 'garden pond', 'cold exposure'],
    source_url: 'https://www.nhs.uk/conditions/dementia/carers/',
    source_org: 'NHS UK',
    embedding: null,
  },
  {
    id: 'homesafety_010',
    category: 'home-safety',
    title: 'Conducting a Structured Dementia Home Safety Assessment',
    content: `A structured home safety assessment is one of the most impactful proactive steps a family can take following a dementia diagnosis. Dementia Australia recommends an assessment at or shortly after diagnosis, with reassessment at least annually and whenever there is a significant change in the person's condition, abilities, or behaviour.

A formal occupational therapy (OT) home assessment is the gold standard. OTs who specialise in home modification and ageing-in-place conduct a systematic room-by-room evaluation identifying fall hazards, fire risks, medication safety concerns, exit security, environmental factors contributing to disorientation and anxiety, and unmet assistive technology needs. They provide prioritised, specific recommendations and can prescribe and arrange funded equipment. In Australia, occupational therapy home assessments can be accessed through a My Aged Care Home Care Package or on GP referral. In New Zealand, contact Alzheimer's NZ (alzheimers.org.nz, 0800 004 001) or the person's GP for referral.

Carers who want to begin an assessment themselves can use checklists published by Dementia Australia (dementia.org.au) or Alzheimer's NZ as a starting framework. Key areas include: entry and exit security; fall hazards in bathrooms, bedrooms, hallways, stairs, and outdoor areas; kitchen safety including appliances, cleaning products, and sharp items; fire safety including smoke alarms, stove guards, and heater placement; medication security; lighting adequacy including nightlights; and garden and outdoor safety.

Prioritise modifications based on the person's specific current and near-term risks — a phased approach spread over several months is manageable and sustainable. Keep a written record of what has been modified and when, so that future reassessments can track progress and identify gaps. For carers who find the process overwhelming, Dementia Australia (1800 100 500) and Alzheimer's NZ (0800 004 001) can help identify occupational therapy or specialist support.`,
    tags: ['home safety assessment', 'occupational therapist', 'OT', 'home modification', 'checklist', 'proactive', 'Dementia Australia'],
    source_url: 'https://www.dementia.org.au/information/about-dementia',
    source_org: 'Dementia Australia',
    embedding: null,
  },
];
