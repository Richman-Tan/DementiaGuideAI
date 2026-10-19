// §19J post hoc (not pre-specified): paired bootstrap (10,000 resamples over turns, seed 42) of the
// per-turn differences between conditions in the gpt-4o sampled runs.
//   node scripts/eval/s19j/bootstrap-ci.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../lib.mjs';
const require = createRequire(join(ROOT, 'scripts/eval/x.js'));
const { QUESTIONS } = require('./questions.js');
const { HELDOUT_QUESTIONS } = require('./questions.heldout.js');
const { PERTURBED_QUESTIONS: TURNS } = require('./questions.perturbed-s19j.js');
const { checkRow, expects111First } = require('./lib/checks.js');
const { mulberry32 } = require('./lib/stats.js');
const ALLOW = JSON.parse(readFileSync(join(ROOT, 'scripts/eval/fixtures/phone-allowlist.json'), 'utf8')).numbers;
const CHECKBACK = /did you (mean|say)|do you mean|just to (check|confirm|make sure)|could you (confirm|clarify)|(want|wanted) to (make sure|check) I (understand|understood|got)|if I('ve| have) understood|it sounds like you('re| are) (asking|saying)|I think you('re| are) asking|I think you mean/i;
const src = Object.fromEntries([...QUESTIONS, ...HELDOUT_QUESTIONS].map(q => [q.id, q]));
const load = (c) => JSON.parse(readFileSync(join(ROOT, `docs/report/eval/safety/generation_a7a1abc_${c}_s19j-sampled.json`), 'utf8')).rows;
const per = {};
for (const [k, c] of [['a', 'v2'], ['k', 'v2-checkback'], ['e', 'v2-escalate-checkback']]) {
  const rows = load(c); per[k] = {};
  for (const t of TURNS) {
    const rs = rows.filter(r => r.id === t.id);
    per[k][t.id] = { first: rs.filter(r => checkRow(src[t.sourceId], r, { region: 'NZ', phoneAllowlist: ALLOW }).flags.first111).length / 3, check: rs.filter(r => CHECKBACK.test(r.answer ?? '')).length / 3 };
  }
}
const E = TURNS.filter(t => expects111First(src[t.sourceId])).map(t => t.id), P = TURNS.map(t => t.id);
function boot(x, y, ids, m, B = 10000) {
  const d = ids.map(id => per[y][id][m] - per[x][id][m]); const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const rnd = mulberry32(42); const bs = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[Math.floor(rnd() * d.length)]; bs.push(s / d.length); }
  bs.sort((u, v) => u - v); return [mean, bs[Math.floor(0.025 * B)], bs[Math.floor(0.975 * B) - 1]].map(v => (100 * v).toFixed(1));
}
console.log('111 first, e - a (points, 95% CI over 82 turns):', boot('a', 'e', E, 'first'));
console.log('111 first, e - k:', boot('k', 'e', E, 'first'));
console.log('111 first, k - a:', boot('a', 'k', E, 'first'));
console.log('check back, e - a (over 307 turns):', boot('a', 'e', P, 'check'));

// Part B models (one answer per turn): paired bootstrap over the 82 emergency turns.
for (const m of ['gpt-4.1', 'claude-sonnet-5-5']) {
  const L = (c) => Object.fromEntries(JSON.parse(readFileSync(join(ROOT, `docs/report/eval/safety/generation_a7a1abc_${c}_${m}_s19j.json`), 'utf8')).rows.map(r => [r.id, r]));
  const a = L('v2'), e = L('v2-escalate-checkback');
  const f = (row, t) => (checkRow(src[t.sourceId], row, { region: 'NZ', phoneAllowlist: ALLOW }).flags.first111 ? 1 : 0);
  const d = TURNS.filter(t => expects111First(src[t.sourceId])).map(t => f(e[t.id], t) - f(a[t.id], t));
  const mean = d.reduce((s, v) => s + v, 0) / d.length; const rnd = mulberry32(42); const bs = [];
  for (let b = 0; b < 10000; b++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[Math.floor(rnd() * d.length)]; bs.push(s / d.length); }
  bs.sort((x, y) => x - y);
  console.log(`${m}: 111 first, e - a (points, 95% CI over 82 turns):`, [(100 * mean).toFixed(1), (100 * bs[250]).toFixed(1), (100 * bs[9749]).toFixed(1)]);
}
