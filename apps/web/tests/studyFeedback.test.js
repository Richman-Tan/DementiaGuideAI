// The feedback round (Oct 2026): free use, flags and open questions, through
// the same store, event queue and band as the tasks study. These pin the
// decisions that keep the two protocols from leaking into each other — no arm
// on a feedback session, a session-scoped thread, the mic not a gate — and the
// privacy fix that now applies to both: nothing is recorded once a session ends.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { saveStudy, clearStudy, currentArm, studyThreadKey, isExploring, isFeedbackSession } from '../src/study/studyStore.js';
import { emit, pendingCount, resetQueue } from '../src/study/events.js';
import { setupStartDisabled } from '../src/study/guards.js';
import { feedbackEnabled, requestedProtocol, edivaUrl } from '../src/study/feedback.js';
import { THINGS_TO_TRY, FEEDBACK_QUESTIONS, FEEDBACK_SUS_ITEMS, SUS_ITEMS } from '../src/study/instruments.js';
import { ExploreBand } from '../src/study/screens/OverlayBand.jsx';
import { FEEDBACK_THREAD, PROTOCOL_FEEDBACK, PROTOCOL_TASKS, FEEDBACK_GROUPS, IDENTITY_WARNING } from '@core/study/studyConfig.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const live = (patch = {}) =>
  saveStudy({
    sessionId: '11111111-2222-4333-8444-555555555555',
    accessCode: 'test-access-code',
    participantCode: 'P31',
    ...patch,
  });

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
  resetQueue();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('a feedback session has no arm', () => {
  it('currentArm() is null even if an arm order is somehow stored', () => {
    live({ protocol: PROTOCOL_FEEDBACK, armOrder: 'AB', step: 'explore' });
    expect(isFeedbackSession()).toBe(true);
    expect(currentArm()).toBeNull();
  });

  it('a tasks session still has its arm', () => {
    live({ protocol: PROTOCOL_TASKS, armOrder: 'BA', stageIndex: 0, step: 'task' });
    expect(currentArm()).toBe('B');
  });
});

describe('the session-scoped thread key', () => {
  it("is 'free' on a feedback session, so free use never rejoins another person's thread", () => {
    live({ protocol: PROTOCOL_FEEDBACK, step: 'explore' });
    expect(studyThreadKey()).toBe(FEEDBACK_THREAD);
  });

  it('is the arm on a tasks session, and null outside a session', () => {
    live({ protocol: PROTOCOL_TASKS, armOrder: 'AB', stageIndex: 1, step: 'task' });
    expect(studyThreadKey()).toBe('B');
    clearStudy();
    expect(studyThreadKey()).toBeNull();
  });
});

describe('isExploring()', () => {
  it('needs the explore step AND a started window', () => {
    live({ protocol: PROTOCOL_FEEDBACK, step: 'explore', exploreStartedAt: null });
    expect(isExploring()).toBe(false); // still on the brief
    live({ protocol: PROTOCOL_FEEDBACK, step: 'explore', exploreStartedAt: Date.now() });
    expect(isExploring()).toBe(true);
    live({ protocol: PROTOCOL_FEEDBACK, step: 'feedback', exploreStartedAt: Date.now() });
    expect(isExploring()).toBe(false);
  });
});

describe('nothing is recorded once a session has ended', () => {
  // The closing screens say "nothing more will be recorded"; the session stays
  // live on the device until it is cleared, so this has to hold in emit().
  it.each(['done', 'stopped'])('emit() is a no-op on %s', (step) => {
    live({ protocol: PROTOCOL_FEEDBACK, step });
    emit('turn', { question: 'asked after the end' });
    emit('page_view', { path: '/app/chat' });
    expect(pendingCount()).toBe(0);
  });

  it('still records during free use and on the tasks protocol', () => {
    live({ protocol: PROTOCOL_FEEDBACK, step: 'explore', exploreStartedAt: Date.now() });
    emit('page_view', { path: '/app/home' });
    live({ protocol: PROTOCOL_TASKS, step: 'task' });
    emit('turn', { arm: 'B' });
    expect(pendingCount()).toBe(2);
  });
});

describe('setup on the feedback round', () => {
  const base = { busy: false, accessCode: 'code', group: 'caregiver', supporterPresent: null, micStatus: null, micAck: false };

  it('does not wait for a microphone — talking is optional in free use', () => {
    expect(setupStartDisabled({ ...base, protocol: PROTOCOL_FEEDBACK })).toBe(false);
  });

  it('still needs a code, and the tasks study still needs the mic check', () => {
    expect(setupStartDisabled({ ...base, accessCode: '', protocol: PROTOCOL_FEEDBACK })).toBe(true);
    expect(setupStartDisabled({ ...base, protocol: PROTOCOL_TASKS })).toBe(true);
  });

  it('offers no group for people living with dementia', () => {
    expect(FEEDBACK_GROUPS).not.toContain('plwd');
  });
});

describe('deploy-time switches', () => {
  it('reads the protocol from the link', () => {
    expect(requestedProtocol('/study/feedback')).toBe(PROTOCOL_FEEDBACK);
    expect(requestedProtocol('/study')).toBe(PROTOCOL_TASKS);
    expect(requestedProtocol('/study/feedbackish')).toBe(PROTOCOL_TASKS);
  });

  it('is off unless VITE_STUDY_FEEDBACK is exactly "1"', () => {
    vi.stubEnv('VITE_STUDY_FEEDBACK', '');
    expect(feedbackEnabled()).toBe(false);
    vi.stubEnv('VITE_STUDY_FEEDBACK', 'true');
    expect(feedbackEnabled()).toBe(false);
    vi.stubEnv('VITE_STUDY_FEEDBACK', '1');
    expect(feedbackEnabled()).toBe(true);
  });

  it('only links to an https e-DiVA-NZ address', () => {
    vi.stubEnv('VITE_STUDY_EDIVA_URL', 'javascript:alert(1)');
    expect(edivaUrl()).toBe('');
    vi.stubEnv('VITE_STUDY_EDIVA_URL', 'https://example.org/ediva');
    expect(edivaUrl()).toBe('https://example.org/ediva');
  });
});

describe('the feedback instruments', () => {
  it('has the eight suggestions, with unique ids', () => {
    expect(THINGS_TO_TRY).toHaveLength(8);
    expect(new Set(THINGS_TO_TRY.map((i) => i.id)).size).toBe(8);
  });

  it('never ships what the team hopes the app will say', () => {
    // The expected behaviours for the sudden-confusion and normal-ageing
    // scenarios are the research team's, in the protocol document — this file
    // reaches the browser.
    const text = THINGS_TO_TRY.map((i) => i.text).join(' ');
    expect(text).not.toMatch(/\bGP\b|health professional|diagnos|assess/i);
  });

  it('asks open questions with unique ids', () => {
    expect(new Set(FEEDBACK_QUESTIONS.map((q) => q.id)).size).toBe(FEEDBACK_QUESTIONS.length);
  });

  it('keeps SUS ids and polarity, rating the app rather than an interface', () => {
    expect(FEEDBACK_SUS_ITEMS.map((i) => [i.id, i.positive])).toEqual(SUS_ITEMS.map((i) => [i.id, i.positive]));
    for (const item of FEEDBACK_SUS_ITEMS) {
      expect(item.text).not.toMatch(/this way of using/);
      expect(item.text).toMatch(/this app/);
    }
  });
});

describe('the API accepts every step the client checkpoints', () => {
  // Read from source: importing StudyContext.jsx would pull in the Supabase
  // client, which needs a browser.
  it('progress.js lists each of the client STEPS', () => {
    const read = (p) => readFileSync(join(import.meta.dirname, p), 'utf8');
    const block = /export const STEPS = \[([\s\S]*?)\];/.exec(read('../src/study/StudyContext.jsx'))[1];
    const steps = [...block.replace(/\/\/.*$/gm, '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(steps).toEqual(expect.arrayContaining(['privacy', 'explore', 'feedback', 'feedbacksus']));
    const progress = read('../../api/api/study/progress.js');
    for (const step of steps) expect(progress).toContain(`'${step}'`);
  });
});

describe('the free-use band', () => {
  const render = (over = {}) =>
    renderToStaticMarkup(
      React.createElement(ExploreBand, {
        items: THINGS_TO_TRY,
        tried: {},
        expanded: false,
        textScale: 1,
        onToggle: () => {}, onTry: () => {}, onCycleText: () => {},
        onFinishRequest: () => {}, onFinishConfirm: () => {},
        onStopRequest: () => {}, onStopConfirm: () => {}, onCancel: () => {},
        ...over,
      }),
    );

  it('collapsed: says what this is, counts ideas tried, and keeps the identity warning', () => {
    const html = render({ tried: { respite: true, flag: true, follow_up: false } });
    expect(html).toContain('Use the app as you would at home');
    expect(html).toContain('Things to try (2 of 8)');
    expect(html).toContain('I’m finished');
    expect(html).toContain('I need to stop');
    expect(html).toContain(IDENTITY_WARNING.slice(0, 40));
    expect(html).not.toContain('type="checkbox"');
  });

  it('expanded: one checkbox per idea, and an e-DiVA-NZ link only when one is configured', () => {
    const without = render({ expanded: true });
    expect(without.match(/type="checkbox"/g)).toHaveLength(8);
    expect(without).not.toContain('Open e-DiVA-NZ');
    const withUrl = render({ expanded: true, edivaUrl: 'https://example.org/ediva' });
    expect(withUrl.match(/Open e-DiVA-NZ/g)).toHaveLength(2);
    expect(withUrl).toContain('rel="noopener noreferrer"');
  });

  it('confirms both ways out', () => {
    expect(render({ confirm: 'finish' })).toContain('Finished using the app? Next come a few short questions about it.');
    expect(render({ confirm: 'stop' })).toContain('Stop the session? Nothing more will be recorded.');
  });
});
