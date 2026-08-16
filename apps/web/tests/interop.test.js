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
import { MARK, MARK_REVERSED, MARK_COMPACT, TILE, ANDROID_SAFE_ZONE_RATIO, markBounds, markFor, markEnclosingRadius } from '@core/brand/mark';

describe('CJS libs through web alias', () => {
  it('exposes rag config constants', () => {
    expect(TOP_K).toBeGreaterThan(0);
    expect(MAX_HISTORY).toBe(6);
    expect(PROMPT_VERSION).toBeTruthy();
    expect(CHAT_MODEL).toBeTruthy();
  });

  it('builds the system prompt with mapped options', () => {
    const p = buildSystemPrompt({ conciseMode: true, responseStyle: 'brief', jargonMode: 'avoid', ariaPersonality: 'warm' });
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
    const capped = capBySourceFamily([mk('1', 'iSupport 1'), mk('2', 'iSupport 2'), mk('3', 'iSupport 3'), mk('4', 'Other')], 3);
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

describe('brand mark geometry', () => {
  it('resolves through the alias with its geometry intact', () => {
    expect(MARK.solid.r).toBeGreaterThan(0);
    expect(MARK.ring.strokeWidth).toBeGreaterThan(0);
    expect(TILE.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('bounds the mark on the drawn shape, stroke included — not on the 48-box', () => {
    const b = markBounds(MARK);
    // The ring's stroke spills half a width past its radius.
    expect(b.maxX).toBeCloseTo(MARK.ring.cx + MARK.ring.r + MARK.ring.strokeWidth / 2);
    expect(b.minX).toBeCloseTo(MARK.solid.cx - MARK.solid.r);
    // Wider than tall, and off-centre in the 48-box — which is why every renderer
    // has to centre on these bounds rather than on 24,24.
    expect(b.width).toBeGreaterThan(b.height);
    expect((b.minX + b.maxX) / 2).not.toBeCloseTo(24);
  });

  it('picks the heavier variants for small and for reversed rendering', () => {
    // Keyed on the drawn width of the mark, not on its container.
    expect(markFor(21, true)).toBe(MARK_COMPACT);
    expect(markFor(180, true)).toBe(MARK_REVERSED);
    expect(markFor(180, false)).toBe(MARK);
    // White on teal reads thinner, so the reversed ring is heavier.
    expect(MARK_REVERSED.ring.strokeWidth).toBeGreaterThan(MARK.ring.strokeWidth);
  });

  it('encloses the mark more tightly than its bounding box would', () => {
    const b = markBounds(MARK);
    const halfDiagonal = Math.hypot(b.width, b.height) / 2;
    // The mark is two discs, not a rectangle, so the circle that contains it is
    // smaller than the one that contains its box. Sizing the Android adaptive
    // icon off the box instead would shrink it by about a fifth for nothing.
    expect(markEnclosingRadius(MARK)).toBeLessThan(halfDiagonal);
  });

  it('states the Android safe zone as 66dp of a 108dp canvas', () => {
    // 61.1%, not 66% — the outer 18dp per side is mask and parallax bleed.
    expect(ANDROID_SAFE_ZONE_RATIO).toBeCloseTo(0.611, 3);
  });
});
