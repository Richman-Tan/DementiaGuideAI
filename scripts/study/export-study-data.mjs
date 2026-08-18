#!/usr/bin/env node
/**
 * Export study sessions and events into tidy CSVs for analysis.
 *
 *   node scripts/study/export-study-data.mjs [--include-pilot] [--with-transcripts]
 *
 * Writes into docs/study/results/ (gitignored — study data never enters the
 * repository, see docs/study/ethics/data-management-plan.md §6):
 *
 *   sessions.csv   one row per participant
 *   tasks.csv      one row per participant × task — the efficiency measures
 *   responses.csv  long-format questionnaire answers
 *   sus.csv        one row per participant × arm, scored
 *   latency.csv    one row per instrumented turn
 *   turns.csv      transcripts (only with --with-transcripts)
 *
 * Pilot sessions are EXCLUDED by default. They exist to debug the protocol and
 * are never reported (docs/study/pilot-checklist.md).
 *
 * Transcripts are excluded by default too, and are only ever exported for
 * participants who ticked the separate transcript consent item.
 */
import { requireServiceKey, selectAll, writeCsv, median, OUT_DIR } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const includePilot = args.has('--include-pilot');
const withTranscripts = args.has('--with-transcripts');

requireServiceKey();

const allSessions = await selectAll('study_sessions', 'order=participant_number.asc');
const sessions = includePilot ? allSessions : allSessions.filter((s) => !s.is_pilot);
const excludedPilots = allSessions.length - sessions.length;

if (sessions.length === 0) {
  console.error('No sessions found.' + (excludedPilots ? ` (${excludedPilots} pilot sessions excluded)` : ''));
  process.exit(1);
}

const ids = new Set(sessions.map((s) => s.id));
const events = (await selectAll('study_events', 'order=seq.asc')).filter((e) => ids.has(e.session_id));
const byId = new Map(sessions.map((s) => [s.id, s]));
const evOf = (kind) => events.filter((e) => e.kind === kind);

// ─── sessions.csv ────────────────────────────────────────────────────────────

const completedIds = new Set(evOf('session_complete').map((e) => e.session_id));
const sessionRows = sessions.map((s) => ({
  participant_code: s.participant_code,
  participant_number: s.participant_number,
  group: s.participant_group,
  arm_order: s.arm_order,
  set_order: s.set_order,
  consent_transcripts: s.consent_transcripts,
  supporter_present: s.supporter_present,
  browser: s.browser,
  renderer: s.renderer,
  started_at: s.started_at,
  completed_at: s.completed_at,
  stopped_early: s.stopped_early,
  // "Completed" means both arms and the debrief, not merely that the row was
  // closed — a session stopped at task 4 also gets a completed_at.
  completed_both_arms: completedIds.has(s.id),
}));

// ─── tasks.csv — the efficiency measures ─────────────────────────────────────

const starts = evOf('task_start');
const ends = evOf('task_end');
const turns = evOf('turn');
const turnStarts = evOf('turn_start');
const postTask = evOf('posttask_response');
const hides = evOf('tab_hidden');
const shows = evOf('tab_visible');

// Pair each hide with the next show inside the window.
function hiddenDuring(sessionId, fromSeq, toSeq) {
  let total = 0;
  for (const h of hides) {
    if (h.session_id !== sessionId || h.seq <= fromSeq || h.seq >= toSeq) continue;
    const back = shows.find((v) => v.session_id === sessionId && v.seq > h.seq);
    if (!back || !h.client_ts || !back.client_ts) continue;
    total += Math.max(0, new Date(back.client_ts) - new Date(h.client_ts));
  }
  return total || null;
}

const taskRows = [];
for (const end of ends) {
  const s = byId.get(end.session_id);
  if (!s) continue;
  const start = starts.find((x) => x.session_id === end.session_id && x.task_id === end.task_id);
  if (!start) continue;

  // Turns inside the task window, counted by sequence number rather than
  // timestamp: client clocks can drift, seq cannot.
  // Count turn_start, not turn: the completing `turn` event fires after the
  // spoken answer finishes and can land after task_end, so counting those
  // undercounted — and did so more in Arm A, where answers are longer.
  const turnCount = turnStarts.filter(
    (t) => t.session_id === end.session_id && t.seq > start.seq && t.seq < end.seq
  ).length;

  const hiddenMs = hiddenDuring(end.session_id, start.seq, end.seq);

  taskRows.push({
    session_id: end.session_id,
    participant_code: s.participant_code,
    group: s.participant_group,
    arm: end.arm,
    task_id: end.task_id,
    set: end.payload?.set ?? null,
    // Position in the participant's own sequence — needed to check for order
    // effects (docs/study/analysis-plan.md §3.4).
    arm_position: s.arm_order.indexOf(end.arm) + 1,
    duration_ms: end.payload?.durationMs ?? null,
    duration_s: end.payload?.durationMs != null ? Math.round(end.payload.durationMs / 1000) : null,
    // Time the tab was hidden inside the window — the difference between a slow
    // participant and one who walked away.
    hidden_ms: hiddenMs,
    turns: turnCount,
    gave_up: end.payload?.gaveUp ?? null,
    // True when the participant stopped the SESSION while this task was open,
    // rather than ending the task. Distinct from gave_up, which is a task they
    // finished by saying they could not find the answer. The window still
    // attributes turns, but the duration is only a lower bound.
    stopped_mid_task: end.payload?.stoppedMidTask ?? false,
    self_report: null,   // filled from the post-task instrument below
    effort: null,
    rubric_score: '',    // scored by hand against docs/study/tasks.md §2
  });
}

// Post-task answers are carried in the questionnaire responses blob rather than
// as their own events, so pull them across by key.
// MERGE, not last-wins. Each snapshot is the whole responses blob at that
// moment, so overwriting meant a participant who stopped before the next
// questionnaire lost every answer given since the previous one.
const latestResponses = new Map();
for (const e of events) {
  if (!e.payload?.responses) continue;
  latestResponses.set(e.session_id, { ...(latestResponses.get(e.session_id) || {}), ...e.payload.responses });
}

// Prefer the dedicated per-task events; fall back to the merged blob for
// sessions recorded before those existed.
const postTaskByKey = new Map();
for (const e of postTask) {
  if (e.task_id) postTaskByKey.set(`${e.session_id}:${e.task_id}`, e.payload || {});
}
for (const row of taskRows) {
  const sess = byId.get(row.session_id);
  const direct = postTaskByKey.get(`${row.session_id}:${row.task_id}`);
  const r = latestResponses.get(sess?.id) || {};
  row.self_report = direct?.found ?? r[`${row.task_id}.found`] ?? null;
  row.effort = direct?.effort ?? r[`${row.task_id}.effort`] ?? null;
}

// ─── responses.csv — long format ─────────────────────────────────────────────

const responseRows = [];
for (const s of sessions) {
  const r = latestResponses.get(s.id) || {};
  for (const [key, value] of Object.entries(r)) {
    responseRows.push({
      participant_code: s.participant_code,
      group: s.participant_group,
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
    });
  }
}

// ─── sus.csv ─────────────────────────────────────────────────────────────────

const { susScore } = await import('./lib.mjs');
const susRows = [];
for (const s of sessions) {
  const r = latestResponses.get(s.id) || {};
  for (const arm of ['A', 'B']) {
    const items = {};
    for (let i = 1; i <= 10; i++) {
      const v = r[`sus.${arm}.q${i}`];
      if (v !== undefined) items[`q${i}`] = v;
    }
    const likert = {
      trust: r[`likert.${arm}.trust`] ?? null,
      engagement: r[`likert.${arm}.engagement`] ?? null,
      helpfulness: r[`likert.${arm}.helpfulness`] ?? null,
      clarity: r[`likert.${arm}.clarity`] ?? null,
    };
    // Build the row if EITHER instrument has an answer. Every item is skippable
    // by design, so gating the Likert answers on SUS being present discarded one
    // of the two pre-registered usability criteria — and all PLWD data, since
    // that group never sees SUS.
    const hasLikert = Object.values(likert).some((v) => v !== null);
    if (Object.keys(items).length === 0 && !hasLikert) continue;
    susRows.push({
      participant_code: s.participant_code,
      group: s.participant_group,
      arm,
      answered: Object.keys(items).length,
      sus: susScore(items),
      ...likert,
    });
  }
}

// ─── latency.csv ─────────────────────────────────────────────────────────────

const latencyRows = evOf('latency').map((e) => {
  const s = byId.get(e.session_id);
  return {
    participant_code: s?.participant_code,
    arm: e.arm,
    task_id: e.task_id,
    browser: s?.browser,
    stt_ms: e.payload?.stt_ms ?? null,
    rag_ms: e.payload?.rag_ms ?? null,
    llm_to_token_ms: e.payload?.llm_to_token_ms ?? null,
    first_sentence_ms: e.payload?.first_sentence_ms ?? null,
    tts_first_ms: e.payload?.tts_first_ms ?? null,
    to_first_audio_ms: e.payload?.to_first_audio_ms ?? null,
    // Audio in hand → audio audible. Carried through because it is the interval
    // that used to be excluded from to_first_audio_ms, so it is what quantifies
    // how far the old avatar-vs-text figures were out.
    playback_wait_ms: e.payload?.playback_wait_ms ?? null,
    to_first_token_ms: e.payload?.to_first_token_ms ?? null,
    streaming: e.payload?.streaming ?? null,
  };
});

// ─── fallbacks.csv — reliability, per analysis-plan §4.3 ─────────────────────

const fallbackRows = evOf('fallback').map((e) => {
  const s = byId.get(e.session_id);
  return {
    participant_code: s?.participant_code,
    arm: e.arm,
    task_id: e.task_id,
    kind: e.payload?.kind ?? null,
    reason: e.payload?.reason ?? null,
  };
});

// ─── turns.csv — transcripts, consent-gated ──────────────────────────────────

let turnRows = [];
let withheld = 0;
if (withTranscripts) {
  for (const t of turns) {
    const s = byId.get(t.session_id);
    if (!s) continue;
    // The separate transcript consent item. A participant who declined it still
    // contributes timing and questionnaire data, but never their conversation.
    if (!s.consent_transcripts) { withheld += 1; continue; }
    turnRows.push({
      participant_code: s.participant_code,
      arm: t.arm,
      task_id: t.task_id,
      seq: t.seq,
      question: t.payload?.question ?? '',
      answer: t.payload?.answer ?? '',
      source_ids: (t.payload?.sourceIds || []).join(' '),
    });
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────

const written = [];
written.push(writeCsv('sessions.csv', Object.keys(sessionRows[0]), sessionRows));
if (taskRows.length) written.push(writeCsv('tasks.csv', Object.keys(taskRows[0]), taskRows));
if (responseRows.length) written.push(writeCsv('responses.csv', Object.keys(responseRows[0]), responseRows));
if (susRows.length) written.push(writeCsv('sus.csv', Object.keys(susRows[0]), susRows));
if (latencyRows.length) written.push(writeCsv('latency.csv', Object.keys(latencyRows[0]), latencyRows));
if (fallbackRows.length) written.push(writeCsv('fallbacks.csv', Object.keys(fallbackRows[0]), fallbackRows));
if (turnRows.length) written.push(writeCsv('turns.csv', Object.keys(turnRows[0]), turnRows));

console.log(`Exported to ${OUT_DIR}`);
for (const p of written) console.log(`  ${p.split('/').pop()}`);
console.log('');
console.log(`sessions          ${sessions.length}`);
console.log(`  completed both  ${sessionRows.filter((r) => r.completed_both_arms).length}`);
console.log(`  stopped early   ${sessionRows.filter((r) => r.stopped_early).length}`);
console.log(`tasks completed   ${taskRows.length}`);
console.log(`median time (s)   ${median(taskRows.map((r) => r.duration_s)) ?? '—'}`);
console.log(`latency turns     ${latencyRows.length}`);
if (excludedPilots) console.log(`pilot sessions excluded  ${excludedPilots}`);
if (!withTranscripts) {
  console.log('\nTranscripts not exported. Re-run with --with-transcripts to score task success.');
} else if (withheld) {
  console.log(`\n${withheld} turns withheld — those participants declined transcript consent.`);
}
console.log('\nNext: score rubric_score in tasks.csv against docs/study/tasks.md §2,');
console.log('then run scripts/study/analyse-study.mjs.');
