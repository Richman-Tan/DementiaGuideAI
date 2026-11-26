// What the privacy page says, as data, so that it can be held to the truth.
//
// The app answers questions in one of two ways, decided when it is built
// (services/turnClient.js, `serverPipelineEnabled`):
//
//   - on the server (POST /api/turn): the question goes to our server, which
//     searches the library and asks the model. Nothing leaves the browser for
//     a model provider.
//   - in the browser: the browser sends the question to the model provider
//     itself, with a key or an access code.
//
// Who sees a question, and what is recorded about it, differ between the two,
// so the page says a different thing for each. What it says for the server
// path follows the code: the providers in apps/api/src/providers.ts and
// apps/api/src/speak.ts, the meter in apps/api/api/_lib/usage.js, and the trace
// in apps/api/src/trace.ts. Change those and this changes with them.

const INTRO =
  'DementiaGuide AI is built for people navigating a hard season of life, and we think privacy is part of good care. This page says plainly what is kept, where it is kept, and how to get rid of it.';

const conversations = (who) => ({
  heading: 'Your conversations',
  paragraphs: [
    `Your conversations with ${who} are saved to an account so that they are still here the next time you open the app, and a recent copy is kept in this browser so the app opens instantly. The account is created for you automatically and anonymously — there is no sign-up form, no email address, and no password unless you choose to add one. We do not know who you are.`,
    'If that account cannot be created — some browsers and privacy settings block it — the app still works, and your conversations are then kept only in this browser. Settings → Privacy & Trust → Data Security always tells you which of the two is happening right now.',
  ],
});

const DELETING = {
  heading: 'Deleting them',
  paragraphs: [
    'Settings → Clear Conversation History deletes every past conversation from the account and from this browser. That is a real deletion, not a hidden archive, and it cannot be undone. Clearing your browser data on its own only removes the local copy — use Clear Conversation History if you want the stored copy gone too.',
  ],
};

const QUESTIONS = {
  heading: 'Questions',
  paragraphs: [
    'This app is a University of Auckland Part IV Software Engineering project. Questions about privacy can be directed to the project team through the University.',
  ],
};

const LIBRARY =
  'The library articles are the same for everyone — reading them reveals nothing about you to us.';

/** Answers written in the browser, with a key or an access code. */
const inBrowser = [
  {
    heading: 'What stays on this device',
    paragraphs: [
      'Your setup choices, accessibility settings and any API keys stay in this browser and are never uploaded.',
    ],
  },
  {
    heading: 'Who else sees your questions',
    paragraphs: [
      "To answer you, your question and the library passages used to answer it are sent to an AI provider (OpenAI), and the answer may be sent to a speech provider (ElevenLabs) to be read aloud. Those providers process it under their own terms and may retain it briefly to detect abuse. If you use voice input, speech recognition may be done by your browser — in Chrome and Edge that sends audio to the browser vendor's speech service; where that is unavailable, audio is transcribed by the AI provider instead. No recording of your voice is kept by this app.",
    ],
  },
  {
    heading: "What we don't do",
    paragraphs: [
      `We don't collect analytics about your questions, sell or share your data, or use your conversations to train AI models. ${LIBRARY}`,
    ],
  },
];

/** Answers written on our server. */
const onServer = (who) => [
  {
    heading: 'What stays on this device',
    paragraphs: [
      `Your setup choices and accessibility settings are kept in this browser. The choices about how answers are written — how much detail, what to do with medical words, the tone, and whether you talk with ${who} — are sent along with each question so that the answer can follow them. They are not stored on the server. Any API key you add yourself stays in this browser.`,
    ],
  },
  {
    heading: 'Who else sees your questions',
    paragraphs: [
      'To answer you, your question and the recent part of the conversation are sent to our server. The server sends the question to a search provider (Voyage AI) to find the library passages that fit it, and then sends the question, that part of the conversation and those passages to an AI provider (Anthropic), which writes the answer. When an answer is read aloud, the words to be spoken are sent to a speech provider (ElevenLabs). Those providers process what they are sent under their own terms and may retain it briefly to detect abuse.',
      "If you talk instead of typing, your browser turns your speech into text. In Chrome and Edge that sends audio to the browser vendor's speech service. If your browser cannot do it and you have added your own OpenAI key in Settings, the audio is transcribed by OpenAI instead. No recording of your voice is kept by this app.",
    ],
  },
  {
    heading: 'What the server keeps',
    paragraphs: [
      'Apart from your saved conversations, two small records are made each time you ask something.',
      'The first is a count of what the request used: how much text was processed, and by which model. It is kept against your anonymous account, and it is what holds the service to its daily limit.',
      'The second is a note of what the system did to answer: how long each step took, which library passages it found and which it cited, whether the safety check was raised, and how long the question and the answer were. It does not contain your question, the answer or your account, and its time is kept only to the hour.',
    ],
  },
  {
    heading: "What we don't do",
    paragraphs: [
      `We don't sell or share your data, or use your conversations to train AI models. The only things measured about your questions are the two records described above. ${LIBRARY}`,
    ],
  },
];

/**
 * The page, top to bottom.
 *
 * @param {object} options
 * @param {string} options.who     The chosen guide's name.
 * @param {boolean} options.server Whether answers are written on our server.
 * @returns {{ intro: string, sections: { heading: string, paragraphs: string[] }[] }}
 */
export function privacyCopy({ who, server }) {
  return {
    intro: INTRO,
    sections: [conversations(who), DELETING, ...(server ? onServer(who) : inBrowser), QUESTIONS],
  };
}
