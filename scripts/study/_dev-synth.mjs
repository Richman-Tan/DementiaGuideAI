#!/usr/bin/env node
/**
 * DEV ONLY — renders plausible CSVs so `analyse-study.mjs` and
 * `make-study-figures.py` can be eyeballed before real data exists.
 *
 * ⚠ THIS DOES NOT VALIDATE THE EXPORT, AND MUST NOT BE TREATED AS IF IT DOES.
 *
 * It writes finished CSV rows directly. It does not go through `emit()`, the
 * event endpoint, or `export-study-data.mjs`, so it can — and once did —
 * fabricate columns the real pipeline never produces. Trusting it as an
 * end-to-end check hid five defects at once: null `task_id` on every turn and
 * latency row, post-task answers that were never emitted, undercounted turns,
 * Likert answers dropped whenever SUS was skipped, and no Arm B latency at all.
 *
 * The export's recovery logic is tested for real in
 * `apps/web/tests/studyRecovery.test.js`, from events in the shape the app
 * actually emits. That is the check that counts. This file is a layout preview.
 *
 *   node scripts/study/_dev-synth.mjs
 *   node scripts/study/analyse-study.mjs
 *   node scripts/study/safety-scan-transcripts.mjs
 */
import { writeCsv, OUT_DIR } from './lib.mjs';
import { sequenceFor, assignmentFor, STUDY_VERSION } from '../../packages/core/study/studyConfig.mjs';

const N = 12;
// Deterministic pseudo-random so runs are reproducible and reviewable.
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

const sessions = [], tasks = [], sus = [], latency = [], turns = [], responses = [];

for (let n = 1; n <= N; n++) {
  const code = `P${String(n).padStart(2, '0')}`;
  const group = n <= 8 ? 'caregiver' : 'worker';
  const { armOrder, setOrder } = assignmentFor(n);
  const seq = sequenceFor(n, group);

  sessions.push({
    participant_code: code, participant_number: n, group,
    arm_order: armOrder, set_order: setOrder, study_version: STUDY_VERSION,
    consent_transcripts: true, browser: pick(['chrome', 'edge']), renderer: 'unity',
    started_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-01T10:40:00Z',
    stopped_early: false, completed_both_arms: true,
  });

  seq.forEach((stage, i) => {
    for (const t of stage.tasks) {
      // Voice deliberately a little slower than text — the direction the
      // pre-registered efficiency criterion is at risk of going.
      const dur = stage.arm === 'A' ? between(90, 260) : between(70, 200);
      const turnCount = between(1, 4);
      // A minority of Arm A turns typed, so the manipulation check has something
      // to report in the preview. Arm B has no microphone, so all of its are.
      const typed = stage.arm === 'B' ? turnCount : (rnd() < 0.15 ? 1 : 0);
      const primary = pick(['complete', 'complete', 'partial']);
      tasks.push({
        session_id: `sess-${n}`,
        participant_code: code, group, arm: stage.arm, task_id: t.id, set: stage.set,
        arm_position: i + 1, duration_ms: dur * 1000, duration_s: dur,
        turns: turnCount, typed_turns: typed, gave_up: false,
        self_report: pick(['yes', 'yes', 'partly']), effort: between(3, 5),
        hidden_ms: rnd() < 0.15 ? between(35000, 300000) : null,
        rubric_score: primary,
        // A fifth double-scored, agreeing most of the time — the shape the
        // reliability block is meant to report on.
        rubric_score_2: rnd() < 0.2 ? (rnd() < 0.85 ? primary : 'partial') : '',
      });
      latency.push({
        participant_code: code, arm: stage.arm, task_id: t.id, browser: 'chrome',
        modality: stage.arm === 'A' ? 'spoken' : 'typed',
        stt_ms: stage.arm === 'A' ? between(600, 1400) : '',
        rag_ms: between(900, 2600),
        llm_to_token_ms: between(300, 900),
        first_sentence_ms: stage.arm === 'A' ? between(200, 700) : '',
        tts_first_ms: stage.arm === 'A' ? between(500, 1600) : '',
        to_first_audio_ms: stage.arm === 'A' ? between(2600, 7200) : '',
        to_first_token_ms: between(1400, 3600),
        streaming: false,
      });
      turns.push({
        participant_code: code, arm: stage.arm, task_id: t.id, seq: turns.length + 1,
        modality: stage.arm === 'A' ? 'spoken' : 'typed',
        question: `How do I handle ${t.title.toLowerCase()}?`,
        answer: 'Keep a consistent routine, increase lighting in the late afternoon, and '
          + 'reduce stimulation from mid-afternoon. In New Zealand you can call Alzheimers '
          + 'NZ on 0800 004 001, or Healthline on 0800 611 116 for free 24/7 advice.',
        source_ids: 'caregiving_001 wellbeing_001',
      });
    }
    const items = {};
    for (let q = 1; q <= 10; q++) {
      // Arm A rated slightly higher on the positive items.
      items[`q${q}`] = q % 2 === 1 ? between(stage.arm === 'A' ? 3 : 3, 5) : between(1, 3);
    }
    const raw = [];
    for (let q = 1; q <= 10; q++) raw.push(q % 2 === 1 ? items[`q${q}`] - 1 : 5 - items[`q${q}`]);
    sus.push({
      participant_code: code, group, arm: stage.arm, answered: 10,
      sus: raw.reduce((a, b) => a + b, 0) * 2.5,
      trust: between(3, 5), engagement: between(stage.arm === 'A' ? 4 : 2, 5),
      helpfulness: between(3, 5), clarity: between(3, 5),
      // The two secondary constructs, so Table 3b renders in the preview.
      personalisation: between(2, 5), actionability: between(3, 5),
    });
    responses.push({ participant_code: code, group, key: `likert.${stage.arm}.trust`, value: 4 });
  });
}

writeCsv('sessions.csv', Object.keys(sessions[0]), sessions);
writeCsv('tasks.csv', Object.keys(tasks[0]), tasks);
writeCsv('sus.csv', Object.keys(sus[0]), sus);
writeCsv('latency.csv', Object.keys(latency[0]), latency);
writeCsv('turns.csv', Object.keys(turns[0]), turns);
writeCsv('responses.csv', Object.keys(responses[0]), responses);

console.log(`Synthetic export written to ${OUT_DIR}`);
console.log(`${sessions.length} sessions · ${tasks.length} tasks · ${turns.length} turns`);
console.log('NOT REAL DATA, and NOT a check of the export — see the header.');
console.log('Delete docs/study/results/ before any real export.');
