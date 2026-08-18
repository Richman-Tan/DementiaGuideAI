// Create or resume a study session.
//
// Idempotent on participant code: a participant who closes the tab and returns
// gets the same session row and the same arm assignment, so a resumed session
// cannot silently land in a different Latin-square cell.
import { guard, readUserId } from '../_lib/guard.js';
import { selectOne, insertReturning, adminConfigured } from '../_lib/supabaseAdmin.js';
import {
  parseParticipantCode,
  normaliseParticipantCode,
  assignmentFor,
  GROUPS,
  STUDY_VERSION,
  CONSENT_FORM_VERSION,
} from '@dementiaguide/core/study/studyConfig.mjs';

export default async function handler(req, res) {
  // Not metered: session creation happens once and must never be the request
  // that trips a participant over the daily cap.
  if (!(await guard(req, res, { meter: false }))) return;
  // adminConfigured covers both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, so
  // this is the single place the response is sent — requireEnv would have
  // already replied, and a second send is a write-after-end.
  if (!adminConfigured) {
    console.error('[study] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(503).json({ error: 'study backend not configured' });
    return;
  }

  const {
    participantCode: rawCode,
    group = 'caregiver',
    consent = {},
    consentTranscripts = false,
    supporterPresent = null,
    userAgent = '',
    browser = '',
    renderer = '',
  } = req.body || {};

  const number = parseParticipantCode(rawCode);
  const participantCode = normaliseParticipantCode(rawCode);
  if (number === null) {
    res.status(400).json({ error: 'participant code should look like P07' });
    return;
  }
  if (!GROUPS.includes(group)) {
    res.status(400).json({ error: 'unknown participant group' });
    return;
  }

  let existing;
  try {
    existing = await selectOne(
      'study_sessions',
      'id,participant_code,participant_number,participant_group,arm_order,set_order,completed_at,step,stage_index,task_index',
      `participant_code=eq.${encodeURIComponent(participantCode)}`
    );
  } catch (err) {
    console.error(`[study] session lookup failed: ${err?.message ?? err}`);
    res.status(500).json({ error: 'could not start session' });
    return;
  }

  if (existing) {
    const s = existing;
    res.status(200).json({
      sessionId: s.id,
      participantCode: s.participant_code,
      participantNumber: s.participant_number,
      group: s.participant_group,
      armOrder: s.arm_order,
      setOrder: s.set_order,
      // Where they got to, so a resume from a wiped browser lands correctly.
      step: s.step,
      stageIndex: s.stage_index,
      taskIndex: s.task_index,
      resumed: true,
      completed: Boolean(s.completed_at),
      studyVersion: STUDY_VERSION,
    });
    return;
  }

  const { armOrder, setOrder } = assignmentFor(number);
  let inserted;
  try {
    inserted = await insertReturning('study_sessions', {
      participant_code: participantCode,
      participant_number: number,
      participant_group: group,
      arm_order: armOrder,
      set_order: setOrder,
      is_pilot: group === 'pilot',
      consent: { ...consent, formVersion: CONSENT_FORM_VERSION },
      consent_transcripts: Boolean(consentTranscripts),
      supporter_present: typeof supporterPresent === 'boolean' ? supporterPresent : null,
      // A real identity alongside the hand-typed participant code, so a mistyped
      // code cannot silently attach one participant's events to another's session.
      user_id: readUserId(req),
      // Recorded to explain technical failures. No IP address is read or stored
      // (docs/study/ethics/data-management-plan.md §2).
      user_agent: String(userAgent).slice(0, 400),
      browser: String(browser).slice(0, 60),
      renderer: String(renderer).slice(0, 60),
    }, 'id');
  } catch (err) {
    console.error(`[study] session insert failed: ${err?.message ?? err}`);
    res.status(500).json({ error: 'could not start session' });
    return;
  }

  res.status(201).json({
    sessionId: inserted.id,
    participantCode,
    participantNumber: number,
    group,
    armOrder,
    setOrder,
    resumed: false,
    completed: false,
    studyVersion: STUDY_VERSION,
  });
}
