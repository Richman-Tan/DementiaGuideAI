// Multi-sample aggregation of deterministic checks over generation runs.
// Plain CommonJS so the report scripts and Jest share it.
//
// A "column" is one generation run (condition × retrieval mode). Each question
// id may have several samples; an item is a ROBUST pass only when every sample
// passes — the strict reading a safety claim needs. Sample-level rates are
// reported alongside for the production-temperature view.

const { checkRow, runRegion } = require('./checks');
const { wilson, mcnemar } = require('./stats');

function columnKey(run) {
  const parts = [run.condition ?? run.promptVersion ?? 'unknown'];
  if (run.retrievalMode && run.retrievalMode !== 'production') parts.push(run.retrievalMode);
  if (run.samples > 1) parts.push(`x${run.samples}`);
  if (run.tag) parts.push(run.tag);
  return parts.join(':');
}

/**
 * @param {object} run            parsed generation JSON
 * @param {Map|object} questionsById
 * @param {object} opts           { phoneAllowlist?: string[] }
 * @returns {{ key, region, items: Map<id, item>, rows: [] }}
 */
function aggregateRun(run, questionsById, { phoneAllowlist = null } = {}) {
  const region = runRegion(run);
  const items = new Map();
  const rows = [];
  for (const row of run.rows) {
    const q = questionsById[row.id];
    if (!q) continue;
    const r = checkRow(q, row, { region, phoneAllowlist });
    const entry = items.get(row.id) ?? { id: row.id, set: q.set, category: q.category, heldout: !!q.heldout, samples: [], expects111First: r.flags.expects111First };
    entry.samples.push({ sample: row.sample ?? 0, pass: r.pass, failures: r.failures, flags: r.flags, citedMarkers: r.citedMarkers, hallucinatedMarkers: r.hallucinatedMarkers });
    items.set(row.id, entry);
    rows.push({ id: row.id, sample: row.sample ?? 0, set: q.set, category: q.category, pass: r.pass, failures: r.failures, flags: r.flags, citedMarkers: r.citedMarkers, hallucinatedMarkers: r.hallucinatedMarkers });
  }
  for (const item of items.values()) {
    item.robustPass = item.samples.every(s => s.pass);
    item.anyPass = item.samples.some(s => s.pass);
    item.samplePassCount = item.samples.filter(s => s.pass).length;
  }
  return { key: columnKey(run), condition: run.condition ?? run.promptVersion, retrievalMode: run.retrievalMode ?? 'production', region, samples: run.samples ?? 1, items, rows };
}

// Pass-rate table for one column, grouped by a key function (set or category).
function rateTable(column, groupOf) {
  const groups = {};
  for (const item of column.items.values()) {
    const g = groupOf(item);
    groups[g] ??= { items: 0, robustPass: 0, samples: 0, samplePass: 0 };
    groups[g].items += 1;
    groups[g].robustPass += item.robustPass ? 1 : 0;
    groups[g].samples += item.samples.length;
    groups[g].samplePass += item.samplePassCount;
  }
  const out = {};
  for (const [g, v] of Object.entries(groups)) {
    out[g] = { ...v, robust: wilson(v.robustPass, v.items), sampleRate: wilson(v.samplePass, v.samples) };
  }
  return out;
}

// Flag rates over samples (denominators differ per flag: 111-first is over
// items that expect it; refusal over in-scope items; the rest over everything).
function flagRates(column) {
  const rows = column.rows;
  const rate = (subset, pred) => wilson(subset.filter(pred).length, subset.length);
  const inScope = rows.filter(r => r.set === 'A' || r.set === 'A-neighbour');
  const expects111 = rows.filter(r => r.flags.expects111First);
  const totalMarkers = rows.reduce((s, r) => s + r.citedMarkers, 0);
  const hallucinated = rows.reduce((s, r) => s + r.hallucinatedMarkers, 0);
  const withPhones = rows.filter(r => Array.isArray(r.flags.phonesFound));
  return {
    first111: rate(expects111, r => r.flags.first111),
    has111: rate(expects111, r => r.flags.has111),
    foreignEmergency: rate(rows, r => r.flags.foreignEmergency),
    doseLeak: rate(rows, r => r.flags.doseLeak),
    regionLeak: rate(rows, r => r.flags.regionLeak),
    promptLeak: rate(rows, r => r.flags.promptLeak),
    refusalInScope: rate(inScope, r => r.flags.refusal),
    empty: rate(rows, r => r.flags.empty),
    unknownPhones: withPhones.length ? rate(withPhones, r => r.flags.unknownPhones.length > 0) : null,
    citationPrecision: totalMarkers ? { p: (totalMarkers - hallucinated) / totalMarkers, k: totalMarkers - hallucinated, n: totalMarkers } : null,
  };
}

// Paired comparison of two columns on item robust-pass (McNemar on discordant items).
function compareColumns(a, b) {
  const ids = [...a.items.keys()].filter(id => b.items.has(id));
  let passA_failB = 0, failA_passB = 0, both = 0, neither = 0;
  const discordant = [];
  for (const id of ids) {
    const pa = a.items.get(id).robustPass;
    const pb = b.items.get(id).robustPass;
    if (pa && pb) both += 1;
    else if (!pa && !pb) neither += 1;
    else if (pa && !pb) { passA_failB += 1; discordant.push({ id, passIn: a.key }); }
    else { failA_passB += 1; discordant.push({ id, passIn: b.key }); }
  }
  return { a: a.key, b: b.key, n: ids.length, both, neither, passA_failB, failA_passB, mcnemar: mcnemar(passA_failB, failA_passB), discordant };
}

// Two runs of the same condition (e.g. the 36-item safety run and the 32-item
// in-scope run of July) collide on columnKey; suffix the file name so tables
// stay readable. Mutates `key` in place and returns the columns.
function uniqueKeys(columns) {
  const seen = {};
  for (const c of columns) seen[c.key] = (seen[c.key] ?? 0) + 1;
  for (const c of columns) if (seen[c.key] > 1 && c.file) c.key = `${c.key}@${c.file.replace(/^.*\//, '').replace(/^generation_/, '').replace(/\.json$/, '')}`;
  return columns;
}

module.exports = { columnKey, aggregateRun, rateTable, flagRates, compareColumns, uniqueKeys };
