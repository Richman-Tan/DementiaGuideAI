#!/usr/bin/env node
// §19A step 2 (docs/eval/plan-19a-safety.md §19A.3): ask claude-opus-5-5 to
// write the new held-out safety items, one call per category, with the fixed
// brief in scripts/eval/s19a/brief.md, through the existing Anthropic adapter
// (scripts/eval/lib/judgeClient.mjs). Every attempt — reply text, served model,
// stop reason, usage — is written verbatim to the raw file; nothing is edited.
//
// Retry rule (pre-registered): a refusal (after the server-side fallback), a
// truncated reply (stop_reason max_tokens) or a reply that does not parse as
// {"items":[…]} is retried ONCE with the identical request. A category that
// still fails is reported as unfilled; no item is ever written by hand.
//
// Usage:
//   node scripts/eval/s19a/write-items.mjs --dry-run              # prompts + cost estimate, no API call
//   node scripts/eval/s19a/write-items.mjs --out docs/report/eval/safety/s19a_writer-raw.json
//   node scripts/eval/s19a/write-items.mjs --categories emergency --n 3 --out …topup.json   # top-up (plan §19A.4)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { ROOT, gitSha, ANTHROPIC_API_KEY } from '../lib.mjs';
import { judgeCall } from '../lib/judgeClient.mjs';

const require = createRequire(import.meta.url);
const { CATEGORIES, CATEGORY_BY_ID } = require('./categories.js');
const { WRITER_MODEL, WRITER_EFFORT, WRITER_MAX_TOKENS, parseBrief, fillTemplate, parseWriterText } = require('./lib.js');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const DRY = has('--dry-run');
const OUT = argVal('--out') ?? 'docs/report/eval/safety/s19a_writer-raw.json';
const ONLY = argVal('--categories')?.split(',') ?? null;
const N_OVERRIDE = argVal('--n') ? Number(argVal('--n')) : null;
const PRICE = { input: 4, output: 20 }; // US$ per 1M tokens, claude-opus-5-5 list price (read 2026-10-09)

const BRIEF_PATH = resolve(ROOT, 'scripts/eval/s19a/brief.md');
const briefText = readFileSync(BRIEF_PATH, 'utf8');
const briefSha256 = createHash('sha256').update(briefText).digest('hex');
const { system, userTemplate } = parseBrief(briefText);

const cats = (ONLY ?? CATEGORIES.map(c => c.id)).map(id => {
  if (!CATEGORY_BY_ID[id]) { console.error(`unknown category ${id}`); process.exit(1); }
  return { ...CATEGORY_BY_ID[id], n: N_OVERRIDE ?? CATEGORY_BY_ID[id].target };
});

const costOf = (u) => (((u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0)) * PRICE.input
  + (u?.output_tokens ?? 0) * PRICE.output) / 1e6;

async function main() {
  console.log(`§19A writer — ${WRITER_MODEL}, effort ${WRITER_EFFORT}, max_tokens ${WRITER_MAX_TOKENS}, brief sha256 ${briefSha256.slice(0, 12)}`);
  console.log(`  categories: ${cats.map(c => `${c.id} ×${c.n}`).join(', ')} (total ${cats.reduce((s, c) => s + c.n, 0)})`);
  if (DRY) {
    const sysTok = Math.ceil(system.length / 4);
    const estIn = cats.length * (sysTok + 120);
    const estOut = cats.reduce((s, c) => s + c.n * 110 + 2500, 0); // ~110 tokens per item + thinking allowance
    const worstOut = cats.length * 2 * WRITER_MAX_TOKENS;           // every call retried and maxed out
    console.log(`\nDry run: ${cats.length} calls. System prompt ≈ ${sysTok} tokens.`);
    console.log(`  expected ≈ ${estIn} input + ${estOut} output tokens ≈ US$${((estIn * PRICE.input + estOut * PRICE.output) / 1e6).toFixed(2)}`);
    console.log(`  worst case (every call retried, both at max_tokens) ≈ US$${((2 * estIn * PRICE.input + worstOut * PRICE.output) / 1e6).toFixed(2)}`);
    console.log('\n--- SYSTEM ---\n' + system);
    console.log('\n--- USER (first category) ---\n' + fillTemplate(userTemplate, cats[0].id, cats[0].n));
    return;
  }
  if (!ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

  const outPath = resolve(ROOT, OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  const record = {
    plan: 'docs/eval/plan-19a-safety.md §19A.3',
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    requestedModel: WRITER_MODEL,
    effort: WRITER_EFFORT,
    maxTokens: WRITER_MAX_TOKENS,
    refusalFallback: 'server-side-fallback-2026-07-01, fallbacks "default" (judgeClient.mjs)',
    temperature: 'not settable on this model (API rejects sampling parameters)',
    briefPath: relative(ROOT, BRIEF_PATH),
    briefSha256,
    priceUSDPer1M: PRICE,
    calls: [],
  };
  const save = () => writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');

  for (const c of cats) {
    const user = fillTemplate(userTemplate, c.id, c.n);
    let accepted = false;
    for (let attempt = 1; attempt <= 2 && !accepted; attempt++) {
      const startedAt = new Date().toISOString();
      let res; let error = null;
      try {
        res = await judgeCall(WRITER_MODEL, system, user, { effort: WRITER_EFFORT, maxTokens: WRITER_MAX_TOKENS });
      } catch (e) {
        error = String(e?.message ?? e).slice(0, 500);
      }
      const parsed = res && !res.refused ? parseWriterText(res.text) : { error: res?.refused ? `refused (${res.refusalCategory ?? 'no category'})` : error };
      const truncated = res?.stopReason === 'max_tokens';
      const ok = !!parsed.items && !truncated;
      record.calls.push({
        category: c.id, requested: c.n, attempt, startedAt, finishedAt: new Date().toISOString(),
        user, servedModel: res?.model ?? null, stopReason: res?.stopReason ?? null, refused: !!res?.refused,
        refusalCategory: res?.refusalCategory ?? null, usage: res?.usage ?? null, costUSD: res?.usage ? costOf(res.usage) : 0,
        error: ok ? null : (truncated ? 'truncated at max_tokens' : parsed.error ?? error),
        accepted: ok, returnedItems: parsed.items?.length ?? 0, text: res?.text ?? null,
      });
      save();
      console.log(`  ${c.id.padEnd(19)} attempt ${attempt}: ${ok ? `${parsed.items.length} items` : `FAILED — ${record.calls.at(-1).error}`}  (${res?.model ?? '—'}, ${res?.usage?.output_tokens ?? 0} out tokens, US$${(record.calls.at(-1).costUSD).toFixed(3)})`);
      accepted = ok;
    }
    if (!accepted) console.warn(`  ${c.id}: no usable reply after 2 attempts — reported as unfilled (plan §19A.9)`);
  }
  record.finishedAt = new Date().toISOString();
  record.totalCostUSD = record.calls.reduce((s, x) => s + x.costUSD, 0);
  record.totalUsage = record.calls.reduce((s, x) => ({
    input_tokens: s.input_tokens + (x.usage?.input_tokens ?? 0),
    output_tokens: s.output_tokens + (x.usage?.output_tokens ?? 0),
  }), { input_tokens: 0, output_tokens: 0 });
  save();
  console.log(`\nWrote ${relative(ROOT, outPath)} — ${record.calls.length} calls, ${record.totalUsage.input_tokens} in / ${record.totalUsage.output_tokens} out tokens, US$${record.totalCostUSD.toFixed(3)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
