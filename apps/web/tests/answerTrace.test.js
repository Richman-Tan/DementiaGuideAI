// "How this answer was made" (lib/answerTrace.js and components/AnswerTrace.jsx):
// what is kept from the server's events about one answer, and how it reads.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildTrace,
  formatMs,
  formatSafety,
  formatTokens,
  formatUsd,
  searchOutcome,
} from '../src/lib/answerTrace.js';
import { AnswerTrace } from '../src/components/AnswerTrace.jsx';

const EVENTS = {
  meta: {
    pipelineVersion: 'v3-claude-nz@1asxkhx',
    promptVersion: 'v3-claude-nz',
    model: 'claude-opus-5-5',
    modality: 'text',
  },
  retrieval: {
    mode: 'fresh',
    query: 'How do I manage sundowning at night?',
    ms: 412,
    chunks: [
      {
        id: 'kb-1',
        title: 'Managing evening restlessness',
        org: 'Alzheimers NZ',
        url: null,
        similarity: 0.714,
      },
      { id: 'kb-2', title: 'Carer support', org: null, url: null, similarity: null },
    ],
  },
  safety: { level: 'none', categories: [], source: 'triage' },
  usage: {
    model: 'claude-opus-5-5',
    inputTokens: 900,
    outputTokens: 240,
    cacheReadTokens: 1000,
    cacheWriteTokens: 0,
  },
  timings: { retrievalDone: 430, llmSend: 431, firstToken: 1180, streamEnd: 3900, total: 3912 },
  stopReason: 'end_turn',
  sources: [{ id: 'kb-1', num: 1 }],
};

const html = (trace) =>
  renderToStaticMarkup(React.createElement(AnswerTrace, { trace }))
    // Entities back to characters and non-breaking spaces to plain ones, so the
    // assertions read as the page does.
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, ' ');

describe('buildTrace', () => {
  it('keeps the facts of one answer, with each passage marked if it was cited', () => {
    expect(buildTrace(EVENTS)).toEqual({
      model: 'claude-opus-5-5',
      pipelineVersion: 'v3-claude-nz@1asxkhx',
      promptVersion: 'v3-claude-nz',
      modality: 'text',
      search: {
        mode: 'fresh',
        query: 'How do I manage sundowning at night?',
        ms: 412,
        passages: [
          {
            id: 'kb-1',
            title: 'Managing evening restlessness',
            org: 'Alzheimers NZ',
            similarity: 0.714,
            cited: 1,
          },
          { id: 'kb-2', title: 'Carer support', org: null, similarity: null, cited: null },
        ],
      },
      safety: { level: 'none', categories: [], source: 'triage' },
      usage: {
        inputTokens: 900,
        outputTokens: 240,
        cacheReadTokens: 1000,
        cacheWriteTokens: 0,
        // 900 x 4 + 240 x 20 + 1000 x 0.2, per million.
        costUsd: expect.closeTo(0.0086, 6),
      },
      timings: { search: 430, firstWords: 1180, total: 3912 },
      stopReason: 'end_turn',
    });
  });

  it('is nothing at all when the stream never said what produced the answer', () => {
    expect(buildTrace({})).toBeNull();
  });

  it('keeps what there is when the turn ended early', () => {
    // Stopped during the search: no passages, no usage, only a total.
    expect(
      buildTrace({ meta: EVENTS.meta, timings: { total: 120 }, stopReason: 'aborted' })
    ).toEqual({
      model: 'claude-opus-5-5',
      pipelineVersion: 'v3-claude-nz@1asxkhx',
      promptVersion: 'v3-claude-nz',
      modality: 'text',
      search: null,
      safety: null,
      usage: null,
      timings: { search: null, firstWords: null, total: 120 },
      stopReason: 'aborted',
    });
    expect(buildTrace({ meta: EVENTS.meta }).stopReason).toBeNull();
  });

  it('gives no cost for a model it holds no price for', () => {
    const trace = buildTrace({ ...EVENTS, usage: { ...EVENTS.usage, model: 'another-model' } });
    expect(trace.usage.costUsd).toBeNull();
  });
});

describe('the wording', () => {
  it('writes durations in milliseconds, then seconds', () => {
    // The space before the unit is non-breaking.
    expect(formatMs(40.4)).toBe('40\u00a0ms');
    expect(formatMs(999)).toBe('999\u00a0ms');
    expect(formatMs(1180)).toBe('1.2\u00a0s');
    expect(formatMs(null)).toBeNull();
    expect(formatMs(undefined)).toBeNull();
  });

  it('writes small sums to four places, and says "under" for less than that', () => {
    expect(formatUsd(0.0086)).toBe('US$0.0086');
    expect(formatUsd(0.31)).toBe('US$0.3100');
    expect(formatUsd(0.00004)).toBe('under US$0.0001');
    expect(formatUsd(null)).toBeNull();
  });

  it('lists the tokens, leaving out the cache when it was not used', () => {
    expect(
      formatTokens({ inputTokens: 900, outputTokens: 240, cacheReadTokens: 0, cacheWriteTokens: 0 })
    ).toBe('900 in, 240 out');
    expect(
      formatTokens({
        inputTokens: 12500,
        outputTokens: 240,
        cacheReadTokens: 1000,
        cacheWriteTokens: 1075,
      })
    ).toBe('12,500 in, 240 out, 1,000 read from cache, 1,075 written to cache');
  });

  it('says what an empty search means', () => {
    expect(searchOutcome({ mode: 'fresh', passages: [{ id: 'kb-1' }] })).toBeNull();
    expect(searchOutcome({ mode: 'none', passages: [] })).toMatch(
      /^Nothing in the library matched/
    );
    expect(searchOutcome({ mode: 'failed', passages: [] })).toMatch(/^The library search failed/);
    expect(searchOutcome({ mode: 'prefetched', passages: [] })).toMatch(
      /^Nothing in the library matched/
    );
  });

  it('says what the emergency check found, and who judged', () => {
    expect(formatSafety({ level: 'none', categories: [], source: 'triage' })).toBe(
      'No emergency found, judged by a model'
    );
    expect(formatSafety({ level: 'none', categories: [], source: 'keywords' })).toBe(
      'No emergency found, by a keyword check'
    );
    expect(
      formatSafety({
        level: 'emergency',
        categories: ['unresponsive', 'fall_injury'],
        source: 'triage',
      })
    ).toBe('Possible emergency: unresponsive, fall injury, judged by a model');
    expect(formatSafety({ level: 'caution', categories: [], source: 'keywords' })).toBe(
      'Take care, by a keyword check'
    );
  });
});

describe('AnswerTrace', () => {
  it('renders nothing for an answer with no trace', () => {
    expect(html(null)).toBe('');
    expect(html(undefined)).toBe('');
  });

  it('is closed until asked for, under a plain label', () => {
    const out = html(buildTrace(EVENTS));
    expect(out).toMatch(/^<details/);
    expect(out).not.toMatch(/<details[^>]* open/);
    expect(out).toContain('<summary');
    expect(out).toContain('How this answer was made');
  });

  it('lays out the search, the check, the time, the tokens, the cost and what wrote it', () => {
    const out = html(buildTrace(EVENTS));
    expect(out).toContain('“How do I manage sundowning at night?” (412 ms)');
    expect(out).toContain('Managing evening restlessness (Alzheimers NZ), match 0.71');
    expect(out).toContain('<strong>, cited as [1]</strong>');
    expect(out).toContain('<li>Carer support</li>'); // no organisation, no score, not cited
    expect(out).toContain('No emergency found, judged by a model');
    expect(out).toContain('search 430 ms, first words 1.2 s, finished 3.9 s');
    expect(out).toContain('900 in, 240 out, 1,000 read from cache');
    expect(out).toContain('About US$0.0086 at list prices, for writing the answer alone.');
    expect(out).toContain('claude-opus-5-5');
    expect(out).toContain('v3-claude-nz@1asxkhx');
    expect(out).not.toContain('length limit');
  });

  it('says so when the search found nothing, and when the answer hit its length limit', () => {
    const out = html(
      buildTrace({
        ...EVENTS,
        retrieval: { mode: 'none', query: 'q', ms: null, chunks: [] },
        stopReason: 'max_tokens',
      })
    );
    expect(out).toContain('“q”</dd>'); // no time to show
    expect(out).toContain('Nothing in the library matched closely enough');
    expect(out).not.toContain('<ol');
    expect(out).toContain('The answer reached its length limit and may be cut short.');
  });

  it('shows only what it has: a stopped turn has no search, check, tokens or cost', () => {
    const out = html(
      buildTrace({ meta: EVENTS.meta, timings: { total: 120 }, stopReason: 'aborted' })
    );
    expect(out).toContain('finished 120 ms');
    expect(out).not.toContain('Searched for');
    expect(out).not.toContain('Safety check');
    expect(out).not.toContain('Tokens');
    const untimed = html(buildTrace({ meta: EVENTS.meta }));
    expect(untimed).not.toContain('Time');
    expect(untimed).toContain('claude-opus-5-5');
  });

  it('says there is no price rather than showing a wrong cost', () => {
    const out = html(buildTrace({ ...EVENTS, usage: { ...EVENTS.usage, model: 'another-model' } }));
    expect(out).toContain('No list price is held for this model.');
    expect(out).not.toContain('US$');
  });
});
