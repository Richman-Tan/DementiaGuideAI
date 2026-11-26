// The choices a person has about how answers are written, in one place: the
// setup screens and Settings both offer them, and must not drift apart.
//
// Each option's `value` is what is stored in settings (and what
// state/mapSettingsToRag.js turns into the prompt's vocabulary). Each `note`
// says what choosing it does, in the person's terms. `fallback` is the option
// a missing or unrecognised stored value is treated as when an answer is
// written; tests/answerChoices.test.js holds it to mapSettingsToRag.

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

/**
 * The option to show as chosen, which is the one answers are being written to.
 *
 * Two things make that differ from the stored value. Settings saved by the
 * earlier, longer setup can hold values no longer offered ("I work in care
 * professionally"), which fall back as they do when an answer is written. And
 * "Get to the Point" in Settings overrides the length, so with it on the
 * detail in force is Short whatever is stored.
 */
export function current(choice, settings) {
  const stored =
    choice.key === 'responseStyle' && settings.concise ? 'short' : settings[choice.key];
  return choice.options.some((option) => option.value === stored) ? stored : choice.fallback;
}

/**
 * What to store when an option is picked. "Short" also turns on the concise
 * style, and any other length turns it off, as the setup screens always did.
 */
export const pick = (choice, value) =>
  choice.key === 'responseStyle'
    ? { responseStyle: value, concise: value === 'short' }
    : { [choice.key]: value };
