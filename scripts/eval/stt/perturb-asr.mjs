#!/usr/bin/env node
// §19B P1 (docs/eval/plan-19b-propagation.md): build the transcript variants of
// the typed question sets under the committed recogniser error models
// (build-error-model.mjs), following the app's STT cascade and blank guard.
//
// Conditions per source item:
//   clean  the typed wording (draw 0; the safety items also get draw 1, a
//          replicate that measures generation non-determinism)
//   w1     whisper-1 on dementia speech: the web fallback recogniser and the
//          rescue recogniser on both clients. Empty output → the app's blank
//          guard (no retrieval, no model call).
//   ap     Apple's on-device recogniser (en-NZ) as the live recogniser. Empty
//          live output is rescued by whisper-1 on the same recording, as both
//          clients do (apps/web/src/services/sttWeb.js:197–209,
//          apps/mobile/src/lib/stt/sttService.js:46–61): the rescue transcript
//          is the w1 transcript of the same item and draw (same audio, same
//          recogniser). A rescue that is itself empty → blank guard.
//          The no-rescue view (ap-terminal) is read from the same rows.
// Draws 0..D−1 per perturbed condition, each from its own seeded stream:
//   seed = SEED + 1000·draw + {w1: 1, ap: 2}, items in a fixed order.
//
// Outputs
//   scripts/eval/questions.perturbed-s19b.js   PERTURBED_QUESTIONS — only the turns
//        that reach retrieval and the model (for run-retrieval / run-generation --questions-file)
//   docs/report/eval/stt/propagation-variants_<sha>_s19b.json — every turn, blank-guarded
//        ones included, with its cascade path and achieved word error rate
//
//   node scripts/eval/stt/perturb-asr.mjs --model docs/report/eval/stt/error-model_<sha>_s19b.json [--draws 3] [--seed 42]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

import { ROOT, gitSha } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('../questions.js');
const { HELDOUT_QUESTIONS } = require('../questions.heldout.js');
const { mulberry32 } = require('../lib/stats.js');
const { wer } = require('../lib/wer.js');
const { transcribe, appBlankGuard } = require('./asrModel.js');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const MODEL_PATH = argVal('--model');
if (!MODEL_PATH) { console.error('--model <error-model json> is required'); process.exit(1); }
const DRAWS = Number(argVal('--draws') ?? 3);
const SEED = Number(argVal('--seed') ?? 42);
const OUT_Q = resolve(ROOT, argVal('--out') ?? 'scripts/eval/questions.perturbed-s19b.js');
const sha = gitSha();
const OUT_V = resolve(ROOT, argVal('--variants-out') ?? `docs/report/eval/stt/propagation-variants_${sha}_s19b.json`);

const model = JSON.parse(readFileSync(resolve(ROOT, MODEL_PATH), 'utf8'));
const REC = model.recognisers;

// Samples (plan §19B.1): every labelled retrieval item, and every Set-S safety item (development + held-out).
const retrievalItems = QUESTIONS.filter(q => ((q.relevant ?? []).length || (q.acceptable ?? []).length) && !q.pendingContent);
const safetyItems = [...QUESTIONS.filter(q => q.set === 'S'), ...HELDOUT_QUESTIONS.filter(q => q.set === 'S')];
const items = [...retrievalItems.map(q => ({ q, role: 'retrieval' })), ...safetyItems.map(q => ({ q, role: 'safety' }))];
const vocabulary = items.map(({ q }) => questionText(q, 'v2'));

const achieved = (clean, text) => (appBlankGuard(text) ? 1 : wer(clean, text, { fillers: 'keep' }).wer);

const turns = [];
function push(t) { turns.push({ ...t, blankGuard: appBlankGuard(t.question), achievedWer: Number(achieved(t.cleanQuestion, t.question).toFixed(4)) }); }

for (const { q, role } of items) {
  const clean = questionText(q, 'v2');
  const base = { sourceId: q.id, role, set: q.set, category: q.category, relevant: q.relevant ?? [], acceptable: q.acceptable ?? [], cleanQuestion: clean };
  push({ ...base, id: `${q.id}__clean__d0`, condition: 'clean', draw: 0, question: clean, path: 'typed', phrase: null });
  if (role === 'safety') push({ ...base, id: `${q.id}__clean__d1`, condition: 'clean', draw: 1, question: clean, path: 'typed (replicate)', phrase: null });
}

for (let draw = 0; draw < DRAWS; draw++) {
  const rndW = mulberry32(SEED + 1000 * draw + 1);
  const rndA = mulberry32(SEED + 1000 * draw + 2);
  const w1Text = new Map();
  for (const { q, role } of items) {
    const clean = questionText(q, 'v2');
    const base = { sourceId: q.id, role, set: q.set, category: q.category, relevant: q.relevant ?? [], acceptable: q.acceptable ?? [], cleanQuestion: clean };
    const w = transcribe(clean, REC.w1.model, rndW, { vocabulary });
    w1Text.set(q.id, w);
    push({ ...base, id: `${q.id}__w1__d${draw}`, condition: 'w1', draw, question: w.text, path: w.emptyOutput ? 'whisper-1 empty → blank guard' : 'whisper-1', phrase: w.phrase, emptyOutput: w.emptyOutput });
  }
  for (const { q, role } of items) {
    const clean = questionText(q, 'v2');
    const base = { sourceId: q.id, role, set: q.set, category: q.category, relevant: q.relevant ?? [], acceptable: q.acceptable ?? [], cleanQuestion: clean };
    const a = transcribe(clean, REC.ap.model, rndA, { vocabulary });
    const liveEmpty = a.emptyOutput || appBlankGuard(a.text);
    if (!liveEmpty) {
      push({ ...base, id: `${q.id}__ap__d${draw}`, condition: 'ap', draw, question: a.text, path: 'apple live', phrase: a.phrase, emptyOutput: false, liveEmpty: false, rescued: false });
    } else {
      const w = w1Text.get(q.id);
      push({ ...base, id: `${q.id}__ap__d${draw}`, condition: 'ap', draw, question: w.text, path: w.emptyOutput ? 'apple empty → whisper-1 rescue empty → blank guard' : 'apple empty → whisper-1 rescue', phrase: w.phrase, emptyOutput: true, liveEmpty: true, rescued: !w.emptyOutput });
    }
  }
}

// Question file for the runners: only turns that pass the blank guard.
const forRunners = turns.filter(t => !t.blankGuard).map(t => ({
  id: t.id, sourceId: t.sourceId, condition: t.condition, draw: t.draw, set: t.set, category: t.category,
  relevant: t.relevant, acceptable: t.acceptable, question: t.question, cleanQuestion: t.cleanQuestion,
  achievedWer: t.achievedWer, phrase: t.phrase, path: t.path,
}));
const qHeader = `// GENERATED by scripts/eval/stt/perturb-asr.mjs — do not edit. Plan: docs/eval/plan-19b-propagation.md §19B.1.
// Error model: ${relative(ROOT, resolve(ROOT, MODEL_PATH))} (committed E9 aggregates only). Seed ${SEED}; draws ${DRAWS}.
// ${forRunners.length} turns that pass the app's blank-transcript guard (of ${turns.length}); blank-guarded turns are listed only in
// ${relative(ROOT, OUT_V)}, because the app neither retrieves nor calls the model for them.
`;
writeFileSync(OUT_Q, qHeader + 'const PERTURBED_QUESTIONS = ' + JSON.stringify(forRunners, null, 2) + ';\n\nmodule.exports = { PERTURBED_QUESTIONS };\n');
const qSha = createHash('sha256').update(readFileSync(OUT_Q)).digest('hex');

const summary = {};
for (const cond of ['clean', 'w1', 'ap']) {
  for (const role of ['retrieval', 'safety']) {
    const ts = turns.filter(t => t.condition === cond && t.role === role && (cond !== 'clean' || t.draw === 0));
    const reached = ts.filter(t => !t.blankGuard);
    summary[`${cond}/${role}`] = {
      turns: ts.length,
      blankGuard: ts.length - reached.length,
      liveEmpty: ts.filter(t => t.liveEmpty).length,
      rescued: ts.filter(t => t.rescued).length,
      withPhrase: ts.filter(t => t.phrase).length,
      meanAchievedWerReached: reached.length ? Number((reached.reduce((s, t) => s + t.achievedWer, 0) / reached.length).toFixed(4)) : null,
      meanAchievedWerAll: ts.length ? Number((ts.reduce((s, t) => s + t.achievedWer, 0) / ts.length).toFixed(4)) : null,
    };
  }
}
writeFileSync(OUT_V, JSON.stringify({
  generatedAt: new Date().toISOString(), gitSha: sha, generator: 'scripts/eval/stt/perturb-asr.mjs', plan: 'docs/eval/plan-19b-propagation.md §19B.1',
  errorModel: relative(ROOT, resolve(ROOT, MODEL_PATH)), seed: SEED, draws: DRAWS,
  questionsFile: relative(ROOT, OUT_Q), questionsFileSha256: qSha,
  samples: { retrieval: retrievalItems.map(q => q.id), safety: safetyItems.map(q => q.id) },
  blankGuardRule: "apps/web/src/voice/useVoiceConversation.js:464 and apps/mobile/src/features/voice/hooks/useAvatarConversation.js:599 — (transcript ?? '').trim() empty → no retrieval, no model call",
  summary, turns,
}, null, 2) + '\n');

console.log(`Wrote ${relative(ROOT, OUT_Q)} (${forRunners.length} turns, sha256 ${qSha.slice(0, 12)}) and ${relative(ROOT, OUT_V)} (${turns.length} turns)`);
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(16)} turns ${String(v.turns).padStart(3)}  blank ${String(v.blankGuard).padStart(2)}  live-empty ${String(v.liveEmpty).padStart(2)}  rescued ${String(v.rescued).padStart(2)}  phrase ${String(v.withPhrase).padStart(2)}  WER reached ${(100 * (v.meanAchievedWerReached ?? 0)).toFixed(1)}%  all ${(100 * (v.meanAchievedWerAll ?? 0)).toFixed(1)}%`);
