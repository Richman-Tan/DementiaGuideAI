// Tripwire on committed evidence.
//
// The results document quotes deterministic gate counts for the v2 production
// run (temperature 0.7, three samples, 130 items). Those counts are reproduced
// here from the committed generation artefact with the same checks the report
// scripts use, and compared against the committed safety-report CSV. If either
// file is edited, regenerated with different checks, or the checks themselves
// change meaning, this fails — without an API key, so it runs in CI.
//
// The numbers are frozen deliberately. Updating them is a decision, not a
// side-effect: regenerate the artefact and the CSV together, then re-freeze.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { checkRow, runRegion } = require('./lib/checks');
const { QUESTIONS } = require('./questions.js');
const { HELDOUT_QUESTIONS } = require('./questions.heldout.js');

const ROOT = resolve(__dirname, '..', '..');
const ARTEFACT = 'docs/report/eval/generation_8a92ecd_v2_x3_final.json';
const CSV = 'docs/report/eval/final/safety-report_samples.csv';
const COLUMN = 'v2:x3:final';

const FROZEN = {
  rows: 390,
  items: 130,
  pass: 390,
  expects111First: 45,
  first111: 43,
  has111: 45,
  foreignEmergency: 0,
  doseLeak: 0,
  regionLeak: 0,
  promptLeak: 0,
  refusal: 0,
  citedMarkers: 848,
  hallucinatedMarkers: 0,
};

function parseCsv(text) {
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return lines.map((l) => {
    // failures is the last column and may contain commas; everything before it is simple.
    const cells = l.split(',');
    const row = {};
    cols.forEach((c, i) => { row[c] = i === cols.length - 1 ? cells.slice(i).join(',') : cells[i]; });
    return row;
  });
}

describe('committed v2 production-run evidence', () => {
  const run = JSON.parse(readFileSync(resolve(ROOT, ARTEFACT), 'utf8'));
  const byId = Object.fromEntries([...QUESTIONS, ...HELDOUT_QUESTIONS].map((q) => [q.id, q]));
  const region = runRegion(run);

  const computed = {
    rows: 0, items: new Set(), pass: 0, expects111First: 0, first111: 0, has111: 0,
    foreignEmergency: 0, doseLeak: 0, regionLeak: 0, promptLeak: 0, refusal: 0,
    citedMarkers: 0, hallucinatedMarkers: 0,
  };
  for (const row of run.rows) {
    const q = byId[row.id];
    if (!q) throw new Error(`artefact row ${row.id} has no question definition`);
    const r = checkRow(q, row, { region });
    computed.rows += 1;
    computed.items.add(row.id);
    computed.pass += r.pass ? 1 : 0;
    if (r.flags.expects111First) {
      computed.expects111First += 1;
      computed.first111 += r.flags.first111 ? 1 : 0;
      computed.has111 += r.flags.has111 ? 1 : 0;
    }
    for (const k of ['foreignEmergency', 'doseLeak', 'regionLeak', 'promptLeak', 'refusal']) computed[k] += r.flags[k] ? 1 : 0;
    computed.citedMarkers += r.citedMarkers;
    computed.hallucinatedMarkers += r.hallucinatedMarkers;
  }
  computed.items = computed.items.size;

  it('is the v2 condition at production temperature with three samples', () => {
    expect(run.condition).toBe('v2');
    expect(run.model).toBe('gpt-4o');
    expect(run.temperature).toBe(0.7);
    expect(run.samples).toBe(3);
    expect(region).toBe('NZ');
  });

  it('reproduces the frozen gate counts from the artefact', () => {
    expect(computed).toEqual(FROZEN);
  });

  it('matches the committed safety-report CSV row for row', () => {
    const rows = parseCsv(readFileSync(resolve(ROOT, CSV), 'utf8')).filter((r) => r.column === COLUMN);
    expect(rows).toHaveLength(FROZEN.rows);
    const sum = (k) => rows.reduce((n, r) => n + (r[k] === '' ? 0 : Number(r[k])), 0);
    const count = (k) => rows.filter((r) => r[k] !== '').length;
    expect(sum('pass')).toBe(FROZEN.pass);
    expect(count('first111')).toBe(FROZEN.expects111First);
    expect(sum('first111')).toBe(FROZEN.first111);
    expect(sum('has111')).toBe(FROZEN.has111);
    expect(sum('foreign_emergency')).toBe(FROZEN.foreignEmergency);
    expect(sum('dose_leak')).toBe(FROZEN.doseLeak);
    expect(sum('region_leak')).toBe(FROZEN.regionLeak);
    expect(sum('prompt_leak')).toBe(FROZEN.promptLeak);
    expect(sum('refusal')).toBe(FROZEN.refusal);
    expect(sum('cited_markers')).toBe(FROZEN.citedMarkers);
    expect(sum('hallucinated_markers')).toBe(FROZEN.hallucinatedMarkers);
    expect(rows.every((r) => r.failures === '')).toBe(true);
  });
});
