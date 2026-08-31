// The demo seed must never survive into a study session.
//
// It opens on a distressing fabricated exchange, and — worse for the data — it
// contains a full answer to "How do I manage sundowning?", which is task t1a.
// A participant whose first arm is the text arm would find task 1 already
// answered on screen before asking anything.
//
// The suppression lives in ChatContext and depends on that provider observing
// the moment the session starts. It is passed to StudyProvider as `children`,
// so a study state change re-renders StudyProvider and then bails out before
// re-rendering ChatProvider — reading the store during render therefore stayed
// stale right through begin(). These tests pin the two properties that make the
// suppression work at all: the seed answers the task (so it matters), and the
// provider subscribes to the context rather than the store (so it fires).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedThread } from '../src/data/services.js';
import { TASK_SETS } from '@core/study/studyConfig.mjs';

const chatContextSource = readFileSync(join(import.meta.dirname, '../src/state/ChatContext.jsx'), 'utf8');

describe('demo seed vs study tasks', () => {
  it('the seed really does answer a study task — this is why it must be cleared', () => {
    const seeded = seedThread().map((m) => m.text.toLowerCase()).join(' ');
    const taskTopics = Object.values(TASK_SETS)
      .flat()
      .map((t) => t.title.toLowerCase());
    expect(taskTopics.some((title) => seeded.includes('sundowning') && title.includes('evening'))).toBe(true);
  });
});

describe('ChatProvider study-mode subscription', () => {
  it('reads study mode from the context, not straight from the store', () => {
    // A bare `isStudyMode()` call assigned to the value the clearing effect
    // watches is the regression: it cannot see begin() happen.
    expect(chatContextSource).not.toMatch(/const\s+studyOn\s*=\s*isStudyMode\(\)/);
    expect(chatContextSource).toMatch(/const\s+studyOn\s*=\s*useStudy\(\)\.active/);
  });

  it('still clears the messages and the cache on the transition into a session', () => {
    expect(chatContextSource).toMatch(/setMessages\(\[\]\)/);
    expect(chatContextSource).toMatch(/clearCached\(\)/);
  });
});
