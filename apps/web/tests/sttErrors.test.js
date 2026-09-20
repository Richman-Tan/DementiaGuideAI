// What a participant is told when the microphone fails, and what the study
// event is called. The copy matters more than usual: the reader is an older
// adult mid-task, the failure is invisible (the browser blocked the mic, the
// recognizer errored), and the wrong sentence turns "allow the mic" into
// "the app is broken". Every message must carry its own way out — the typed
// message bar — and never blame the person.
import { describe, it, expect } from 'vitest';
import { sttErrorPresentation } from '../src/voice/sttErrorCopy.js';

describe('presenting microphone failures', () => {
  it('names a blocked mic and points at the padlock and the typed path', () => {
    const denied = Object.assign(new Error('Microphone permission denied'), { code: 'permission-denied' });
    const { kind, copy } = sttErrorPresentation(denied);
    expect(kind).toBe('mic_denied');
    expect(copy).toMatch(/padlock/i);
    expect(copy).toMatch(/type/i);
  });

  it('gives every other failure a retry and the typed path', () => {
    const { kind, copy } = sttErrorPresentation(new Error('speech recognition error: network'));
    expect(kind).toBe('stt_error');
    expect(copy).toMatch(/try again/i);
    expect(copy).toMatch(/type/i);
  });

  it('never surfaces the raw error text or blames the participant', () => {
    for (const err of [
      Object.assign(new Error('NotAllowedError'), { code: 'permission-denied' }),
      new Error('Requested device not found'),
      new Error("Cannot read properties of undefined (reading 'getUserMedia')"),
      null,
      undefined,
    ]) {
      const { copy } = sttErrorPresentation(err);
      expect(copy).not.toMatch(/getUserMedia|device not found|NotAllowedError/);
      expect(copy).not.toMatch(/\byou (must|should have|failed)\b/i);
    }
  });
});
