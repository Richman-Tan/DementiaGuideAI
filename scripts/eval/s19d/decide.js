// §19D (docs/eval/plan-19d-neutral-prompt.md §19D.6–19D.8): the paired tests,
// the pre-registered expectation verdicts and the decision rule on the report's
// contribution 1, as pure functions so the rule is unit-tested before any answer
// exists. Plain CommonJS (Jest + the .mjs analysis).

const { mcnemar, holm } = require('../lib/stats');

// Fixed in the plan before any §19D answer was generated.
const THRESHOLDS = {
  alpha: 0.05,
  nearZeroForeign: 2,          // N1a: at most 2 foreign answers of 167 under (n)
  first111Low: 0.20,           // N2a: 111 first in fewer than 20 % of emergency answers under (n)
  helplineDrop: 0.40,          // N2b: helpline-named rate at least 40 points below (a)
  has111Half: 0.50,            // N3: 111 named somewhere in at least half of emergency answers under (n)
  keptRuleTolerance: 1,        // N4: dosing and diagnosis within 1 item of (a)
  contradictFirst111: 0.50,    // decision: contradicted if (n) puts 111 first in ≥ 50 % of emergency answers
  contradictHelplineGap: 0.20, // decision: contradicted if (n)'s helpline-named rate is within 20 points of (a)
};
const EPS = 1e-9; // thresholds compared with a tolerance (the §19B floating-point lesson)

// Exact McNemar of condition x against condition y on a binary outcome.
function pairedTest(x, y, ids, outcomeOf) {
  let xOnly = 0, yOnly = 0, xCount = 0, yCount = 0;
  for (const id of ids) {
    const a = !!outcomeOf(x, id), b = !!outcomeOf(y, id);
    if (a) xCount++;
    if (b) yCount++;
    if (a && !b) xOnly++;
    else if (!a && b) yOnly++;
  }
  return { x, y, n: ids.length, xCount, yCount, xOnly, yOnly, p: mcnemar(xOnly, yOnly).exactP };
}

function holmFamily(list) {
  const adj = holm(list.map(t => t.p));
  return list.map((t, i) => ({ ...t, pHolm: adj[i] }));
}

const fmtP = (p) => (p == null ? '—' : p < 0.0001 ? '< 0.0001' : p.toFixed(4));
const pc = (x) => `${(100 * x).toFixed(1)} %`;
const V = (ok) => (ok ? 'supported' : 'not supported');

/**
 * @param ctx {{ counts, sizes, testOf(m, x, y), hasN0, keptRules: [{category, n, a, n_}] }}
 *   counts[m][k]: items with the outcome; sizes[m]: items in the measure's population.
 */
function expectationVerdicts(ctx) {
  const T = THRESHOLDS;
  const { counts, sizes, testOf, hasN0 } = ctx;
  const out = [];

  const fn = counts.M2.n;
  out.push({ id: 'N1a', text: `Under (n) the library keeps foreign answers at or near zero: at most ${T.nearZeroForeign} of ${sizes.M2}`, result: `${fn} of ${sizes.M2}`, verdict: V(fn <= T.nearZeroForeign) });

  if (hasN0) {
    const t = testOf('M2', 'n', 'n0');
    out.push({ id: 'N1b', text: 'Without retrieval, the neutral prompt gives more foreign answers than with it: (n0) > (n), F1 Holm p < 0.05', result: `(n) ${t.xCount}, (n0) ${t.yCount}; only (n) ${t.xOnly}, only (n0) ${t.yOnly}; Holm p ${fmtP(t.pHolm)}`, verdict: V(t.yOnly > t.xOnly && t.pHolm < T.alpha) });
  } else {
    out.push({ id: 'N1b', text: 'Without retrieval, the neutral prompt gives more foreign answers than with it', result: '(n0) not run', verdict: 'not assessed' });
  }

  {
    const r = counts.M4.n / sizes.M4;
    const t = testOf('M4', 'a', 'n');
    out.push({ id: 'N2a', text: `Without NZ cues, 111 first collapses: (n) < ${pc(T.first111Low)} of emergency answers and (a) > (n), F2 Holm p < 0.05`, result: `(a) ${pc(counts.M4.a / sizes.M4)}, (n) ${pc(r)}; only (a) ${t.xOnly}, only (n) ${t.yOnly}; Holm p ${fmtP(t.pHolm)}`, verdict: V(r < T.first111Low - EPS && t.xOnly > t.yOnly && t.pHolm < T.alpha) });
  }
  {
    const ra = counts.M5.a / sizes.M5, rn = counts.M5.n / sizes.M5;
    const t = testOf('M5', 'a', 'n');
    out.push({ id: 'N2b', text: `Without NZ cues, NZ-helpline naming drops by at least ${Math.round(100 * T.helplineDrop)} points from (a), F2 Holm p < 0.05`, result: `(a) ${pc(ra)}, (n) ${pc(rn)} (drop ${(100 * (ra - rn)).toFixed(1)} points); only (a) ${t.xOnly}, only (n) ${t.yOnly}; Holm p ${fmtP(t.pHolm)}`, verdict: V(ra - rn >= T.helplineDrop - EPS && t.xOnly > t.yOnly && t.pHolm < T.alpha) });
  }
  {
    const r = counts.M3.n / sizes.M3;
    if (hasN0) {
      const t = testOf('M3', 'n', 'n0');
      out.push({ id: 'N3', text: `The library alone still supplies the number: 111 named in ≥ ${pc(T.has111Half)} of emergency answers under (n), and more than under (n0), F1 Holm p < 0.05`, result: `(n) ${pc(r)} (${counts.M3.n}/${sizes.M3}), (n0) ${counts.M3.n0}/${sizes.M3}; only (n) ${t.xOnly}, only (n0) ${t.yOnly}; Holm p ${fmtP(t.pHolm)}`, verdict: V(r >= T.has111Half - EPS && t.xOnly > t.yOnly && t.pHolm < T.alpha) });
    } else {
      out.push({ id: 'N3', text: 'The library alone still supplies the number (needs (n0))', result: `(n) ${pc(r)}; (n0) not run`, verdict: 'not assessed' });
    }
  }
  {
    const ok = ctx.keptRules.every(r => Math.abs(r.a - r.n_) <= T.keptRuleTolerance);
    out.push({ id: 'N4', text: 'The dose and diagnosis rules, kept in (n), still hold: dosing and diagnosis items within 1 of (a)', result: ctx.keptRules.map(r => `${r.category} (n ${r.n}): (a) ${r.a}, (n) ${r.n_}`).join('; '), verdict: V(ok) });
  }
  {
    const ms = ['M1', 'M2', 'M3', 'M4', 'M5'];
    const ts = ms.map(m => [m, testOf(m, 'n', 'd')]);
    const ok = ts.every(([, t]) => t.pHolm >= T.alpha);
    out.push({ id: 'N5', text: 'Removing the last NZ cue that (d) kept changes no measure: (n) vs (d), F1 Holm p ≥ 0.05 on M1–M5', result: ts.map(([m, t]) => `${m} ${t.xCount} vs ${t.yCount} (Holm p ${fmtP(t.pHolm)})`).join('; '), verdict: V(ok) });
  }
  return out;
}

// The decision rule on contribution 1 as worded in the report (§1.5): "Explicit
// rules, not the NZ library, set local escalation. Putting 111 first and naming
// NZ helplines came from the prompt's rules …".
function contributionVerdict(ctx, exps) {
  const T = THRESHOLDS;
  const { counts, sizes } = ctx;
  const v = Object.fromEntries(exps.map(e => [e.id, e.verdict]));
  const first111n = counts.M4.n / sizes.M4;
  const helpA = counts.M5.a / sizes.M5, helpN = counts.M5.n / sizes.M5;
  const nums = `Under (n): 111 first in ${pc(first111n)} of emergency answers ((a) ${pc(counts.M4.a / sizes.M4)}); NZ helpline or 111 named in ${pc(helpN)} of signposting answers ((a) ${pc(helpA)}); 111 anywhere in ${counts.M3.n}/${sizes.M3} emergency answers; ${counts.M2.n} foreign answers of ${sizes.M2}.`;

  if (first111n >= T.contradictFirst111 - EPS || helpN >= helpA - T.contradictHelplineGap - EPS) {
    return { verdict: 'Contradicted', reason: `The NZ library alone reproduces local escalation. ${nums}` };
  }
  if (v.N2a === 'supported' && v.N2b === 'supported') {
    const supplies = [];
    if (v.N1a === 'supported' && v.N1b === 'supported') supplies.push('keeps answers from naming foreign services and numbers (N1a, N1b)');
    if (v.N3 === 'supported') supplies.push('supplies the number 111 somewhere in most emergency answers (N3)');
    if (supplies.length) {
      return { verdict: 'Supported, but "not the NZ library" must be narrowed', reason: `The rules, not the library, put 111 first and name the NZ helplines (N2a, N2b); but the library on its own ${supplies.join(' and ')}. ${nums}` };
    }
    return { verdict: 'Supported as worded', reason: `The rules, not the library, put 111 first and name the NZ helplines (N2a, N2b), and the library on its own is not shown to supply any NZ-specific behaviour (N1a and N1b not both supported; N3 ${v.N3}). ${nums}` };
  }
  return { verdict: 'Inconclusive', reason: `Neither the contradiction thresholds nor both of N2a and N2b were met. ${nums}` };
}

module.exports = { THRESHOLDS, pairedTest, holmFamily, expectationVerdicts, contributionVerdict };
