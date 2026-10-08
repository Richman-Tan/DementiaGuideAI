// @vitest-environment jsdom
// The study state machine in StudyProvider (study/StudyContext.jsx), driven
// through its public context API rather than through the screens. The e2e suite
// walks the flows the screens offer; these pin what the provider itself does
// when it is asked to advance from a step a screen does not usually advance
// from, and the no-ops that stop a stray tap from corrupting the record.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, cleanup } from './helpers/render.js';
import { saveStudy, loadStudy } from '../src/study/studyStore.js';
import { PROTOCOL_FEEDBACK, PROTOCOL_TASKS } from '@core/study/studyConfig.mjs';

vi.mock('../src/state/AuthContext.jsx', () => ({ useAuth: () => ({ accessToken: null }) }));
vi.mock('../src/state/router.js', () => ({ navigate: vi.fn() }));
vi.mock('../src/services/transport.js', () => ({ warmStudyProxy: vi.fn() }));
vi.mock('../src/avatar/unity/unityBridge.js', () => ({
  getUnityAvailability: vi.fn(() => false),
  getUnityLoadState: vi.fn(() => null),
  probeUnity: vi.fn(async () => {}),
}));
vi.mock('../src/study/events.js', () => ({
  emit: vi.fn(),
  flush: vi.fn(async () => {}),
  installUnloadFlush: vi.fn(),
  pendingCount: vi.fn(() => 0),
  resetQueue: vi.fn(),
}));

const { StudyProvider, useStudy, detectRenderer } = await import('../src/study/StudyContext.jsx');
const { navigate } = await import('../src/state/router.js');
const { warmStudyProxy } = await import('../src/services/transport.js');
const { emit } = await import('../src/study/events.js');
const { getUnityAvailability, probeUnity } = await import('../src/avatar/unity/unityBridge.js');

const SESSION = {
  sessionId: '11111111-2222-4333-8444-555555555555',
  accessCode: 'test-access-code',
  participantCode: 'P01',
  group: 'caregiver',
  armOrder: 'AB',
  setOrder: '12',
  protocol: PROTOCOL_TASKS,
};

/** Progress checkpoints posted to the API, as their parsed bodies. */
const checkpoints = () => fetch.mock.calls
  .filter(([url]) => url === '/api/study/progress')
  .map(([, init]) => JSON.parse(init.body));

async function mount(stored) {
  saveStudy(stored);
  return renderHook(() => useStudy(), { wrapper: StudyProvider });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

describe('next() from setup', () => {
  it('moves to the background questions and checkpoints that step', async () => {
    const { result } = await mount({ ...SESSION, step: 'setup' });
    await flush(() => result.current.next());
    expect(result.current.step).toBe('background');
    expect(checkpoints()).toEqual([{ sessionId: SESSION.sessionId, step: 'background', stageIndex: 0, taskIndex: 0 }]);
  });

  it('before a session row exists, advances locally and posts nothing', async () => {
    const { result } = await mount({ step: 'setup' });
    await flush(() => result.current.next());
    expect(result.current.step).toBe('background');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('next() from an arm brief', () => {
  it('starts the task exactly as the Start button does', async () => {
    const { result } = await mount({ ...SESSION, step: 'armbrief' });
    const { stage, task } = result.current;
    expect(stage && task).toBeTruthy();

    const before = Date.now();
    await flush(() => result.current.next());

    expect(result.current.step).toBe('task');
    expect(result.current.taskId).toBe(task.id);
    expect(loadStudy().taskStartedAt).toBeGreaterThanOrEqual(before);
    expect(emit).toHaveBeenCalledWith('task_start', { arm: stage.arm, taskId: task.id, set: stage.set });
    expect(checkpoints().map((c) => c.step)).toEqual(['task']);
    expect(warmStudyProxy).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(stage.arm === 'A' ? '#/app/voice' : '#/app/chat');
  });
});

describe('next() from a step it does not advance', () => {
  it.each(['task', 'done', 'stopped', 'explore'])('%s: nothing changes, nothing is recorded', async (step) => {
    const { result } = await mount({ ...SESSION, step });
    let returned = 'unset';
    await flush(() => { returned = result.current.next(); });
    expect(returned).toBeUndefined();
    expect(result.current.step).toBe(step);
    expect(emit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('task boundaries with no task in hand', () => {
  // No arm order yet (setup not finished), so there is no stage and no task.
  it('startTask() is a no-op: no clock, no event, no navigation', async () => {
    const { result } = await mount({ ...SESSION, armOrder: '', step: 'armbrief' });
    expect(result.current.stage).toBeNull();
    await flush(() => result.current.startTask());
    expect(result.current.step).toBe('armbrief');
    expect(loadStudy().taskStartedAt).toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('endTask() is a no-op: no task_end without a matching task', async () => {
    const { result } = await mount({ ...SESSION, armOrder: '', step: 'task' });
    await flush(() => result.current.endTask('yes'));
    expect(result.current.step).toBe('task');
    expect(emit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('free use outside the feedback protocol’s explore step', () => {
  it.each([
    ['a tasks session', { ...SESSION, step: 'explore' }],
    ['a feedback session past free use', { ...SESSION, protocol: PROTOCOL_FEEDBACK, step: 'feedback' }],
  ])('%s: startExplore() and endExplore() change nothing', async (_label, stored) => {
    const { result } = await mount(stored);
    await flush(() => result.current.startExplore());
    await flush(() => result.current.endExplore());
    expect(result.current.step).toBe(stored.step);
    expect(loadStudy().exploreStartedAt).toBeNull();
    expect(emit).not.toHaveBeenCalled();
    expect(warmStudyProxy).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('detectRenderer', () => {
  it('probes for the Unity build when nobody has yet, then reports what it found', async () => {
    let available = null;
    getUnityAvailability.mockImplementation(() => available);
    probeUnity.mockImplementation(async () => { available = true; });
    await expect(detectRenderer()).resolves.toBe('unity');
    expect(probeUnity).toHaveBeenCalledTimes(1);
  });

  it('does not probe again once the answer is known', async () => {
    getUnityAvailability.mockReturnValue(false);
    await expect(detectRenderer()).resolves.toBe('threejs');
    expect(probeUnity).not.toHaveBeenCalled();
  });

  it('a probe that throws is recorded as unknown rather than failing the session start', async () => {
    getUnityAvailability.mockReturnValue(null);
    probeUnity.mockRejectedValue(new Error('loader blocked'));
    await expect(detectRenderer()).resolves.toBe('unknown');
  });
});
