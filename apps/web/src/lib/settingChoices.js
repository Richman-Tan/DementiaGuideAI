// The settings a person chooses from a few options, in one place: the setup
// screens and Settings both offer them, and must not drift apart. Most are
// about how answers are written; the last three are who speaks, how fast, and
// how large the text is.
//
// Each option's `value` is what is stored in settings (and what
// state/mapSettingsToRag.js turns into the prompt's vocabulary). Each `note`
// says what choosing it does, in the person's terms. `fallback` is the option
// a missing or unrecognised stored value is treated as when an answer is
// written; tests/settingChoices.test.js holds it to mapSettingsToRag.

import { AVATAR_PROFILES, DEFAULT_AVATAR_ID } from '../avatar/avatarProfiles.js';

/** Who the answers are written for. */
export const askingFor = (name) => ({
  key: 'setupType',
  label: 'Who are you asking for?',
  fallback: 'caring',
  options: [
    {
      value: 'caring',
      label: 'Someone I care for',
      note: `${name} speaks to you as a carer or support worker.`,
    },
    { value: 'exploring', label: 'Myself', note: `${name} speaks to you directly.` },
  ],
});

/** How long the written part of an answer is. */
export const DETAIL = {
  key: 'responseStyle',
  label: 'How much detail?',
  fallback: 'balanced',
  options: [
    { value: 'short', label: 'Short', note: 'A few sentences, straight to the point.' },
    { value: 'balanced', label: 'Balanced', note: 'Two to four short paragraphs.' },
    {
      value: 'thorough',
      label: 'Thorough',
      note: 'Four to six paragraphs, with context and examples.',
    },
  ],
};

/** What happens to medical words. */
export const MEDICAL_WORDS = {
  key: 'jargon',
  label: 'Medical words',
  fallback: 'explained',
  options: [
    { value: 'plain', label: 'Avoid them', note: 'No medical terms: the simplest everyday word.' },
    {
      value: 'explained',
      label: 'Explain them',
      note: 'Medical terms are explained in plain language as they come up.',
    },
    {
      value: 'fine',
      label: 'Leave them',
      note: 'Everyday language, with medical terms left as they are.',
    },
  ],
};

/** The tone of an answer. */
export const STYLE = {
  key: 'ariaStyle',
  label: 'Style',
  fallback: 'warm',
  options: [
    { value: 'warm', label: 'Warm', note: 'Acknowledges how you feel before the information.' },
    { value: 'calm', label: 'Calm', note: 'Clear and measured, without much emotional language.' },
    {
      value: 'practical',
      label: 'Practical',
      note: 'Leads with what is most useful and skips long preambles.',
    },
  ],
};

/** Who speaks. Each guide's note says what they sound like. */
export const GUIDE = {
  key: 'avatarId',
  label: 'Who would you like to talk with?',
  fallback: DEFAULT_AVATAR_ID,
  options: Object.values(AVATAR_PROFILES).map((profile) => ({
    value: profile.id,
    label: profile.name,
    note: profile.voiceNote,
  })),
};

/** How fast the guide speaks. */
export const voiceSpeed = (name) => ({
  key: 'voiceSpeed',
  label: 'Voice speed',
  fallback: 'normal',
  options: ['Slower', 'Normal', 'Faster'].map((label) => ({
    value: label.toLowerCase(),
    label,
    note: `How fast ${name} speaks.`,
  })),
});

/** The size of all text. Stored as a number: the factor the base size is multiplied by. */
export const TEXT_SIZE = {
  key: 'textScale',
  label: 'Text size',
  fallback: '1',
  numeric: true,
  options: [
    ['0.85', 'Small'],
    ['1', 'Medium'],
    ['1.25', 'Large'],
  ].map(([value, label]) => ({ value, label, note: 'Takes effect everywhere, straight away.' })),
};

/**
 * The option to show as chosen, which is the one answers are being written to.
 *
 * Two things make that differ from the stored value. Settings can hold values
 * no longer offered ("I work in care professionally" from the earlier, longer
 * setup; a guide since retired), which fall back as they do wherever the
 * setting is used. And "Get to the Point" in Settings overrides the length, so
 * with it on the detail in force is Short whatever is stored.
 */
export function current(choice, settings) {
  const stored =
    choice.key === 'responseStyle' && settings.concise ? 'short' : settings[choice.key];
  // Options are strings, as a radio group's values are; a stored number is compared as one.
  const value = stored === undefined || stored === null ? '' : String(stored);
  return choice.options.some((option) => option.value === value) ? value : choice.fallback;
}

/**
 * What to store when an option is picked. "Short" also turns on the concise
 * style, and any other length turns it off, as the setup screens always did.
 */
export const pick = (choice, value) =>
  choice.key === 'responseStyle'
    ? { responseStyle: value, concise: value === 'short' }
    : { [choice.key]: choice.numeric ? Number(value) : value };
