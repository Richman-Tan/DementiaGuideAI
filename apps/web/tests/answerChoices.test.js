// The choices about how answers are written (src/lib/answerChoices.js), which
// setup and Settings both offer. What matters is that the option shown as
// chosen is the one answers are really being written to.
import { describe, it, expect } from 'vitest';
import {
  askingFor,
  current,
  DETAIL,
  MEDICAL_WORDS,
  pick,
  STYLE,
} from '../src/lib/answerChoices.js';
import { mapSettingsToRag } from '../src/state/mapSettingsToRag.js';
import { AVATAR_PROFILES } from '../src/avatar/avatarProfiles.js';

const ASKING = askingFor('Aaron');
const ALL = [ASKING, DETAIL, MEDICAL_WORDS, STYLE];

/** What the answering pipeline is told for a stored value of this choice. */
const told = (choice, value) => {
  const rag = mapSettingsToRag({ [choice.key]: value });
  return {
    setupType: rag.isCaregiversSetup,
    responseStyle: rag.responseStyle,
    jargon: rag.jargonMode,
    ariaStyle: rag.ariaPersonality,
  }[choice.key];
};

describe('each choice', () => {
  it.each(ALL)('$label: every option says what it does, in a sentence', (choice) => {
    for (const option of choice.options) {
      expect(option.label.length, option.value).toBeGreaterThan(2);
      expect(option.note, option.value).toMatch(/^[A-Z].+\.$/);
    }
    expect(new Set(choice.options.map((o) => o.value)).size).toBe(choice.options.length);
  });

  it.each(ALL)('$label: each option changes what the pipeline is told', (choice) => {
    // Two options that came to the same thing would be a question with no effect.
    const outcomes = choice.options.map((option) => told(choice, option.value));
    expect(new Set(outcomes).size, JSON.stringify(outcomes)).toBe(choice.options.length);
  });

  it.each(ALL)('$label: its fallback is what a missing value really means', (choice) => {
    expect(choice.options.map((o) => o.value)).toContain(choice.fallback);
    // An unset or unrecognised value is written to as the fallback option is.
    for (const unknown of [undefined, 'no-longer-offered']) {
      const outcome = told(choice, unknown);
      // The style is passed through as stored, and falls back where the request is built.
      if (choice.key === 'ariaStyle' && unknown) continue;
      expect(outcome, String(unknown)).toBe(told(choice, choice.fallback));
    }
  });

  it('names the chosen guide in who the answers are for', () => {
    const notes = askingFor('Ariana').options.map((o) => o.note);
    expect(notes).toEqual([
      'Ariana speaks to you as a carer or support worker.',
      'Ariana speaks to you directly.',
    ]);
  });
});

describe('the option shown as chosen', () => {
  it('is the stored one when it is still offered', () => {
    expect(current(DETAIL, { responseStyle: 'thorough' })).toBe('thorough');
    expect(current(MEDICAL_WORDS, { jargon: 'fine' })).toBe('fine');
    expect(current(STYLE, { ariaStyle: 'calm' })).toBe('calm');
    expect(current(ASKING, { setupType: 'exploring' })).toBe('exploring');
  });

  it('is the fallback for a value the longer setup stored and this one does not offer', () => {
    expect(current(ASKING, { setupType: 'professional' })).toBe('caring');
    expect(current(ASKING, { setupType: 'someone-else' })).toBe('caring');
    expect(current(DETAIL, {})).toBe('balanced');
    expect(current(MEDICAL_WORDS, { jargon: 'nonsense' })).toBe('explained');
    expect(current(STYLE, {})).toBe('warm');
  });

  it('is Short whenever "Get to the Point" is on, whatever length is stored', () => {
    expect(current(DETAIL, { responseStyle: 'thorough', concise: true })).toBe('short');
    expect(current(DETAIL, { responseStyle: 'thorough', concise: false })).toBe('thorough');
    // That switch is about length only.
    expect(current(MEDICAL_WORDS, { jargon: 'fine', concise: true })).toBe('fine');
  });
});

describe('picking an option', () => {
  it('stores it under the choice’s setting', () => {
    expect(pick(MEDICAL_WORDS, 'explained')).toEqual({ jargon: 'explained' });
    expect(pick(STYLE, 'practical')).toEqual({ ariaStyle: 'practical' });
    expect(pick(ASKING, 'exploring')).toEqual({ setupType: 'exploring' });
  });

  it('turns the concise style on with Short and off with any other length', () => {
    expect(pick(DETAIL, 'short')).toEqual({ responseStyle: 'short', concise: true });
    expect(pick(DETAIL, 'balanced')).toEqual({ responseStyle: 'balanced', concise: false });
    expect(pick(DETAIL, 'thorough')).toEqual({ responseStyle: 'thorough', concise: false });
  });

  it('then shows as chosen', () => {
    for (const choice of ALL) {
      for (const option of choice.options) {
        const settings = { concise: true, ...pick(choice, option.value) };
        if (choice.key !== 'responseStyle') settings.concise = false;
        expect(current(choice, settings), `${choice.key} ${option.value}`).toBe(option.value);
      }
    }
  });
});

describe('the guides', () => {
  it('each say what they sound like, so one can be chosen without hearing it', () => {
    for (const profile of Object.values(AVATAR_PROFILES)) {
      expect(profile.voiceNote, profile.id).toMatch(/voice, .+\.$/);
    }
    const notes = Object.values(AVATAR_PROFILES).map((p) => p.voiceNote);
    expect(new Set(notes).size).toBe(notes.length);
  });
});
