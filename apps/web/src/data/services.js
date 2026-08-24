// DementiaGuide AI — library metadata + mock service layer. CATS/ARTICLES hold
// the library index; full article bodies live in ./articles/ (lazy-loaded per
// category, grounded and cited — see docs/web/library-source-map.md);
// mockReply/seedThread power mock mode (no API keys / VITE_FORCE_MOCK / ?mock=1).
// The real chat path lives in src/services/ (OpenAI gpt-4o + Supabase pgvector).

import { searchTextOf } from './articles/index.js';

export const CATS = [
  { id: 'caregiving', name: 'Caregiving Advice', desc: 'Practical daily care tips and strategies', accent: '#E8956D', pale: '#FBEEE6', dk: '#3A2A20' },
  { id: 'clinical', name: 'Clinical Guidelines', desc: 'Evidence-based medical recommendations', accent: '#4A7C8E', pale: '#EBF3F6', dk: '#16303A' },
  { id: 'best', name: 'Best Practices', desc: 'Research-backed behavioural care approaches', accent: '#F0C070', pale: '#FCF3DF', dk: '#39301B' },
  { id: 'communication', name: 'Communication', desc: 'Connecting with loved ones with dementia', accent: '#9B8DC4', pale: '#F0EDF8', dk: '#2A2538' },
  { id: 'safety', name: 'Home Safety', desc: 'Making the home safe for someone with dementia', accent: '#D4756B', pale: '#F9E9E7', dk: '#37211F' },
  { id: 'wellbeing', name: 'Carer Wellbeing', desc: 'Supporting the health and resilience of family carers', accent: '#7FB5A0', pale: '#EAF4F0', dk: '#1F2F29' },
  { id: 'prevention', name: 'Prevention & Early Detection', desc: 'Risk factors, warning signs, and brain health strategies', accent: '#5B9BD5', pale: '#E7F0FA', dk: '#1B2A3A' }
];

const A = (id, cat, title, sum, mins, tags) => ({ id, cat, title, sum, mins, tags });
export const ARTICLES = [
  A('managing-sundowning', 'caregiving', 'Managing Sundowning Behaviour', 'Why late-day restlessness happens and calm ways to respond', 7),
  A('safe-home', 'caregiving', 'Creating a Safe Home Environment', 'Simple changes that prevent accidents and reduce worry', 6),
  A('hygiene-bathing', 'caregiving', 'Personal Hygiene and Bathing Assistance', 'Respectful, low-stress approaches to washing and grooming', 6),
  A('mealtimes', 'caregiving', 'Mealtimes and Nutrition Support', 'Encouraging eating and drinking without pressure', 5),
  A('daily-routine', 'caregiving', 'Building a Daily Routine That Works', 'Structure that reassures without feeling rigid', 5),
  A('continence', 'caregiving', 'Continence Care with Dignity', 'Practical help while protecting self-respect', 6),
  A('sleep-rest', 'caregiving', 'Supporting Sleep and Rest', 'Gentle ways to improve nights for everyone', 5),
  A('stages', 'clinical', 'Understanding the Stages of Dementia', 'What mild, moderate and severe stages usually look like', 8),
  A('medications', 'clinical', 'Medications Used in Dementia', 'Common medicines, what they do, and what to watch for', 7),
  A('urgent-review', 'clinical', 'When to Seek Urgent Medical Review', 'Changes that need a doctor today, not next week', 4),
  A('types', 'clinical', 'Types of Dementia Explained', "Alzheimer's, vascular, Lewy body and others in plain language", 7),
  A('gp-specialists', 'clinical', 'Working with Your GP and Specialists', 'Getting the most from appointments and referrals', 5),
  A('pain', 'clinical', 'Pain Recognition and Management', 'Spotting pain when someone cannot say they hurt', 6),
  A('diagnosis', 'clinical', 'Understanding a Dementia Diagnosis', 'What the diagnosis means and sensible next steps', 6),
  A('repetitive', 'best', 'Responding to Repetitive Questions and Actions', 'Why repetition happens and kind ways to respond', 5),
  A('aggression', 'best', 'Handling Physical Aggression and Agitation', 'Staying safe and calm when behaviour escalates', 8),
  A('burnout', 'best', 'Carer Wellbeing and Burnout Prevention', 'Recognising burnout early and protecting yourself', 10),
  A('person-centred', 'best', 'Person-Centred Care Principles', 'Seeing the person first, the dementia second', 6),
  A('music-reminiscence', 'best', 'Using Music and Reminiscence', 'Memory-friendly activities that lift mood', 5),
  A('refusals', 'best', 'Managing Refusals of Care', 'What to do when help is turned down', 6),
  A('validation', 'best', 'Validation Instead of Correction', 'Meeting someone in their reality, not arguing with it', 5),
  A('memory-loss-communication', 'communication', 'Communicating with Memory Loss', 'Conversation techniques that reduce frustration', 5),
  A('talking-diagnosis', 'communication', 'Talking About the Diagnosis', 'Honest, gentle conversations with the person and whānau', 6),
  A('non-verbal', 'communication', 'Non-Verbal Communication Cues', 'Tone, touch and body language when words fade', 5),
  A('driving', 'communication', 'Difficult Conversations About Driving', 'Raising driving safety without a battle', 6),
  A('staying-connected', 'communication', 'Keeping Connections with Family and Friends', 'Helping relationships survive the diagnosis', 5),
  A('later-stages-communication', 'communication', 'Communicating in Later Stages', 'Staying connected when speech is largely gone', 6),
  A('visiting', 'communication', 'Visiting Someone with Dementia', 'Making visits calm, positive and worthwhile', 4),
  A('wandering', 'safety', 'Wandering Prevention and Safe-Return Strategies', 'Reducing risk and planning for if someone goes missing', 7),
  A('anxiety-environment', 'safety', 'Reducing Anxiety Through Environment Design', 'How light, noise and layout affect behaviour', 6),
  A('kitchen-bathroom', 'safety', 'Kitchen and Bathroom Safety', 'Managing the two highest-risk rooms in the house', 5),
  A('falls', 'safety', 'Preventing Falls at Home', 'Simple fixes that dramatically cut fall risk', 6),
  A('wayfinding', 'safety', 'Lighting, Signage and Wayfinding', 'Helping someone find their way around home', 5),
  A('home-technology', 'safety', 'Technology That Can Help at Home', 'Sensors, locators and reminders — what is worth it', 6),
  A('doors', 'safety', 'Securing Doors Without Locking Someone In', 'Balancing safety with freedom and dignity', 5),
  A('carer-stress', 'wellbeing', 'Recognising Carer Stress', 'Early warning signs that you need more support', 5),
  A('respite', 'wellbeing', 'What Respite Care Options Are Available', 'In-home, day programme and residential respite in NZ', 7),
  A('accepting-help', 'wellbeing', 'Asking For and Accepting Help', 'Why it is hard, and scripts that make it easier', 5),
  A('grief', 'wellbeing', 'Grief and Anticipatory Loss', 'Grieving someone who is still here', 6),
  A('own-health', 'wellbeing', 'Looking After Your Own Health', 'Your health checks matter as much as theirs', 5),
  A('support-groups', 'wellbeing', 'Support Groups in New Zealand', 'Finding your people through Dementia NZ and Alzheimers NZ', 4),
  A('work-caring', 'wellbeing', 'Balancing Work and Caring', 'Your rights, flexible work and realistic limits', 6),
  A('early-signs', 'prevention', 'What Are the Early Signs of Dementia', 'Changes that go beyond normal ageing', 6),
  A('risk-factors', 'prevention', 'Risk Factors You Can Change', 'The 12 modifiable risks and what they mean for you', 7),
  A('brain-habits', 'prevention', 'Brain-Healthy Habits', 'Everyday choices that support brain health', 5),
  A('hearing-vision', 'prevention', 'Hearing, Vision and Dementia Risk', 'Why treating hearing loss protects the brain', 5),
  A('normal-ageing', 'prevention', 'When Forgetfulness Is Normal Ageing', 'Telling everyday lapses apart from warning signs', 4),
  A('memory-assessment', 'prevention', 'Getting a Memory Assessment', 'What happens at a memory clinic and how to prepare', 6),
  A('heart-brain', 'prevention', 'Heart Health and Brain Health', 'Blood pressure, exercise and dementia risk', 5)
];

export const getArticle = (id) => ARTICLES.find((a) => a.id === id);
export const getCat = (id) => CATS.find((c) => c.id === id);
export const relatedTo = (a) => ARTICLES.filter((x) => x.cat === a.cat && x.id !== a.id).slice(0, 3);
export const searchArticles = (q) => {
  const t = q.trim().toLowerCase();
  if (!t) return ARTICLES;
  return ARTICLES.filter(
    (a) =>
      (a.title + ' ' + a.sum + ' ' + (a.tags || []).join(' ') + ' ' + getCat(a.cat).name).toLowerCase().includes(t) ||
      searchTextOf(a.id).includes(t)
  );
};

export const tagsFor = (a) => a.tags || [getCat(a.cat).name, 'Practical guide'];
export const excerptFor = (a) => a.sum;

export const QUICK_QUESTIONS = [
  'How do I manage sundowning?',
  'What are early signs of dementia?',
  'How can I help with wandering?',
  'What medications are commonly used?',
  'How do I handle aggressive behaviour?',
  'What respite care options are available?'
];

export const FEATURED = ['stages', 'safe-home', 'memory-loss-communication', 'burnout']
  .map((id) => ({ id, mins: getArticle(id).mins }));

export const SAFETY_NOTE = 'If anyone is in immediate danger, call 111. For urgent health advice any time, call Healthline on 0800 611 116 — free, 24 hours.';

const cite = (ids) => ids.map((id) => { const a = getArticle(id); return { id: a.id, title: a.title, cat: a.cat }; });
const R = (long, short, ids, safety) => ({ long, short, citations: cite(ids), safety: !!safety });

const REPLIES = [
  { k: ['sundown', 'evening', 'restless at night'], r: R(
    "Sundowning — becoming more restless or confused in the late afternoon and evening — is very common, and it isn't anyone's fault [1]. A steady, calm afternoon usually helps most: a quiet activity after lunch, a light snack, and closing the curtains with warm lamps on before dusk so the light change is gentle [1]. Reducing background noise and clutter in the evening makes a real difference too [2]. In the moment, respond to the feeling rather than the words — reassure, don't argue — and try redirecting to a cup of tea or familiar music. If it happens most days, note what tends to set it off; tiredness, hunger and noise are frequent triggers.",
    "Sundowning — late-day restlessness — is very common and not your fault [1]. Keep afternoons calm, close curtains before dusk, reduce noise, and redirect gently rather than correcting [1][2].",
    ['managing-sundowning', 'anxiety-environment']) },
  { k: ['early sign', 'first sign', 'warning sign'], r: R(
    "Early dementia usually shows up as changes that go beyond ordinary forgetfulness: repeating the same question within minutes, getting lost on familiar routes, trouble following a recipe or paying bills, or noticeable changes in mood and judgement [1]. Occasionally forgetting a name and remembering it later is normal ageing; forgetting how you know the person may not be [2]. If several of these changes have appeared over months, a GP visit is the right next step — many causes of memory change are treatable, so an assessment is worthwhile either way [3].",
    "Look for changes beyond normal ageing: repeated questions, getting lost on familiar routes, trouble with money or planning, mood changes [1][2]. If several have appeared over months, see a GP [3].",
    ['early-signs', 'normal-ageing', 'memory-assessment']) },
  { k: ['wander'], r: R(
    "Wandering usually has a reason behind it — searching for something familiar, boredom, or a routine from earlier life like heading to work [1]. Reducing the urge helps most: regular exercise, meaningful activity, and making sure needs like the toilet or hunger are met. Practical safeguards include door chimes, disguising exit doors, and keeping keys out of sight [1]. It's also wise to prepare for a safe return: a recent photo on hand, ID or a medical bracelet, and letting trusted neighbours know [1]. Good lighting and clear signage at home reduce disorientation that can trigger wandering [2].",
    "Wandering usually has a reason — boredom, searching, old routines [1]. Reduce the urge with activity and exercise; add door chimes and keep a recent photo and ID ready in case they go missing [1][2].",
    ['wandering', 'wayfinding']) },
  { k: ['medication', 'medicine', 'drug'], r: R(
    "Medicines for dementia fall into two broad groups [1]. Cholinesterase inhibitors like donepezil can ease symptoms in mild-to-moderate Alzheimer's for a time; memantine is sometimes used at later stages. They don't stop the disease, and benefits vary from person to person. Other medicines may be used short-term for distressing symptoms like severe agitation, but these need careful review because of side effects [1]. Always keep an up-to-date medicines list and ask the GP or pharmacist to review it regularly — especially after any hospital stay [2].",
    "Two main groups: cholinesterase inhibitors (e.g. donepezil) for symptoms, and memantine for later stages [1]. They help some people for a time but don't stop the disease. Keep the medicines list reviewed regularly [2].",
    ['medications', 'gp-specialists']) },
  { k: ['aggress', 'aggres', 'hit', 'violen', 'angry', 'lash'], r: R(
    "I'm sorry — aggression is frightening, and your safety matters just as much as theirs. Aggression is almost always communication: pain, fear, feeling rushed or cornered, or too much noise [1]. In the moment: step back to give space, lower your voice, stop the task, and don't block the doorway. Never argue back or restrain — leave the room if you need to; it is not abandoning them [1]. Afterwards, look for the trigger, and mention it to the GP: sudden aggression can signal pain or infection [2]. If this is happening often, please tell the GP — there is real help available, and you shouldn't carry this alone.",
    "Step back, lower your voice, stop the task, don't block the doorway [1]. Never restrain. It's usually pain, fear or overwhelm — mention it to the GP, especially if it's new [2]. Your safety matters too.",
    ['aggression', 'urgent-review'], true) },
  { k: ['respite'], r: R(
    "Respite gives you a proper break, and using it early — before you're exhausted — is what keeps care sustainable [1]. In New Zealand there are three main forms: in-home respite (a support worker comes to you), day programmes (a few hours of activities, often through Dementia NZ or Alzheimers NZ groups), and short residential stays. Start with a Needs Assessment (ask your GP for a NASC referral) — it's free and unlocks funded options [1]. Asking for a break is one of the most responsible things a carer can do [2].",
    "Three NZ options: in-home respite, day programmes, and short residential stays [1]. Ask your GP for a NASC needs-assessment referral — it's free and unlocks funding [1][2].",
    ['respite', 'accepting-help']) },
  { k: ['bath', 'shower', 'hygiene', 'wash'], r: R(
    "Bathing is one of the most common flashpoints, usually because it feels exposing and confusing rather than because the person is being difficult [1]. What helps: warm the room first, have everything ready, offer choices ('bath or flannel wash?'), keep them covered with a towel as much as possible, and narrate gently as you go. A hand-held shower head feels less alarming than water from overhead. If washing is refused, a flannel wash today is a win — a full shower can wait for a calmer day [2].",
    "Warm the room, prepare everything first, offer choices, keep them covered, narrate gently [1]. A flannel wash on a hard day is a win [2].",
    ['hygiene-bathing', 'refusals']) },
  { k: ['repeat', 'same question'], r: R(
    "Repeated questions happen because the brain isn't storing the answer — each time truly feels like the first ask, so patience isn't being ignored [1]. Answer calmly in the same words, then redirect to an activity. If the question has an anxious theme ('when are we going home?'), respond to the worry underneath: reassurance often quiets the question better than the answer does [2]. Written notes or a visible whiteboard help some people. And it's okay to step out of the room for a breather — repetition wears everyone down.",
    "Each ask truly feels like the first — answer calmly in the same words, then redirect [1]. Respond to the worry underneath anxious questions [2]. Take breathers; repetition is wearing.",
    ['repetitive', 'validation']) }
];

// Mock reply used when no API key is stored (or mock mode is forced).
export function mockReply(q, settings, opts = {}) {
  if (opts.fail) return { error: true };
  const t = q.toLowerCase();
  const hit = REPLIES.find((r) => r.k.some((k) => t.includes(k)));
  const concise = settings && settings.concise;
  if (hit) return { text: concise ? hit.r.short : hit.r.long, citations: hit.r.citations, safety: hit.r.safety };
  const generic = R(
    "That's a good question. I don't have a specific guide on that exact topic, but the approach that helps most situations is the same: look for the need or feeling behind the behaviour, keep routines steady, and change the environment before trying to change the person [1]. You might find it useful to browse the Library — or ask me about a specific situation (for example, mealtimes, bathing, or evenings) and I can point you to the right guide.",
    "Look for the need behind the behaviour, keep routines steady, and adjust the environment first [1]. Try browsing the Library, or ask me something more specific.",
    ['person-centred']);
  return { text: concise ? generic.short : generic.long, citations: generic.citations, safety: false };
}

export function seedThread() {
  const r1 = mockReply('How do I manage sundowning?', null);
  const r2 = mockReply('How do I handle aggressive behaviour?', null);
  return [
    { role: 'user', text: 'How do I manage sundowning?', time: '9:41 am' },
    { role: 'aria', text: r1.text, citations: r1.citations, safety: false, time: '9:41 am' },
    { role: 'user', text: 'Some evenings he lashes out at me and I get scared. What should I do?', time: '9:44 am' },
    { role: 'aria', text: r2.text, citations: r2.citations, safety: true, time: '9:44 am' }
  ];
}

export const VOICE_QUESTIONS = QUICK_QUESTIONS;
