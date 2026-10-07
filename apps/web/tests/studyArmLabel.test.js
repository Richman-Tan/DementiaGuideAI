// The arm's display label (packages/core/study/studyConfig.mjs).
//
// It heads the first task card of each arm and is folded into the questionnaire
// lead ("These ten questions are about talking with …"), so it has to name the
// arm correctly for whichever assistant the participant is shown. It lives in
// the ESM-only study config, which is why it is tested here rather than by Jest.
import { describe, it, expect } from 'vitest';
import { armLabel, ARM_A, ARM_B, expectedModality, MODALITY_SPOKEN, MODALITY_TYPED } from '@core/study/studyConfig.mjs';

describe('armLabel', () => {
  it('describes the avatar arm as talking and the text arm as typing', () => {
    expect(armLabel(ARM_A, 'Aaron')).toBe('Talking with Aaron');
    expect(armLabel(ARM_B, 'Aaron')).toBe('Typing to Aaron');
  });

  it('takes the assistant name from the caller rather than hardcoding one', () => {
    expect(armLabel(ARM_A, 'Aria')).toBe('Talking with Aria');
    expect(armLabel(ARM_B, 'Ariana')).toBe('Typing to Ariana');
  });

  it('agrees with the modality each arm is designed around', () => {
    expect(armLabel(ARM_A, 'x').startsWith('Talking')).toBe(expectedModality(ARM_A) === MODALITY_SPOKEN);
    expect(armLabel(ARM_B, 'x').startsWith('Typing')).toBe(expectedModality(ARM_B) === MODALITY_TYPED);
  });
});
