// The instrument set, pinned.
//
// Instrument wording and composition cannot change once the first participant
// has answered — a Likert item added halfway through gives two incomparable
// halves of a dataset, and an item quietly folded into the pre-registered
// composite changes a criterion that was declared before data collection. Both
// are silent failures: the app keeps working, the CSVs keep exporting, and the
// damage only shows up when someone tries to write the results section.
//
// These tests are the tripwire. They are deliberately strict about things that
// look cosmetic.
import { describe, it, expect } from 'vitest';
import { LIKERT_ITEMS, SUS_ITEMS, PLWD_ITEMS, DEBRIEF } from '../src/study/instruments.js';
import {
  LIKERT_CONSTRUCTS,
  PRE_REGISTERED_LIKERT,
  STUDY_VERSION,
  MODALITY_SPOKEN,
  MODALITY_TYPED,
  expectedModality,
  ARM_A,
  ARM_B,
} from '@core/study/studyConfig.mjs';

describe('the Likert set', () => {
  // The wording lives in the browser module and the ids live in @core, because
  // the export and analysis scripts cannot import a browser module. Two lists
  // means two chances to update one of them.
  it('shows exactly the constructs the analysis scripts look for, in order', () => {
    expect(LIKERT_ITEMS.map((i) => i.id)).toEqual(LIKERT_CONSTRUCTS);
  });

  it('gives every item the same five-point scale', () => {
    for (const item of LIKERT_ITEMS) {
      expect(item.options.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('asks something for each half of the assessed outcome', () => {
    // "Design and implement an avatar-based platform for personalised resource
    // navigation and management." Before these two items the only evidence for
    // either half was one free-text debrief answer, which yields quotes but no
    // arm-to-arm comparison.
    const ids = LIKERT_ITEMS.map((i) => i.id);
    expect(ids).toContain('personalisation');
    expect(ids).toContain('actionability');
  });

  it('asks about tailoring in a way a generic answer would not score well on', () => {
    // Without an explicit contrast this collapses into a second helpfulness
    // item: a good generic answer would be rated highly and the measure would
    // say nothing about personalisation.
    const item = LIKERT_ITEMS.find((i) => i.id === 'personalisation');
    expect(item.text).toMatch(/rather than general information/i);
  });
});

describe('the pre-registered usability composite', () => {
  // protocol.md §7.1: "SUS ≥ 68 on Arm A, and mean Likert ≥ 4 on Arm A". The
  // composite is these four. Adding the newer items to it would change a
  // declared criterion, which is exactly the move a pre-registration exists to
  // prevent — so the analysis reports them separately instead.
  it('is the four constructs that were declared, and only those', () => {
    expect(PRE_REGISTERED_LIKERT).toEqual(['trust', 'engagement', 'helpfulness', 'clarity']);
  });

  it('is a subset of what participants are actually asked', () => {
    for (const k of PRE_REGISTERED_LIKERT) expect(LIKERT_CONSTRUCTS).toContain(k);
  });

  it('leaves the newer items outside it', () => {
    expect(PRE_REGISTERED_LIKERT).not.toContain('personalisation');
    expect(PRE_REGISTERED_LIKERT).not.toContain('actionability');
  });
});

describe('study version', () => {
  // Stamped on every session row. Sessions run under different instrument sets
  // are not poolable, and the version is the only thing that says which set a
  // row belongs to — so changing the instruments without bumping it makes a
  // mixed dataset silently unseparable.
  it('is past 1.0, which was the four-item build', () => {
    expect(STUDY_VERSION).not.toBe('1.0');
  });
});

describe('the shortened set for participants living with dementia', () => {
  it('is left at three plain-language items', () => {
    // protocol §3.3 fatigue safeguard. "Rather than general information anyone
    // would get" is precisely the abstract comparison that safeguard exists to
    // avoid, and this group is reported thematically rather than compared, so
    // the extra items would be burden without a reader.
    expect(PLWD_ITEMS).toHaveLength(3);
    expect(PLWD_ITEMS.map((i) => i.id)).not.toContain('personalisation');
  });

  it('still has personalisation covered in the participant\'s own words', () => {
    expect(DEBRIEF.map((q) => q.id)).toContain('tailored');
  });
});

describe('SUS is untouched', () => {
  it('is still the standard ten items with alternating polarity', () => {
    // A modified SUS is not a SUS, and its 68 benchmark stops meaning anything.
    expect(SUS_ITEMS).toHaveLength(10);
    for (const [i, item] of SUS_ITEMS.entries()) {
      expect(item.positive).toBe(i % 2 === 0);
    }
  });
});

describe('turn modality', () => {
  it('names the modality each arm is built around', () => {
    expect(expectedModality(ARM_A)).toBe(MODALITY_SPOKEN);
    expect(expectedModality(ARM_B)).toBe(MODALITY_TYPED);
  });

  it('keeps the two values distinct', () => {
    expect(MODALITY_SPOKEN).not.toBe(MODALITY_TYPED);
  });
});
