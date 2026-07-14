import { detectSentiment } from '@/lib/sentiment/detectSentiment';

describe('detectSentiment', () => {
  it('classifies clearly positive text', () => {
    expect(detectSentiment('This is wonderful and I feel so happy and glad!')).toBe('positive');
  });

  it('prioritises concern when distress words appear', () => {
    expect(detectSentiment('I am so worried and anxious, this is really hard.')).toBe('concern');
  });

  it('detects a warm/supportive tone', () => {
    expect(detectSentiment('I understand, we are here together and you are safe.')).toBe('warm');
  });

  it('falls back to question for a plain question', () => {
    expect(detectSentiment('What time is the appointment?')).toBe('question');
  });

  it('returns neutral for text with no signal words', () => {
    expect(detectSentiment('The table has four legs.')).toBe('neutral');
  });
});
