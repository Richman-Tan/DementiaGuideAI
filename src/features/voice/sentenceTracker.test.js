import { createSentenceSplitter, EARLY_CHUNK_CHARS } from './sentenceTracker';

// Reference implementation: the exact splitting code that lived inline in
// useAvatarConversation's producer before extraction. The splitter must stay
// behaviourally identical — it feeds both the REST and streaming TTS paths.
function referenceSplit(pieces) {
  const out = [];
  let buf = '';
  for (const chunk of pieces) {
    buf += chunk;
    const marked = buf.replace(/([.!?])\s+/g, '$1\x1F');
    const parts = marked.split('\x1F');
    parts.slice(0, -1).forEach((s) => out.push(s));
    buf = parts[parts.length - 1];
    if (buf.length > EARLY_CHUNK_CHARS) {
      const splitIdx = Math.max(buf.lastIndexOf(','), buf.lastIndexOf(';'));
      if (splitIdx > 15) {
        out.push(buf.slice(0, splitIdx + 1));
        buf = buf.slice(splitIdx + 1).trimStart();
      }
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function runSplitter(pieces) {
  const splitter = createSentenceSplitter();
  const out = [];
  for (const p of pieces) out.push(...splitter.push(p));
  const rest = splitter.finish();
  if (rest) out.push(rest);
  return out;
}

const tokenize = (text, size = 5) => {
  const pieces = [];
  for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
  return pieces;
};

describe('createSentenceSplitter', () => {
  it('splits on sentence-final punctuation followed by whitespace', () => {
    const out = runSplitter(['Hello there. How are you? Fine! Good.']);
    expect(out).toEqual(['Hello there.', 'How are you?', 'Fine!', 'Good.']);
  });

  it('does not split on punctuation without trailing whitespace (decimals, abbreviations)', () => {
    const out = runSplitter(['Take 1.5 mg daily. Then rest.']);
    expect(out).toEqual(['Take 1.5 mg daily.', 'Then rest.']);
  });

  it('holds an incomplete sentence until finish()', () => {
    const splitter = createSentenceSplitter();
    expect(splitter.push('This never ends')).toEqual([]);
    expect(splitter.finish()).toBe('This never ends');
  });

  it('finish() returns null for whitespace-only remainder', () => {
    const splitter = createSentenceSplitter();
    splitter.push('Done. ');
    expect(splitter.finish()).toBeNull();
  });

  it('fires an early clause split when the buffer exceeds the threshold', () => {
    const longClause = `${'word '.repeat(28)}pause,${' more'.repeat(10)}`; // >150 chars with a comma
    const out = runSplitter([longClause]);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].endsWith(',')).toBe(true);
  });

  it.each([
    ['single piece', ['Aria helps with morning routines. She can remind you about medication, meals, and appointments whenever needed. What would you like to know?']],
    ['token-sized pieces', tokenize('Sundowning is common in dementia. Try keeping the evening calm, with soft lighting; avoid caffeine late in the day. Would a routine help? Yes!')],
    ['clause-heavy long text', tokenize(`When someone with dementia becomes agitated in the late afternoon${', it can help to dim the lights'.repeat(6)}, and keep noise low. Stay calm.`)],
    ['no trailing punctuation', tokenize('First point. Second point without an ending')],
  ])('matches the original inline producer logic (%s)', (_name, pieces) => {
    expect(runSplitter(pieces)).toEqual(referenceSplit(pieces));
  });
});
