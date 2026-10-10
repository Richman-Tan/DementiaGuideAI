// Create or resume a study session.
//
// Idempotent on participant code: a participant who closes the tab and returns
// gets the same session row and the same arm assignment, so a resumed session
// cannot silently land in a different Latin-square cell.
import { guard, readUserId } from '../_lib/guard.js';
import { selectOne, insertReturning, rpc, adminConfigured } from '../_lib/supabaseAdmin.js';
import {
  parseParticipantCode,
  normaliseParticipantCode,
  assignmentFor,
  GROUPS,
  STUDY_VERSION,
  CONSENT_FORM_VERSION,
  PROTOCOLS,
  PROTOCOL_TASKS,
  PROTOCOL_FEEDBACK,
  FEEDBACK_GROUPS,
  FEEDBACK_NOTICE_VERSION,
  // Relative, not the '@dementiaguide/core' package specifier. The bundler
  // traces this file into the deployment either way, but it lands at its real
  // path (packages/core/...) with no node_modules in the lambda, so a bare
  // specifier resolves at build time and then throws ERR_MODULE_NOT_FOUND on
  // the first request — a 500 that no local build or test reproduces.
} from '../../../../packages/core/study/studyConfig.mjs';

/**
 * The protocols this deployment accepts, from STUDY_PROTOCOLS (comma-separated,
 * default "tasks"). A protocol must be both known and listed here.
 *
 * Off by default on purpose: the feedback round needs a migration, its own
 * access codes and wording its owners have signed off, and none of that is
 * implied by a code deploy. Read per request so a test can stub it.
 */
function enabledProtocols() {
  const raw = process.env.STUDY_PROTOCOLS || PROTOCOL_TASKS;
  return raw.split(',').map((p) => p.trim()).filter((p) => PROTOCOLS.includes(p));
}

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
    protocol = PROTOCOL_TASKS,
    group = 'caregiver',
    consent = {},
    consentTranscripts = false,
    supporterPresent = null,
    userAgent = '',
    browser = '',
    renderer = '',
  } = req.body || {};

  // A code is optional. It is sent when the participant is RETURNING (the client
  // has one stored, or they typed the one they were given to recover a session
  // on another device); a first-time participant sends none and is allocated
  // one. Since the study is handed round on one shared access code, nobody is
  // assigning these by hand, and two people choosing the same number would be
  // silently merged into a single session by the unique index.
  const supplied = String(rawCode ?? '').trim() !== '';
  let number = supplied ? parseParticipantCode(rawCode) : null;
  let participantCode = supplied ? normaliseParticipantCode(rawCode) : null;
  if (supplied && number === null) {
    res.status(400).json({ error: 'participant code should look like P07' });
    return;
  }
  if (!GROUPS.includes(group)) {
    res.status(400).json({ error: 'unknown participant group' });
    return;
  }
  if (!PROTOCOLS.includes(protocol)) {
    res.status(400).json({ error: 'unknown protocol' });
    return;
  }
  const enabled = enabledProtocols();
  if (!enabled.includes(protocol)) {
    // 403 and a plain "not available", which the client shows as such. Never a
    // silent fall-back to the tasks protocol: that would put someone into the
    // consented study without its consent form.
    res.status(403).json({ error: 'not available' });
    return;
  }
  const feedback = protocol === PROTOCOL_FEEDBACK;
  if (feedback && !FEEDBACK_GROUPS.includes(group)) {
    res.status(400).json({ error: 'that group is not part of the feedback round' });
    return;
  }
  // The protocol column exists only once scripts/migrations/2026-10-07_study_protocol.sql
  // has run, and that migration is the first step of switching the feedback
  // round on. So the column is read and written only when the round is enabled,
  // and a deployment that has never enabled it behaves exactly as before.
  const protocolColumn = enabled.includes(PROTOCOL_FEEDBACK);

  let existing;
  if (participantCode) {
    try {
      existing = await selectOne(
        'study_sessions',
        'id,participant_code,participant_number,participant_group,arm_order,set_order,completed_at,step,stage_index,task_index,study_version'
          + (protocolColumn ? ',protocol' : ''),
        `participant_code=eq.${encodeURIComponent(participantCode)}`
      );
    } catch (err) {
      console.error(`[study] session lookup failed: ${err?.message ?? err}`);
      res.status(500).json({ error: 'could not start session' });
      return;
    }
  }

  if (existing) {
    const s = existing;
    // A code from one round must not resume a session of the other: the flows
    // have different steps, and the tasks one would run without its consent.
    const existingProtocol = s.protocol ?? PROTOCOL_TASKS;
    if (protocolColumn && existingProtocol !== protocol) {
      res.status(409).json({ error: 'that participant code belongs to a different study' });
      return;
    }
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
      // The version this session STARTED under, not the one running now. A
      // participant resuming after an instrument change answered the older set
      // in their first half, and reporting the current constant here would claim
      // otherwise. Falls back only for rows written before the column existed.
      studyVersion: s.study_version ?? STUDY_VERSION,
      protocol: existingProtocol,
    });
    return;
  }

  // First-time participant: take the next number from the sequence. Allocated
  // here rather than in the client so it is atomic — two people starting in the
  // same second get different numbers, which "read the max and add one" cannot
  // guarantee under concurrency.
  if (number === null) {
    try {
      // `{}`, not no argument: rpc() JSON.stringifies what it is given, and
      // undefined would send a bodyless POST that PostgREST rejects.
      number = await rpc('claim_participant_number', {});
    } catch (err) {
      console.error(`[study] participant number allocation failed: ${err?.message ?? err}`);
      res.status(500).json({ error: 'could not start session' });
      return;
    }
    if (!Number.isInteger(number) || number < 1) {
      console.error(`[study] participant number allocation returned ${JSON.stringify(number)}`);
      res.status(500).json({ error: 'could not start session' });
      return;
    }
    participantCode = normaliseParticipantCode(`P${number}`);
  }

  // No arms on the feedback round, so no Latin-square cell: null, not a
  // meaningless 'AB', so nothing downstream can mistake it for a tasks session.
  const { armOrder, setOrder } = feedback ? { armOrder: null, setOrder: null } : assignmentFor(number);
  let inserted;
  try {
    inserted = await insertReturning('study_sessions', {
      participant_code: participantCode,
      participant_number: number,
      participant_group: group,
      arm_order: armOrder,
      set_order: setOrder,
      is_pilot: group === 'pilot',
      // Which instrument set this participant was actually shown. Reported to
      // the client since the beginning but never stored, so the one value that
      // says whether two sessions are poolable existed only in a JSON reply
      // nothing kept. Needs scripts/migrations/2026-08-19_study_version_stamp.sql.
      study_version: STUDY_VERSION,
      // On the feedback round this records that the privacy notice was read, and
      // which version — there is no consent form.
      consent: { ...consent, formVersion: feedback ? FEEDBACK_NOTICE_VERSION : CONSENT_FORM_VERSION },
      ...(protocolColumn ? { protocol } : {}),
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
    protocol,
  });
}
