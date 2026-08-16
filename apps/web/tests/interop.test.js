// Interop canary: the reused mobile libs must resolve and behave through the
// web aliases + CJS→ESM transform. If this file fails, phase (b)/(c) reuse breaks.
import { describe, it, expect } from 'vitest';
import { TOP_K, MAX_HISTORY, PROMPT_VERSION, CHAT_MODEL } from '@core/rag/ragConfig';
import { buildSystemPrompt, buildUserContent } from '@core/rag/prompt';
import { extractCitations, createMarkerStripper } from '@core/rag/citations';
import { capBySourceFamily } from '@core/rag/retrieval';
import { ELEVEN_STREAM_SAMPLE_RATE, SPECULATIVE_MIN_WORDS } from '@core/voice/voiceConfig';
import { createSpeculativeRag } from '@core/voice/speculativeRetrieval';
import { createSentenceSplitter } from '@core/voice/sentenceTracker';
import { timeoutSignal } from '@core/net/withTimeout';

describe('CJS libs through web alias', () => {
  it('exposes rag config constants', () => {
    expect(TOP_K).toBeGreaterThan(0);
    expect(MAX_HISTORY).toBe(6);
    expect(PROMPT_VERSION).toBeTruthy();
    expect(CHAT_MODEL).toBeTruthy();
  });

  it('builds the system prompt with mapped options', () => {
    const p = buildSystemPrompt({
      conciseMode: true,
      responseStyle: 'brief',
      jargonMode: 'avoid',
      ariaPersonality: 'warm',
    });
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(200);
  });

  it('builds user content from chunks', () => {
    const c = buildUserContent('How do I manage sundowning?', [
      { id: 'c1', title: 'Sundowning', source: 'Test', content: 'Keep afternoons calm.' },
    ]);
    expect(JSON.stringify(c)).toContain('sundowning');
  });

  it('extracts and renumbers citations, dropping hallucinated ones', () => {
    const chunks = [
      { id: 'a', title: 'A', source: 'Org A', content: 'aaa' },
      { id: 'b', title: 'B', source: 'Org B', content: 'bbb' },
    ];
    const { text, sources } = extractCitations('First [S2]. Fake [S9].', chunks);
    expect(sources.length).toBe(1);
    expect(sources[0].title).toBe('B');
    expect(text).toContain('[1]');
    expect(text).not.toContain('[S9]');
  });

  it('strips markers streaming-safely', () => {
    const strip = createMarkerStripper();
    const out = strip.write('Hello [S1') + strip.write('] world') + strip.flush();
    expect(out.replace(/\s+/g, ' ').trim()).toBe('Hello world');
  });

  it('caps chunks per source family', () => {
    const mk = (id, source) => ({ id, source, similarity: 1 });
    const capped = capBySourceFamily(
      [mk('1', 'iSupport 1'), mk('2', 'iSupport 2'), mk('3', 'iSupport 3'), mk('4', 'Other')],
      3
    );
    expect(capped.length).toBeLessThanOrEqual(3);
  });
});

describe('ESM libs importing CJS constants', () => {
  it('voiceConfig constants resolve', () => {
    expect(ELEVEN_STREAM_SAMPLE_RATE).toBe(22050);
    expect(SPECULATIVE_MIN_WORDS).toBeGreaterThan(0);
  });

  it('speculative RAG session constructs and accepts partials', () => {
    const session = createSpeculativeRag({ search: async () => [] });
    expect(typeof session.onPartial).toBe('function');
    session.onPartial('how do i manage sundowning at night');
    session.cancel?.();
  });

  it('sentence splitter emits sentences', () => {
    const splitter = createSentenceSplitter();
    const out = [];
    out.push(...splitter.push('Kia ora. '));
    out.push(...splitter.push('This is a test! And more'));
    const rest = splitter.finish();
    if (rest) out.push(rest);
    expect(out.join('|')).toContain('Kia ora.');
    expect(out.join('|')).toContain('And more');
  });

  it('timeoutSignal produces an AbortSignal', () => {
    const { signal, cancel } = timeoutSignal(50);
    expect(signal).toBeInstanceOf(AbortSignal);
    cancel();
  });
});
