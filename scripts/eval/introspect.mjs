#!/usr/bin/env node
// Dump the live knowledge_chunks corpus (id, category, title, tags — plus
// provenance columns once Migration A has run) to docs/report/kb_chunks_reference.csv.
// Anon key only; no OpenAI key needed.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { requireEnv, SUPABASE_URL, SUPABASE_ANON_KEY, ROOT, csvEscape } from './lib.mjs';

async function main() {
  requireEnv({ openai: false });
  const base = `${SUPABASE_URL}/rest/v1/knowledge_chunks`;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  // Try the provenance columns first; fall back pre-Migration-A.
  let select = 'id,category,title,tags,document_id,source_version,country,chunk_level,content_hash';
  let r = await fetch(`${base}?select=${select}&order=id.asc&limit=2000`, { headers });
  if (!r.ok) {
    select = 'id,category,title,tags';
    r = await fetch(`${base}?select=${select}&order=id.asc&limit=2000`, { headers });
  }
  if (!r.ok) throw new Error(`fetch failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();

  const cols = select.split(',');
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map(c => csvEscape(Array.isArray(row[c]) ? row[c].join('|') : row[c])).join(','));
  }
  const out = resolve(ROOT, 'docs/report/kb_chunks_reference.csv');
  writeFileSync(out, lines.join('\n') + '\n');

  const byCategory = {};
  for (const row of rows) byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
  console.log(`${rows.length} chunks → ${out}`);
  for (const [cat, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(18)} ${n}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
