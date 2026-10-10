#!/usr/bin/env node
/**
 * Export the feedback round (docs/study/protocol-feedback.md) to CSV.
 *
 *   node scripts/study/export-feedback-data.mjs [--include-pilot] [--with-transcripts]
 *
 * Writes into docs/study/results/ (gitignored), beside the tasks study's files
 * but under its own names, so neither export can overwrite the other:
 *
 *   feedback-sessions.csv  one row per session
 *   feedback-usage.csv     what each person did during free use
 *   feedback-flags.csv     every flagged answer: the exchange and the comment
 *   feedback-answers.csv   open answers, long format, ready for thematic analysis
 *   feedback-sus.csv       the optional SUS, scored only when complete
 *   feedback-tries.csv     which "Things to try" each person ticked
 *   feedback-turns.csv     conversations (only with --with-transcripts, and only
 *                          for people who said yes to keeping them)
 *
 * This round is not research and its results are not for publication (the
 * approval it would need has expired). The files are for the team improving the
 * app. Pilot sessions are excluded unless --include-pilot is given.
 */
import { requireServiceKey, selectAll, writeCsv, susScore } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const includePilot = args.has('--include-pilot');
const withTranscripts = args.has('--with-transcripts');

requireServiceKey();

// Filtered on the column rather than client-side: a database that has never
// had the protocol migration has no feedback round to export, and saying so
// beats an empty file.
let all;
try {
  all = await selectAll('study_sessions', 'protocol=eq.feedback&order=participant_number.asc');
} catch (err) {
  console.error(`Could not read feedback sessions (${err.message}).`);
  console.error('Has scripts/migrations/2026-10-07_study_protocol.sql been run?');
  process.exit(1);
}
const sessions = includePilot ? all : all.filter((s) => !s.is_pilot);
if (sessions.length === 0) {
  console.error(`No feedback sessions found.${all.length ? ` (${all.length} pilot sessions excluded)` : ''}`);
  process.exit(1);
}

const ids = new Set(sessions.map((s) => s.id));
const events = (await selectAll('study_events', 'order=seq.asc')).filter((e) => ids.has(e.session_id));
const bySession = new Map(sessions.map((s) => [s.id, []]));
for (const e of events) bySession.get(e.session_id).push(e);
const code = (s) => s.participant_code;
const kinds = (list, kind) => list.filter((e) => e.kind === kind);

// Merge, not last-wins: each snapshot carries what was on screen at the time,
// and the closing snapshot can hold answers given after feedback_done.
function responsesOf(list) {
  const out = {};
  for (const e of list) if (e.payload?.responses) Object.assign(out, e.payload.responses);
  return out;
}

// ─── feedback-sessions.csv ───────────────────────────────────────────────────

const sessionRows = sessions.map((s) => {
  const list = bySession.get(s.id);
  return {
    session_code: code(s),
    group: s.participant_group,
    notice_version: s.consent?.formVersion ?? '',
    conversations_kept: s.consent_transcripts,
    browser: s.browser,
    renderer: s.renderer,
    started_at: s.started_at,
    completed_at: s.completed_at,
    stopped_early: s.stopped_early,
    reached_questions: kinds(list, 'feedback_done').length > 0,
    completed: kinds(list, 'session_complete').length > 0,
  };
});

// ─── feedback-usage.csv ──────────────────────────────────────────────────────

const usageRows = sessions.map((s) => {
  const list = bySession.get(s.id);
  const turns = kinds(list, 'turn');
  const paths = kinds(list, 'page_view').map((e) => String(e.payload?.path || ''));
  const articles = new Set(paths.filter((p) => p.startsWith('/app/library/')).map((p) => p.split('/')[3]));
  const days = new Set(list.map((e) => String(e.client_ts || e.created_at || '').slice(0, 10)).filter(Boolean));
  const tried = new Map();
  for (const e of kinds(list, 'try_done')) tried.set(e.payload?.id, Boolean(e.payload?.done));
  const exploreMs = kinds(list, 'explore_end').reduce((n, e) => n + (Number(e.payload?.durationMs) || 0), 0);
  return {
    session_code: code(s),
    // Wall clock between "Start using the app" and "I'm finished" (or stop),
    // including any time away; tab_hidden events are in the raw table.
    explore_minutes: exploreMs ? Math.round(exploreMs / 6000) / 10 : '',
    active_days: days.size,
    turns: turns.length,
    spoken_turns: turns.filter((e) => e.payload?.modality === 'spoken').length,
    typed_turns: turns.filter((e) => e.payload?.modality === 'typed').length,
    page_views: paths.length,
    articles_opened: articles.size,
    ideas_tried: [...tried.values()].filter(Boolean).length,
    flags: kinds(list, 'answer_flagged').length,
  };
});

// ─── feedback-flags.csv ──────────────────────────────────────────────────────

const flagRows = [];
for (const s of sessions) {
  for (const e of kinds(bySession.get(s.id), 'answer_flagged')) {
    flagRows.push({
      session_code: code(s),
      flagged_at: e.client_ts,
      surface: e.payload?.surface ?? '',
      turn_id: e.payload?.turnId ?? '',
      question: e.payload?.question ?? '',
      answer: e.payload?.answer ?? '',
      comment: e.payload?.comment ?? '',
    });
  }
}

// ─── feedback-answers.csv and feedback-sus.csv ───────────────────────────────

const answerRows = [];
const susRows = [];
for (const s of sessions) {
  const r = responsesOf(bySession.get(s.id));
  for (const [k, v] of Object.entries(r)) {
    if (!k.startsWith('feedback.') || typeof v !== 'string' || !v.trim()) continue;
    answerRows.push({ session_code: code(s), question_id: k.slice('feedback.'.length), answer: v.trim() });
  }
  const items = {};
  for (let i = 1; i <= 10; i++) items[`q${i}`] = r[`sus.feedback.q${i}`];
  const answered = Object.values(items).filter((v) => typeof v === 'number').length;
  if (answered > 0) susRows.push({ session_code: code(s), ...items, answered, sus: susScore(items) });
}

// ─── feedback-tries.csv ──────────────────────────────────────────────────────

const tryRows = [];
for (const s of sessions) {
  const latest = new Map();
  for (const e of kinds(bySession.get(s.id), 'try_done')) latest.set(e.payload?.id, Boolean(e.payload?.done));
  for (const [id, done] of latest) tryRows.push({ session_code: code(s), idea: id, ticked: done });
}

// ─── feedback-turns.csv — only what people agreed to keep ────────────────────

const turnRows = [];
if (withTranscripts) {
  for (const s of sessions) {
    if (!s.consent_transcripts) continue;
    for (const e of kinds(bySession.get(s.id), 'turn')) {
      if (e.payload?.question === undefined) continue;
      turnRows.push({
        session_code: code(s),
        at: e.client_ts,
        turn_id: e.payload?.turnId ?? '',
        modality: e.payload?.modality ?? '',
        question: e.payload.question,
        answer: e.payload?.answer ?? '',
      });
    }
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────

const written = [];
const write = (name, rows) => { if (rows.length) written.push(writeCsv(name, Object.keys(rows[0]), rows)); };
write('feedback-sessions.csv', sessionRows);
write('feedback-usage.csv', usageRows);
write('feedback-flags.csv', flagRows);
write('feedback-answers.csv', answerRows);
write('feedback-sus.csv', susRows);
write('feedback-tries.csv', tryRows);
write('feedback-turns.csv', turnRows);

console.log(`Exported ${sessions.length} feedback session(s)${includePilot ? ' (pilots included)' : ''}:`);
for (const p of written) console.log(`  ${p}`);
console.log(`\n${flagRows.length} flagged answer(s), ${answerRows.length} open answer(s).`);
