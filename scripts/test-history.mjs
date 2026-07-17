#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

const hasFlag = (name) => args.includes(name);
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const command = (args[0] && !args[0].startsWith('--')) ? args[0] : 'summary';
const filePathArg = getFlag('--file') ?? 'logs/test-history.ndjson';
const limit = Number(getFlag('--limit') ?? '10');

function readRuns(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    console.error(`History file not found: ${resolved}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    console.log(`No history entries found in: ${resolved}`);
    process.exit(0);
  }

  const runs = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSON on line ${index + 1}: ${err.message}`);
    }
  });

  return { runs, resolved };
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function printSummary(runs, maxItems) {
  const take = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 10;
  const items = runs.slice(-take);

  for (const run of items) {
    const label = run.label ?? '-';
    console.log(
      `${run.startedAt} | mode=${run.mode} | passed=${run.passed} failed=${run.failed} | cases=${run.totalCases} | label=${label}`,
    );
  }
}

function printCaseDetails(run) {
  const cases = Array.isArray(run.cases) ? run.cases : [];

  console.log(`Run started: ${run.startedAt}`);
  console.log(`Mode: ${run.mode}`);
  console.log(`Label: ${run.label ?? '-'}`);
  console.log(`Summary: passed=${run.passed} failed=${run.failed} total=${run.totalCases}`);
  console.log('');

  if (cases.length === 0) {
    console.log('No case details in this run.');
    return;
  }

  for (const c of cases) {
    console.log('----------------------------------------------------------------------');
    console.log(`[${String(c.status ?? 'unknown').toUpperCase()}] ${c.id ?? 'unknown-case'}`);
    if (c.question) console.log(`Q: ${c.question}`);
    if (typeof c.retrievedChunks === 'number') console.log(`Retrieved chunks: ${c.retrievedChunks}`);
    if (typeof c.citations === 'number') console.log(`Citations: ${c.citations}`);
    if (typeof c.bestSimilarity === 'number') console.log(`Best similarity: ${c.bestSimilarity}`);

    if (Array.isArray(c.failures) && c.failures.length > 0) {
      console.log('Failures:');
      for (const f of c.failures) console.log(`  - ${f}`);
    }

    if (c.error) {
      console.log(`Error: ${c.error}`);
    }

    if (typeof c.response === 'string') {
      console.log('Response:');
      console.log(c.response);
    }
  }

  if (!run.includeResponsesInLog) {
    console.log('----------------------------------------------------------------------');
    console.log('Responses were not saved for this run. Re-run tests with --log-responses to include full AI text.');
  }
}

function buildRunText(run) {
  const lines = [];
  const sep = '=======================================================================';
  const divider = '-----------------------------------------------------------------------';

  lines.push(sep);
  lines.push(`TEST RUN REPORT`);
  lines.push(sep);
  lines.push(`Started:  ${run.startedAt}`);
  lines.push(`Mode:     ${run.mode}`);
  lines.push(`Label:    ${run.label ?? '-'}`);
  lines.push(`Summary:  passed=${run.passed}  failed=${run.failed}  total=${run.totalCases}`);
  lines.push('');

  const cases = Array.isArray(run.cases) ? run.cases : [];

  if (cases.length === 0) {
    lines.push('No case details in this run.');
  } else {
    for (const c of cases) {
      lines.push(divider);
      lines.push(`[${String(c.status ?? 'unknown').toUpperCase()}] ${c.id ?? 'unknown-case'}`);
      if (c.question) lines.push(`Q: ${c.question}`);
      if (typeof c.retrievedChunks === 'number') lines.push(`Retrieved chunks: ${c.retrievedChunks}`);
      if (typeof c.citations === 'number') lines.push(`Citations: ${c.citations}`);
      if (typeof c.bestSimilarity === 'number') lines.push(`Best similarity: ${c.bestSimilarity}`);

      if (Array.isArray(c.failures) && c.failures.length > 0) {
        lines.push('Failures:');
        for (const f of c.failures) lines.push(`  - ${f}`);
      }

      if (c.error) lines.push(`Error: ${c.error}`);

      if (typeof c.response === 'string') {
        lines.push('Response:');
        lines.push(c.response);
      }
    }

    if (!run.includeResponsesInLog) {
      lines.push(divider);
      lines.push('Responses were not saved for this run. Re-run with --log-responses to include full AI text.');
    }
  }

  lines.push(sep);
  return lines.join('\n');
}

function exportRun(run, outPath) {
  const text = buildRunText(run);
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, text, 'utf8');
  console.log(`Exported to: ${resolved}`);
}

function exportAll(runs, outPath) {
  const parts = runs.map(buildRunText);
  const text = parts.join('\n\n');
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, text, 'utf8');
  console.log(`Exported ${runs.length} run(s) to: ${resolved}`);
}

function defaultExportPath(suffix = '') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `logs/exports/export-${ts}${suffix}.txt`;
}

function printUsage() {
  console.log('Usage: node scripts/test-history.mjs <summary|latest|full|failures|export|export-all> [options]');
  console.log('  summary     Show compact summary lines for recent runs (default)');
  console.log('  latest      Pretty-print the latest run JSON');
  console.log('  full        Human-readable full details for the latest run (all cases)');
  console.log('  failures    Show only failed/error cases from the latest run');
  console.log('  export      Write the latest run as a formatted .txt report');
  console.log('  export-all  Write every run in the history file to a single .txt report');
  console.log('');
  console.log('Options:');
  console.log('  --file <path>   History file (default: logs/test-history.ndjson)');
  console.log('  --out <path>    Output file for export commands (auto-named if omitted)');
  console.log('  --limit <n>     Number of runs shown in summary (default: 10)');
}

function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printUsage();
    return;
  }

  const { runs, resolved } = readRuns(filePathArg);

  if (command === 'summary') {
    console.log(`History: ${resolved}`);
    printSummary(runs, limit);
    return;
  }

  const latest = runs[runs.length - 1];

  if (command === 'latest') {
    printJson(latest);
    return;
  }

  if (command === 'full') {
    printCaseDetails(latest);
    return;
  }

  if (command === 'failures') {
    const failedCases = Array.isArray(latest.cases)
      ? latest.cases.filter(c => c.status === 'fail' || c.status === 'error')
      : [];

    printJson({
      startedAt: latest.startedAt,
      mode: latest.mode,
      label: latest.label ?? null,
      passed: latest.passed,
      failed: latest.failed,
      failedCases,
    });
    return;
  }

  if (command === 'export') {
    const outPath = getFlag('--out') ?? defaultExportPath();
    exportRun(latest, outPath);
    return;
  }

  if (command === 'export-all') {
    const outPath = getFlag('--out') ?? defaultExportPath('-all');
    exportAll(runs, outPath);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

main();
