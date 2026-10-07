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

/**
 * Consent ticks — one per numbered item on the approved consent form
 * (docs/study/ethics/consent-form.md), in the same order.
 *
 * The correspondence is the point, not a nicety. `session.js` stamps every
 * session with `formVersion: CONSENT_FORM_VERSION`, so a recorded consent event
 * asserts the participant agreed to *that* form. When this list was shorter than
 * the form, that assertion was false: the screen carried seven ticks against a
 * twelve-item form, and the ones missing were the overseas-transfer item — the
 * one most needing an explicit tick, and the only place the app would name
 * OpenAI or ElevenLabs at all — plus conversation storage and publication.
 *
 * Form item 9 is the optional transcript question, asked separately on the same
 * screen because declining it must not block participation. Keep the ids stable:
 * they are the keys the consent JSON is stored under.
 *
 * `apps/web/tests/studyConsent.test.js` fails if this drifts from the form again.
 */
export const CONSENT_ITEMS = [
  // form 1
  { id: 'take_part', text: 'I agree to take part in this research.' },
  // form 2
  { id: 'voluntary', text: 'I understand that taking part is voluntary, and that I may stop at any time without giving a reason and without any disadvantage.' },
  // form 3
  { id: 'fictional', text: 'I understand that the situations are made up, and that I should not enter real names or anything that would identify me or anyone else.' },
  // form 4
  { id: 'not_advice', text: 'I understand that the app gives general information only, that it is not medical advice, that it is a research prototype which may be wrong, and that I should consult a health professional about any real decision.' },
  // form 5
  { id: 'collection', text: 'I agree to the collection of my questionnaire answers, the time I take on each task, the number of questions I ask, and technical information about my browser and the app’s response times.' },
  // form 6
  { id: 'no_audio', text: 'I understand that no recording of my voice is kept, and that anything I say to the app is converted to text with only the text retained.' },
  // form 7
  { id: 'saves_conversations', text: 'I understand that the app saves my conversations so that I can come back to them, in the same way any messaging app does, and that they are stored against an anonymous account identifier rather than my name.' },
  // form 8 — the cross-border transfer, and the only place the app names the providers
  { id: 'overseas_providers', text: 'I understand that answering my questions means my words are sent to overseas service providers (OpenAI, and ElevenLabs for the spoken voice), that they receive no name or contact details, and that the project account is not on any tier that uses submitted text to train models.' },
  // form 10
  { id: 'storage_code', text: 'I understand that my study data is stored against a participant code and not my name, held securely for six years, and then destroyed.' },
  // form 11
  { id: 'deletion_window', text: 'I understand that I may ask for my data to be deleted up to two weeks after my session by contacting the researcher and quoting my participant code, and that after that point my data cannot be identified.' },
  // form 12
  { id: 'reporting', text: 'I understand that anonymised findings will be reported in the researcher’s project report and may be presented or published, and that nothing identifying me will be included.' },
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

/**
 * The constructs SUS does not carry, asked once per arm.
 *
 * The first four are the pre-registered composite (protocol.md §7.1). The last
 * two were added on 2026-08-19, before the first participant, and are reported
 * separately rather than folded into that composite — see PRE_REGISTERED_LIKERT
 * in @core/study/studyConfig.mjs for why.
 *
 * Trust and engagement matter here in a way they would not for a general
 * productivity tool. Personalisation and actionability are the two halves of the
 * assessed outcome this platform is being built against — "personalised resource
 * navigation and management" — and until these items existed, the only evidence
 * for either was a single free-text debrief answer, which yields quotes but no
 * arm-to-arm comparison.
 *
 * Ids must match LIKERT_CONSTRUCTS; `apps/web/tests/studyInstruments.test.js`
 * fails if they drift.
 */
export const LIKERT_ITEMS = [
  { id: 'trust', construct: 'trust', text: 'I would trust the information this gave me.', options: AGREE_5 },
  { id: 'engagement', construct: 'engagement', text: 'I found this way of getting answers engaging.', options: AGREE_5 },
  { id: 'helpfulness', construct: 'helpfulness', text: 'The answers I got would be helpful in a real situation.', options: AGREE_5 },
  { id: 'clarity', construct: 'clarity', text: 'The answers were easy to understand.', options: AGREE_5 },
  // "Rather than general information" is the contrast that makes this a
  // personalisation item and not a second helpfulness item. Without it, someone
  // who got a good generic answer would rate it high and the measure would say
  // nothing about tailoring.
  { id: 'personalisation', construct: 'personalisation', text: 'The answers were about the situation I described, rather than general information anyone would get.', options: AGREE_5 },
  // The "navigation and management" half: an answer that is trusted, clear and
  // on-topic can still leave someone with no idea what to do on Monday morning.
  { id: 'actionability', construct: 'actionability', text: 'After using this, I would know what to do next.', options: AGREE_5 },
];

// Shortened set for participants living with dementia (instruments.md §7). Ten
// mixed-polarity abstract statements are a poor instrument for this group, and
// the aim here is accessibility feedback rather than a comparable score.
//
// Deliberately NOT extended with the two new Likert items. "Rather than general
// information anyone would get" is exactly the kind of abstract comparison the
// fatigue safeguard in protocol §3.3 exists to avoid, and this group's data is
// reported separately and thematically anyway — so the items would add burden
// without adding a comparison anyone will make.
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

// ─── Feedback protocol (Oct 2026) ────────────────────────────────────────────
//
// Wording is a DRAFT for the clinical collaborators to confirm before the mode
// is switched on (docs/study/protocol-feedback.md, "Before it goes live").

/**
 * Suggestions shown beside free use, from the clinical lead's scenario list
 * (23 Sep 2026). Ideas the participant may tick off, never tasks: the objection
 * to the tasks protocol was having to answer the researchers' questions instead
 * of trying the tool.
 *
 * What the team hopes to see for `sudden_confusion` and `normal_ageing` (prompt
 * contact with a health professional; general information and a GP, never an
 * assessment) is in the protocol document and deliberately NOT here — this file
 * ships to the browser.
 */
export const THINGS_TO_TRY = [
  { id: 'repeat_questions', text: 'Ask what might help when the person you care for asks the same question again and again.' },
  { id: 'respite', text: 'Ask about respite care near you.' },
  { id: 'sudden_confusion', text: 'Ask what to do if the person you care for has suddenly become much more confused since yesterday.' },
  { id: 'normal_ageing', text: 'Ask how dementia is different from normal ageing.' },
  { id: 'follow_up', text: 'Ask a follow-up question about one of the answers.' },
  { id: 'compare_ediva', text: 'Look up the same topic on the e-DiVA-NZ website, and think about which was more useful, and why.', ediva: true },
  { id: 'flag', text: 'Flag an answer you don’t agree with, using “Flag this answer” under it.' },
  // Round 1 only, per the scenario list. Remove for later rounds.
  { id: 'ediva_videos', text: 'Watch two or three of the e-DiVA-NZ videos, and think about whether a short video beside an answer here would help.', ediva: true },
];

/** Open questions after free use, for thematic analysis. Every one is skippable. */
export const FEEDBACK_QUESTIONS = [
  { id: 'useful', text: 'What did you find useful?' },
  { id: 'confusing', text: 'What was confusing or hard to use?' },
  { id: 'ediva', text: 'Compared with the e-DiVA-NZ website, which did you find more useful, and why?' },
  // Round 1 only, paired with the 'ediva_videos' suggestion above.
  { id: 'video', text: 'Would a short video beside an answer help, or is text enough?' },
  { id: 'change', text: 'What would you change?' },
];

// SUS with the standard substitution of "system" by "this app". The tasks
// protocol scores an interface ("this way of using the app"); free use scores
// the product. Same ids and polarity, so the same scorer applies.
export const FEEDBACK_SUS_ITEMS = SUS_ITEMS.map((item) => ({
  ...item,
  text: item.text.replaceAll('this way of using the app', 'this app'),
}));
