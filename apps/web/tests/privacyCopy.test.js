// The privacy page's words (src/lib/privacyCopy.js). What is true depends on
// where answers are written, so each configuration is held to its own facts:
// who is sent a question, and what is recorded about it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { privacyCopy } from '../src/lib/privacyCopy.js';

const text = (copy) =>
  [copy.intro, ...copy.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join('\n');
const section = (copy, heading) => copy.sections.find((s) => s.heading === heading);
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const browser = privacyCopy({ who: 'Aaron', server: false });
const server = privacyCopy({ who: 'Ariana', server: true });

describe('either way', () => {
  it.each([
    ['in the browser', browser, 'Aaron'],
    ['on the server', server, 'Ariana'],
  ])(
    'answers written %s: conversations, deleting them and who to ask come first and last',
    (_, copy, who) => {
      const headings = copy.sections.map((s) => s.heading);
      expect(headings.slice(0, 2)).toEqual(['Your conversations', 'Deleting them']);
      expect(headings.at(-1)).toBe('Questions');
      expect(section(copy, 'Your conversations').paragraphs[0]).toContain(
        `Your conversations with ${who} are saved to an account`
      );
      expect(text(copy)).toContain('No recording of your voice is kept by this app.');
      expect(text(copy)).toContain('use your conversations to train AI models');
    }
  );

  it('every heading is used once, and no paragraph is repeated', () => {
    for (const copy of [browser, server]) {
      const headings = copy.sections.map((s) => s.heading);
      expect(new Set(headings).size).toBe(headings.length);
      const paragraphs = copy.sections.flatMap((s) => s.paragraphs);
      expect(new Set(paragraphs).size).toBe(paragraphs.length);
    }
  });
});

describe('answers written in the browser', () => {
  const all = text(browser);

  it('names the providers the browser talks to', () => {
    expect(all).toContain('an AI provider (OpenAI)');
    expect(all).toContain('a speech provider (ElevenLabs)');
    expect(all).not.toContain('Anthropic');
    expect(all).not.toContain('Voyage');
  });

  it('says nothing of server records, because there is no server in the path', () => {
    expect(section(browser, 'What the server keeps')).toBeUndefined();
    expect(all).toContain("We don't collect analytics about your questions");
    expect(all).toContain('never uploaded');
  });
});

describe('answers written on the server', () => {
  const all = text(server);

  it('names each provider the server sends a question to, and what each is for', () => {
    const who = section(server, 'Who else sees your questions').paragraphs.join(' ');
    expect(who).toContain('a search provider (Voyage AI)');
    expect(who).toContain('an AI provider (Anthropic), which writes the answer');
    expect(who).toContain('a speech provider (ElevenLabs)');
    expect(who).toContain('the recent part of the conversation');
  });

  it('mentions OpenAI only for a key the person added themselves', () => {
    const mentions = all.split('\n').filter((line) => line.includes('OpenAI'));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toContain('you have added your own OpenAI key');
  });

  it('names the providers the server’s code actually calls', () => {
    // If a provider is added to or dropped from the server, this page is wrong.
    const turn = read('../../api/src/providers.ts');
    const speak = read('../../api/src/speak.ts') + read('../../api/src/composeSpeak.ts');
    expect(turn).toMatch(/providers\/claude\.ts/);
    expect(turn).toMatch(/providers\/voyage\.ts/);
    expect(turn).not.toMatch(/openai/i);
    expect(speak).toMatch(/elevenlabs/i);
    expect(speak).not.toMatch(/openai/i);
  });

  it('does not say the answer choices stay on the device, because they are sent', () => {
    const device = section(server, 'What stays on this device').paragraphs.join(' ');
    expect(device).not.toContain('never uploaded');
    expect(device).toContain('are sent along with each question');
    expect(device).toContain('They are not stored on the server.');
    expect(device).toContain('whether you talk with Ariana');
  });

  it('says what the two records are, and what the second leaves out', () => {
    const kept = section(server, 'What the server keeps').paragraphs;
    expect(kept).toHaveLength(3);
    expect(kept[1]).toContain('kept against your anonymous account');
    expect(kept[2]).toContain('which library passages it found and which it cited');
    expect(kept[2]).toContain('It does not contain your question, the answer or your account');
    expect(kept[2]).toContain('kept only to the hour');
  });

  it('describes a trace that matches what the server writes', () => {
    // The page promises no question, no answer, no account, and a time to the
    // hour. Those are properties of the table; if it changes, so must the page.
    const table = read('../../../scripts/migrations/2026-11-27_turn_traces.sql');
    const columns = table.slice(table.indexOf('create table'), table.indexOf(');'));
    expect(columns).toContain("default date_trunc('hour', now())");
    expect(columns).not.toMatch(/\buser_id\b|\buuid\b/);
    expect(columns).not.toMatch(/^\s*(question|answer|message|text)\s+text/m);
    expect(columns).toMatch(/question_chars\s+integer/);
    expect(columns).toMatch(/answer_chars\s+integer/);
  });

  it('does not claim to collect nothing, now that it measures something', () => {
    expect(all).not.toContain("We don't collect analytics");
    expect(all).toContain(
      'The only things measured about your questions are the two records described above.'
    );
  });
});
