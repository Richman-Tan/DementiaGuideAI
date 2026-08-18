// Instrument wording, mirroring docs/study/instruments.md.
//
// If an item changes here it changes there too, and the protocol version
// increments — comparability depends on the wording being stable across
// participants (docs/study/pilot-checklist.md §4).

const AGREE_5 = [
  { value: 1, label: '1 — Strongly disagree' },
  { value: 2, label: '2 — Disagree' },
  { value: 3, label: '3 — Neither' },
  { value: 4, label: '4 — Agree' },
  { value: 5, label: '5 — Strongly agree' },
];

// Standard SUS, ten items, fixed order. "System" is replaced throughout by
// "this way of using the app" so participants score the interface rather than
// the product — the only permitted deviation, and it is declared in the
// write-up (instruments.md §4). Odd items are positive, even items negative;
// scoring lives in scripts/study/analyse-study.mjs.
export const SUS_ITEMS = [
  { id: 'q1', positive: true, text: 'I think that I would like to use this way of using the app frequently.' },
  { id: 'q2', positive: false, text: 'I found this way of using the app unnecessarily complex.' },
  { id: 'q3', positive: true, text: 'I thought this way of using the app was easy to use.' },
  { id: 'q4', positive: false, text: 'I think that I would need the support of a technical person to be able to use this way of using the app.' },
  { id: 'q5', positive: true, text: 'I found the various functions in this way of using the app were well integrated.' },
  { id: 'q6', positive: false, text: 'I thought there was too much inconsistency in this way of using the app.' },
  { id: 'q7', positive: true, text: 'I would imagine that most people would learn to use this way of using the app very quickly.' },
  { id: 'q8', positive: false, text: 'I found this way of using the app very awkward to use.' },
  { id: 'q9', positive: true, text: 'I felt very confident using this way of using the app.' },
  { id: 'q10', positive: false, text: 'I needed to learn a lot of things before I could get going with this way of using the app.' },
];

// The four constructs SUS does not carry. Trust and engagement matter here in a
// way they would not for a general productivity tool.
export const LIKERT_ITEMS = [
  { id: 'trust', construct: 'trust', text: 'I would trust the information this gave me.', options: AGREE_5 },
  { id: 'engagement', construct: 'engagement', text: 'I found this way of getting answers engaging.', options: AGREE_5 },
  { id: 'helpfulness', construct: 'helpfulness', text: 'The answers I got would be helpful in a real situation.', options: AGREE_5 },
  { id: 'clarity', construct: 'clarity', text: 'The answers were easy to understand.', options: AGREE_5 },
];

// Shortened set for participants living with dementia (instruments.md §7). Ten
// mixed-polarity abstract statements are a poor instrument for this group, and
// the aim here is accessibility feedback rather than a comparable score.
export const PLWD_ITEMS = [
  {
    id: 'easy', text: 'Was that easy or hard to use?',
    options: [{ value: 'easy', label: 'Easy' }, { value: 'between', label: 'In between' }, { value: 'hard', label: 'Hard' }],
  },
  {
    id: 'understand', text: 'Was it easy to understand what it told you?',
    options: [{ value: 'easy', label: 'Easy' }, { value: 'between', label: 'In between' }, { value: 'hard', label: 'Hard' }],
  },
  {
    id: 'would_use', text: 'Would you want to use something like this?',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' }],
  },
];

// Asked once at the end, in place of the five-question debrief — instruments.md
// §7 item 4 plus the support person's two questions. The standard debrief is too
// long for this group; showing it anyway would breach the fatigue safeguard in
// protocol.md §3.3.
export const PLWD_DEBRIEF = [
  { id: 'preference', text: 'Which one did you like better — talking to it, or typing? Why?' },
];

export const SUPPORTER_DEBRIEF = [
  { id: 'helped_with', text: 'Was there anything you had to help with?' },
  { id: 'noticed_difficult', text: 'Was there anything you noticed that they found difficult?' },
];

export const BACKGROUND = [
  {
    id: 'age', text: 'Which age band are you in?',
    options: ['Under 40', '40–54', '55–64', '65–74', '75 or over', 'Prefer not to say'],
  },
  {
    id: 'tech_confidence', text: 'How comfortable are you with new apps and websites?',
    options: [
      { value: 1, label: '1 — Not at all comfortable' },
      { value: 2, label: '2' },
      { value: 3, label: '3 — In between' },
      { value: 4, label: '4' },
      { value: 5, label: '5 — Very comfortable' },
    ],
  },
  {
    id: 'prior_ai', text: 'Have you used an AI assistant before — for example ChatGPT, Siri or Alexa?',
    options: ['Never', 'Once or twice', 'Sometimes', 'Often'],
  },
  {
    id: 'years_caring', optional: true,
    text: 'Roughly how long have you been caring for someone with dementia?',
    options: ['Under 1 year', '1–3 years', 'More than 3 years', 'I no longer provide care', 'Not applicable'],
  },
];

// Asked after each of the six tasks, so kept to two items.
export const POST_TASK = [
  {
    id: 'found', text: 'Did you find what you needed?',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'partly', label: 'Partly' }, { value: 'no', label: 'No' }],
  },
  {
    id: 'effort', text: 'How easy or hard was that to do?',
    options: [
      { value: 1, label: '1 — Very hard' },
      { value: 2, label: '2 — Hard' },
      { value: 3, label: '3 — Neither' },
      { value: 4, label: '4 — Easy' },
      { value: 5, label: '5 — Very easy' },
    ],
  },
];

// Five is the ceiling before drop-off in an unmoderated study. Question 4 is a
// safety instrument, not a satisfaction one — its answers are read alongside the
// transcript safety scan and reported either way (instruments.md §6).
export const DEBRIEF = [
  { id: 'preference', text: 'Which of the two ways of using the app did you prefer, and why?' },
  { id: 'friction', text: 'Was there anything that felt confusing, frustrating, or harder than it needed to be?' },
  { id: 'tailored', text: 'Did the answers feel like they were written for someone in your situation? What made you say that?' },
  { id: 'would_check', text: 'Was there anything the app said that you would want to check with a doctor, nurse, or another person before acting on it?' },
  { id: 'anything_else', text: 'Is there anything else you would like us to know?' },
];
