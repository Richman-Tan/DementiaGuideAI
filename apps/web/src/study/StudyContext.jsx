// The study flow: consent → background → [arm: brief, tasks, SUS, Likert] ×2 →
// debrief → close. State lives in localStorage so a participant who closes the
// tab and comes back resumes where they were, with the same arm assignment.
//
// Task timing is anchored on wall-clock epochs rather than performance.now()
// for the same reason: a reload must not restart the clock.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadStudy, saveStudy, clearStudy, isStudyMode } from './studyStore.js';
import { needsResumeCheck } from './guards.js';
import { emit, flush, installUnloadFlush, pendingCount, resetQueue } from './events.js';
import { closeSession } from './closeSession.js';
import { apiUrl } from '../services/apiBase.js';
import { sequenceFor, normaliseParticipantCode, parseParticipantCode } from '@core/study/studyConfig.mjs';
import { navigate } from '../state/router.js';
import { getUnityAvailability, getUnityLoadState, probeUnity } from '../avatar/unity/unityBridge.js';
import { useAuth } from '../state/AuthContext.jsx';

const Ctx = createContext(null);

/**
 * Whether the person at the keyboard has been confirmed as the owner of the
 * session this device restored from localStorage.
 *
 * Module scope on purpose: it must reset on page load and survive in-app
 * navigation, which is exactly the lifetime of a module binding. React state
 * alone would not do — the provider never unmounts, so a flag inside it would
 * persist across a participant handover that happens without a reload; a stored
 * flag would not reset on the reload that a handover normally does involve.
 *
 * The failure this exists for: the study runs on ONE forwarded link, so a second
 * person opening it on a device where the first did not finish is silently
 * resumed INTO the first participant's session — same participant code, answers
 * already filled in, arm assignment from someone else's Latin square cell. Two
 * people merged into one row, with nothing in the data to say so.
 */
let resumeAcknowledged = false;

export const STEPS = [
  // `group` precedes `consent` on purpose. Participants living with dementia
  // consent on paper, with their support person, before the session — the
  // eleven-item on-screen form is for the unmoderated groups. The app cannot
  // honour that distinction unless it knows who it is talking to before it asks.
  'intro', 'info', 'group', 'consent', 'setup', 'background',
  'armbrief', 'task', 'posttask', 'sus', 'likert',
  'recheck', 'debrief', 'done', 'stopped',
];

async function post(path, body, accessCode, accessToken = null) {
  const resp = await fetch(apiUrl(path), {
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
  const [resumeAck, setResumeAck] = useState(resumeAcknowledged);
  const tokenRef = useRef(null);
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const acknowledgeResume = useCallback(() => {
    resumeAcknowledged = true;
    setResumeAck(true);
  }, []);

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
    // The participant code is optional. A first-time participant supplies none
    // and the server allocates one; a returning participant is identified by the
    // code already in the store, or by re-typing the one they were given if they
    // are resuming on another device. Only reject a code that was actually
    // entered and is malformed — an empty field is the normal path now.
    const typed = participantCode ? normaliseParticipantCode(participantCode) : null;
    if (participantCode && !typed) {
      throw new Error('That participant code does not look right — it should be like P07.');
    }
    const code = typed || loadStudy().participantCode || null;

    // Persist first: the endpoint reads the access code from the store via the
    // event emitter, and a failed call should leave the codes on screen.
    saveStudy({ accessCode: accessCode.trim(), group, ...(code ? { participantCode: code } : {}) });

    const data = await post('/api/study/session', {
      ...(code ? { participantCode: code } : {}),
      group,
      consent,
      consentTranscripts,
      // Was destructured above and then left out of the body, so the column was
      // NULL for every session. Protocol §3.3 commits to recording that a support
      // person was present for a participant living with dementia — the safeguard
      // is only auditable if the answer is actually stored.
      supporterPresent,
      userAgent: navigator.userAgent,
      browser: detectBrowser(),
      renderer: await detectRenderer(),
    }, accessCode.trim(), tokenRef.current);

    if (!data.resumed) resetQueue();

    // This person just typed the codes in, so there is nothing left to confirm —
    // without this the gate would fire on the session it has just created.
    resumeAcknowledged = true;
    setResumeAck(true);

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
      // A new session inherits nothing from whoever used this device last.
      // resetQueue() above drops their unsent events; these are their answers,
      // which would otherwise pre-fill this participant's questionnaires and be
      // re-emitted under the new participant's code — including for items this
      // participant never saw.
      ...(data.resumed ? {} : { responses: {}, taskId: '', taskStartedAt: null }),
    });

    // The session row is created before the participant reaches this screen, so
    // without this a refresh on the very first questionnaire resumes to whatever
    // step the row was born with.
    checkpoint({ step: data.resumed ? (resumeStep || 'background') : 'background' });

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
  }, [update, checkpoint, state.step, state.stageIndex, state.taskIndex]);

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

    // Close a task that is still open. Stopping mid-task is a normal, encouraged
    // outcome (ethics/risk-and-distress-protocol.md §2) and the overlay puts "I
    // need to stop" beside the two end-task buttons — but without a matching
    // task_end the export has no upper bound for the window, so the whole task
    // vanished: its duration, its turn count and its away-time. The participants
    // most likely to press that button are the ones whose data the protocol is
    // most careful about.
    if (s.step === 'task' && stage && task) {
      emit('task_end', {
        arm: stage.arm,
        taskId: task.id,
        set: stage.set,
        durationMs: Date.now() - (s.taskStartedAt || Date.now()),
        gaveUp: false,
        // Not a completed task: the duration is a lower bound on what the
        // participant would have taken, so analysis must keep it out of the
        // time-on-task comparison while still using the window to attribute
        // turns. Deliberately NOT called "abandoned" — the report already uses
        // that word for gaveUp ("I couldn't find it"), which is a different
        // thing a participant can do.
        stoppedMidTask: true,
      });
    }

    // Whatever is already answered on the screen they are standing on. Every
    // other response event fires from next(), so anything entered and not yet
    // submitted was discarded — a completed SUS, or five debrief answers, thrown
    // away at the exact moment someone decided to stop. The export merges
    // response blobs rather than overwriting, so this is additive.
    if (Object.keys(s.responses || {}).length) {
      emit('responses_snapshot', { responses: s.responses, atStep: s.step, stoppedEarly });
    }

    emit(stoppedEarly ? 'session_stopped' : 'session_complete', {});
    update({ step: stoppedEarly ? 'stopped' : 'done', taskStartedAt: null });
    navigate('#/study');
    await closeSession({
      flush,
      complete: s.sessionId
        ? () => post('/api/study/complete', { sessionId: s.sessionId, stoppedEarly }, s.accessCode)
        : null,
    });
    // stage/task are needed to close an open task above.
  }, [update, stage, task]);

  const next = useCallback(() => {
    const s = loadStudy();
    switch (s.step) {
      case 'intro': return update({ step: 'info' });
      case 'info': return update({ step: 'group' });
      case 'group': return update({ step: 'consent' });
      case 'consent': return update({ step: 'setup' });
      case 'setup':
        checkpoint({ step: 'background' });
        return update({ step: 'background' });
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
        const afterTasks = s.group === 'plwd' ? 'likert' : 'sus';
        checkpoint({ step: afterTasks });
        return update({ step: afterTasks });
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

  // Hand the device to the next participant.
  //
  // Refuses while anything is still queued rather than clearing regardless:
  // resetQueue() discards the queue, and a session that ran on bad wifi keeps
  // its whole record there. Returns what happened so the caller can say so
  // instead of silently appearing to work.
  const reset = useCallback(async () => {
    try {
      await flush();
    } catch {
      // Ignore — the pending check below is the decision, not this outcome.
    }
    const pending = pendingCount();
    if (pending > 0) return { cleared: false, pending };
    clearStudy();
    resetQueue();
    setState(loadStudy());
    return { cleared: true, pending: 0 };
  }, []);

  const value = {
    ...state,
    active: isStudyMode(),
    sequence, stage, task, isLastStage, isLastTask,
    begin, setResponse, next, startTask, endTask, stop, reset, update,
    // "Is this still you?" — asked once per page load when a live session was
    // restored from this device, and never for a session started in this load.
    needsResumeCheck: needsResumeCheck(state, resumeAck),
    acknowledgeResume,
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
