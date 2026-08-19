// Shared plumbing for the study scripts: env, PostgREST access to the study
// tables, CSV writing, and the small-n summary statistics.
//
// Direct fetch against PostgREST rather than supabase-js, matching
// scripts/eval/lib.mjs — supabase-js crashes under Node 20 without a ws polyfill.
//
// These tables are readable only with the SERVICE ROLE key by design: the
// anonymous key the web client ships must not reach study data
// (docs/study/ethics/data-management-plan.md §4).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '../..');
export const OUT_DIR = resolve(ROOT, 'docs/study/results');

function loadDotEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };

const SUPABASE_URL = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

export function requireServiceKey() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      'ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (export them or add to .env).\n'
      + 'The study tables deny the anonymous key on purpose — see\n'
      + 'docs/study/ethics/data-management-plan.md §4.'
    );
    process.exit(1);
  }
}

const PAGE = 1000;

export async function selectAll(table, query = '') {
  // Paginate. PostgREST caps rows per response, and a truncated 200 looks
  // identical to a complete one — with a global seq ordering that would drop the
  // last events of every session, which is where the questionnaire snapshots are.
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${query ? `&${query}` : ''}`;
    const r = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Range: `${offset}-${offset + PAGE - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${await r.text().catch(() => '')}`);
    const page = await r.json();
    out.push(...page);

    const total = Number(String(r.headers.get('content-range') || '').split('/')[1]);
    if (page.length < PAGE) {
      if (Number.isFinite(total) && out.length < total) {
        throw new Error(
          `${table}: fetched ${out.length} of ${total} rows — export would be incomplete`
        );
      }
      return out;
    }
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

export function ensureOutDir() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
}

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function writeCsv(name, columns, rows) {
  ensureOutDir();
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

export function writeText(name, body) {
  ensureOutDir();
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  return path;
}

// ─── Small-n statistics ──────────────────────────────────────────────────────
// Counts and medians only. The reporting rule inherited from
// docs/rag/rag-evaluation-plan.md is that percentages are not used below n = 20,
// so nothing here computes one.

export function median(xs) {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function range(xs) {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? [s[0], s[s.length - 1]] : [null, null];
}

export function counts(xs) {
  const out = {};
  for (const x of xs) out[x] = (out[x] || 0) + 1;
  return out;
}

/**
 * Standard SUS scoring: odd items (response − 1), even items (5 − response),
 * summed and multiplied by 2.5 for a 0–100 score.
 *
 * Returns null on an incomplete instrument rather than scoring a partial one —
 * a SUS computed from six of ten answers is not a SUS, and silently treating it
 * as one would understate or overstate a participant with no trace in the data.
 */
export function susScore(responsesByItem) {
  const vals = [];
  for (let i = 1; i <= 10; i++) {
    const v = responsesByItem[`q${i}`];
    if (typeof v !== 'number' || v < 1 || v > 5) return null;
    vals.push(i % 2 === 1 ? v - 1 : 5 - v);
  }
  return vals.reduce((a, b) => a + b, 0) * 2.5;
}

/**
 * Inter-rater agreement over a set of [rater1, rater2] label pairs.
 *
 * The primary effectiveness measure is a hand-scored rubric, so a single rater
 * makes "complete vs partial" an assertion by the person with the most to gain
 * from it. Double-scoring even a fifth of the tasks turns it into a measurement
 * that can be reported with a number attached.
 *
 * Returns raw agreement and Cohen's kappa. Kappa is null when it is undefined
 * rather than zero: with both raters using a single label, expected agreement is
 * 1 and the statistic divides by zero — which is a real situation here, since
 * "every task the second rater looked at was complete" is a plausible outcome at
 * this n, and reporting it as κ = 0 would say the raters agreed no better than
 * chance when in fact they agreed on everything.
 */
export function interRater(pairs) {
  const clean = pairs.filter(([a, b]) => a && b);
  const n = clean.length;
  if (!n) return { n: 0, agreed: 0, agreement: null, kappa: null };

  const agreed = clean.filter(([a, b]) => a === b).length;
  const observed = agreed / n;

  const labels = [...new Set(clean.flat())];
  let expected = 0;
  for (const label of labels) {
    const p1 = clean.filter(([a]) => a === label).length / n;
    const p2 = clean.filter(([, b]) => b === label).length / n;
    expected += p1 * p2;
  }

  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);
  return { n, agreed, agreement: observed, kappa };
}

export const fmt = (v, digits = 0) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(digits);
