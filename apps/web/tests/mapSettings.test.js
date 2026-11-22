import { describe, it, expect } from 'vitest';
import { mapSettingsToRag, speechRateFor } from '@web/state/mapSettingsToRag.js';
import { buildSystemPrompt } from '@core/rag/prompt';
import { matchSourceToArticle } from '@web/services/kbToLibrary.js';

describe('mapSettingsToRag', () => {
  it('maps design enums to prompt enums', () => {
    expect(
      mapSettingsToRag({
        responseStyle: 'short',
        jargon: 'plain',
        ariaStyle: 'calm',
        concise: true,
        setupType: 'caring',
      })
    ).toEqual({
      conciseMode: true,
      responseStyle: 'brief',
      jargonMode: 'avoid',
      ariaPersonality: 'calm',
      isCaregiversSetup: true,
    });
    expect(
      mapSettingsToRag({ responseStyle: 'thorough', jargon: 'fine', setupType: 'exploring' })
    ).toMatchObject({ responseStyle: 'detailed', jargonMode: 'ok', isCaregiversSetup: false });
  });

  it('defaults safely on empty settings', () => {
    const m = mapSettingsToRag({});
    expect(m.responseStyle).toBe('balanced');
    expect(m.jargonMode).toBe('explain');
    expect(m.ariaPersonality).toBe('warm');
  });

  it('produces a working system prompt end-to-end', () => {
    const prompt = buildSystemPrompt(
      mapSettingsToRag({ responseStyle: 'short', jargon: 'plain', ariaStyle: 'practical' })
    );
    expect(prompt.length).toBeGreaterThan(200);
  });

  it('maps voice speed with the mobile default', () => {
    expect(speechRateFor({})).toBe(0.78);
    expect(speechRateFor({ voiceSpeed: 'slower' })).toBe(0.65);
    expect(speechRateFor({ voiceSpeed: 'faster' })).toBe(0.92);
  });
});

describe('kbToLibrary matching', () => {
  it('matches near-identical titles', () => {
    expect(
      matchSourceToArticle({ title: 'Managing Sundowning Behaviour', org: 'Dementia NZ' })?.id
    ).toBe('managing-sundowning');
    expect(
      matchSourceToArticle({ title: 'Wandering prevention and safe return', org: '' })?.id
    ).toBe('wandering');
  });

  it('returns null rather than guessing on unrelated titles', () => {
    expect(
      matchSourceToArticle({ title: 'Annual financial report of the trust', org: 'Somewhere' })
    ).toBeNull();
  });
});
