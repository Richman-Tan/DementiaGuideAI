// The study flow: consent → background → [arm: brief, tasks, SUS, Likert] ×2 →
// debrief → close. State lives in localStorage so a participant who closes the
// tab and comes back resumes where they were, with the same arm assignment.
//
// Task timing is anchored on wall-clock epochs rather than performance.now()
// for the same reason: a reload must not restart the clock.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadStudy, saveStudy, clearStudy, isStudyMode } from './studyStore.js';
import { emit, flush, installUnloadFlush, resetQueue } from './events.js';
import { sequenceFor, normaliseParticipantCode, parseParticipantCode } from '@core/study/studyConfig.mjs';
import { navigate } from '../state/router.js';
import { getUnityAvailability, getUnityLoadState, probeUnity } from '../avatar/unity/unityBridge.js';
import { useAuth } from '../state/AuthContext.jsx';

const Ctx = createContext(null);

export const STEPS = [
  'intro', 'info', 'consent', 'setup', 'background',
  'armbrief', 'task', 'posttask', 'sus', 'likert',
  'recheck', 'debrief', 'done', 'stopped',
];

async function post(path, body, accessCode, accessToken = null) {
  const resp = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-study-code': accessCode,
      // Lets the backend attach the session to a real identity. Optional: the
      // study still works without a Supabase session, it just cannot link.
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

export function StudyProvider({ children }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState(loadStudy);
  const tokenRef = useRef(null);
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const update = useCallback((patch) => setState(saveStudy(patch)), []);

  // Mirror progress to the session row. Fire-and-forget: losing a checkpoint
  // costs a slightly stale resume, whereas awaiting it would put a network
  // round-trip between the participant and the next screen.
  const checkpoint = useCallback((patch) => {
    const s = loadStudy();
    if (!s.sessionId || !s.accessCode) return;
    post('/api/study/progress', {
      sessionId: s.sessionId,
      step: patch.step ?? s.step,
      stageIndex: patch.stageIndex ?? s.stageIndex,
      taskIndex: patch.taskIndex ?? s.taskIndex,
    }, s.accessCode).catch((err) => {
      console.warn(`[study] progress checkpoint failed: ${err?.message ?? err}`);
    });
  }, []);

  useEffect(() => { installUnloadFlush(); }, []);

  const sequence = useMemo(() => {
    const n = parseParticipantCode(state.participantCode);
    if (n === null || !state.armOrder) return [];
    return sequenceFor(n, state.group);
  }, [state.participantCode, state.armOrder, state.group]);

  const stage = sequence[state.stageIndex] || null;
  const task = stage ? stage.tasks[state.taskIndex] || null : null;
  const isLastStage = state.stageIndex >= sequence.length - 1;
  const isLastTask = stage ? state.taskIndex >= stage.tasks.length - 1 : false;

  // ─── Session ──────────────────────────────────────────────────────────────

  const begin = useCallback(async ({ participantCode, accessCode, group, consent, consentTranscripts, supporterPresent = null }) => {
    const code = normaliseParticipantCode(participantCode);
    if (!code) throw new Error('That participant code does not look right — it should be like P07.');

    // Persist first: the endpoint reads the access code from the store via the
    // event emitter, and a failed call should leave the codes on screen.
    saveStudy({ participantCode: code, accessCode: accessCode.trim(), group });

    const data = await post('/api/study/session', {
      participantCode: code,
      group,
      consent,
      consentTranscripts,
      userAgent: navigator.userAgent,
      browser: detectBrowser(),
      renderer: await detectRenderer(),
    }, accessCode.trim(), tokenRef.current);

    if (!data.resumed) resetQueue();

    // NB study sessions never see the product's onboarding wizard — the router
    // exempts them (see useRoute). That is deliberate beyond the routing bug it
    // fixes: onboarding's answers (helper style, detail level, jargon) feed the
    // RAG prompt, so letting each participant pick their own would make the two
    // arms differ by more than the interface under test. Everyone runs defaults.

    // Resume must not send the participant back to the screen they are standing
    // on. `begin()` only ever runs from setup, so `state.step` is always 'setup'
    // here — using it made every resumed session re-render setup, and the Start
    // button then did nothing, forever. Prefer the server's record of progress,
    // fall back to local, and never resume *into* setup.
    const localStep = state.step && state.step !== 'setup' ? state.step : null;
    const resumeStep = data.step && data.step !== 'setup' ? data.step : localStep;
    update({
      sessionId: data.sessionId,
      participantCode: data.participantCode,
      group: data.group,
      armOrder: data.armOrder,
      setOrder: data.setOrder,
      consentTranscripts: Boolean(consentTranscripts),
      step: data.resumed ? (resumeStep || 'background') : 'background',
      stageIndex: data.resumed ? (data.stageIndex ?? state.stageIndex) : 0,
      taskIndex: data.resumed ? (data.taskIndex ?? state.taskIndex) : 0,
    });

    emit('session_start', {
      group: data.group,
      armOrder: data.armOrder,
      setOrder: data.setOrder,
      resumed: data.resumed,
      consentTranscripts: Boolean(consentTranscripts),
      supporterPresent,
      renderer: await detectRenderer(),
      avatarLoad: getUnityLoadState?.() ?? null,
    });
    flush();
    return data;
  }, [update, state.step, state.stageIndex, state.taskIndex]);

  const setResponse = useCallback((key, value) => {
    setState((prev) => saveStudy({ responses: { ...prev.responses, [key]: value } }));
  }, []);

  // ─── Task boundaries — these are the time-on-task measurements ────────────

  const startTask = useCallback(() => {
    if (!stage || !task) return;
    update({ step: 'task', taskStartedAt: Date.now(), taskId: task.id });
    checkpoint({ step: 'task' });
    emit('task_start', { arm: stage.arm, taskId: task.id, set: stage.set });
    navigate(stage.arm === 'A' ? '#/app/voice' : '#/app/chat');
  }, [stage, task, update, checkpoint]);

  const endTask = useCallback((found) => {
    if (!stage || !task) return;
    const started = loadStudy().taskStartedAt || Date.now();
    emit('task_end', {
      arm: stage.arm,
      taskId: task.id,
      set: stage.set,
      durationMs: Date.now() - started,
      gaveUp: found === 'no',
    });
    update({ step: 'posttask', taskStartedAt: null, taskId: '' });
    checkpoint({ step: 'posttask' });
    navigate('#/study');
  }, [stage, task, update, checkpoint]);

  // ─── Advance ──────────────────────────────────────────────────────────────

  const finish = useCallback(async (stoppedEarly) => {
    const s = loadStudy();
    emit(stoppedEarly ? 'session_stopped' : 'session_complete', {});
    update({ step: stoppedEarly ? 'stopped' : 'done', taskStartedAt: null });
    navigate('#/study');
    try {
      await flush();
      if (s.sessionId) await post('/api/study/complete', { sessionId: s.sessionId, stoppedEarly }, s.accessCode);
    } catch (err) {
      console.warn(`[study] could not close session: ${err?.message ?? err}`);
    }
  }, [update]);

  const next = useCallback(() => {
    const s = loadStudy();
    switch (s.step) {
      case 'intro': return update({ step: 'info' });
      case 'info': return update({ step: 'consent' });
      case 'consent': return update({ step: 'setup' });
      case 'setup': return update({ step: 'background' });
      case 'background':
        emit('background_done', { responses: s.responses });
        checkpoint({ step: 'armbrief' });
        return update({ step: 'armbrief' });
      case 'armbrief': return startTask();
      case 'posttask': {
        // Emit these as their own event rather than relying on a later
        // questionnaire snapshot to sweep them up. A participant who stops before
        // the next SUS used to lose every post-task answer they had given.
        const t = stage?.tasks?.[s.taskIndex];
        if (t) {
          emit('posttask_response', {
            arm: stage?.arm,
            taskId: t.id,
            found: s.responses[`${t.id}.found`] ?? null,
            effort: s.responses[`${t.id}.effort`] ?? null,
          });
        }
        // More tasks in this arm, or on to the questionnaires for it.
        if (!isLastTask) {
          checkpoint({ step: 'armbrief', taskIndex: s.taskIndex + 1 });
          update({ taskIndex: s.taskIndex + 1, step: 'armbrief' });
          return;
        }
        // Participants living with dementia get three plain-language questions
        // instead of SUS (instruments.md §7).
        return update({ step: s.group === 'plwd' ? 'likert' : 'sus' });
      }
      case 'sus':
        emit('sus_done', { arm: stage?.arm, responses: s.responses });
        checkpoint({ step: 'likert' });
        return update({ step: 'likert' });
      case 'likert':
        emit('likert_done', { arm: stage?.arm, responses: s.responses });
        if (isLastStage) { checkpoint({ step: 'debrief' }); return update({ step: 'debrief' }); }
        // Process consent, not a one-off signature: for participants living with
        // dementia the support person re-confirms willingness before the second
        // half (protocol.md §3.3). Stopping here is a normal outcome.
        if (s.group === 'plwd') { checkpoint({ step: 'recheck' }); return update({ step: 'recheck' }); }
        checkpoint({ step: 'armbrief', stageIndex: s.stageIndex + 1, taskIndex: 0 });
        return update({ step: 'armbrief', stageIndex: s.stageIndex + 1, taskIndex: 0 });
      case 'recheck':
        emit('consent_rechecked', { stageIndex: s.stageIndex });
        checkpoint({ step: 'armbrief', stageIndex: s.stageIndex + 1, taskIndex: 0 });
        return update({ step: 'armbrief', stageIndex: s.stageIndex + 1, taskIndex: 0 });
      case 'debrief':
        emit('debrief_done', { responses: s.responses });
        return finish(false);
      default:
        return undefined;
    }
  }, [update, checkpoint, startTask, finish, isLastTask, isLastStage, stage]);

  // "I need to stop" — available on every screen, no reason required
  // (docs/study/ethics/risk-and-distress-protocol.md §2).
  const stop = useCallback(() => finish(true), [finish]);

  const reset = useCallback(() => {
    clearStudy();
    resetQueue();
    setState(loadStudy());
  }, []);

  const value = {
    ...state,
    active: isStudyMode(),
    sequence, stage, task, isLastStage, isLastTask,
    begin, setResponse, next, startTask, endTask, stop, reset, update,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStudy = () => useContext(Ctx);

/** Coarse family detection — recorded to explain technical failures, and used
 *  by the browser gate. Web Speech API live transcription is Chrome/Edge only;
 *  everything else silently degrades to record-then-Whisper. */
export function detectBrowser() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'chrome';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export const SUPPORTED_BROWSERS = ['chrome', 'edge'];

/**
 * Which avatar the participant actually got. Recorded per session rather than
 * assumed: Unity is the deployed default, but effectiveProfile.js silently
 * degrades to the Three.js avatar if the probe fails — and a session that ran on
 * the fallback cannot be pooled with one that ran on Unity without saying so.
 */
export async function detectRenderer() {
  try {
    if (getUnityAvailability() === null) await probeUnity();
    return getUnityAvailability() ? 'unity' : 'threejs';
  } catch {
    return 'unknown';
  }
}
