#!/usr/bin/env node
// Cost of operation (evaluation-plan addendum E12). Deterministic; no network, no keys.
//
// Prices one conversation turn from what the generation artefacts already
// measured — prompt/completion tokens per answer (OpenAI usage fields) and the
// characters the voice path would send to text-to-speech (replayed through the
// production sentence splitter and spoken-text normaliser) — then scales that to
// a session, a user-month and a fleet, adds the fixed platform costs, and prices
// the one-off costs (knowledge-base ingestion, the evaluation itself).
//
//   node scripts/eval/cost-model.mjs [--snapshot 8a92ecd] [--pricing scripts/eval/pricing.2026-09.json]
//        [--turns-per-session 8] [--voice-share 0.5] [--turns-per-day 3] [--days 30]
//        [--whisper-share 0] [--whisper-seconds 8] [--speculative-embeds 1]
//        [--unity-loads-per-user-month 4] [--users 10,100,1000]
//        [--out docs/report/eval/final/cost_<sha>.md] [--dry-run]
//
// Every number in the report traces to an artefact file name or a pricing.json key.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, gitSha } from './lib.mjs';

const require = createRequire(import.meta.url);
const { createMarkerStripper } = require('../../packages/core/rag/citations.js');
const { summary, mean } = require('./lib/stats.js');
const { createSentenceSplitter } = await import('../../packages/core/voice/sentenceTracker.js');
const { normalizeSpokenText } = await import('../../packages/core/tts/normalizeSpokenText.js');

const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const num = (n, d) => Number(argVal(n, d));
const SNAPSHOT = argVal('--snapshot', '8a92ecd');
const PRICING_PATH = argVal('--pricing', 'scripts/eval/pricing.2026-09.json');
const TURNS_PER_SESSION = num('--turns-per-session', 8);
const VOICE_SHARE = num('--voice-share', 0.5);
const TURNS_PER_DAY = num('--turns-per-day', 3);
const DAYS = num('--days', 30);
const WHISPER_SHARE = num('--whisper-share', 0);        // share of spoken turns that hit the Whisper fallback
const WHISPER_SECONDS = num('--whisper-seconds', 8);    // seconds of audio per such turn
const SPEC_EMBEDS = num('--speculative-embeds', 1);     // extra embedding calls per spoken turn (0–2, SPECULATIVE_MAX_FIRES)
const UNITY_LOADS = num('--unity-loads-per-user-month', 4);
const USERS = String(argVal('--users', '10,100,1000')).split(',').map(Number);
const DRY_RUN = args.includes('--dry-run');
const SHA = gitSha();
const OUT = resolve(ROOT, argVal('--out', `docs/report/eval/final/cost_${SHA}.md`));

const P = JSON.parse(readFileSync(resolve(ROOT, PRICING_PATH), 'utf8'));
const EVAL_DIR = resolve(ROOT, 'docs/report/eval');
const UNITY_DATA_GB = 244521190 / 1e9; // apps/web/public/unity/Build/unity.data.unityweb, bytes on disk 2026-09-18

// ── price helpers (USD) ───────────────────────────────────────────────────────
const tok = (model, inTok, outTok) => {
  const m = P.openai[model];
  if (!m) throw new Error(`no price for ${model} in ${PRICING_PATH}`);
  return (inTok * m.input + outTok * m.output) / 1e6;
};
const embedCost = (tokens) => (tokens * P.openai['text-embedding-3-small'].input) / 1e6;
const ttsApi = (chars) => (chars / 1000) * P.elevenlabs.api_per_1k_chars.flash_turbo;
const planCharsIncluded = (plan) => plan.credits / P.elevenlabs.credits_per_char.flash_turbo;
const planRatePer1k = (plan) => (plan.usd_per_month / planCharsIncluded(plan)) * 1000;
const PLAN_NAME = 'creator'; // user-stated 2026-09-18: ElevenLabs Starter/Creator; Creator is the cheaper-per-character of the two
const PLAN = P.elevenlabs.plans[PLAN_NAME];
const ttsPlan = (chars) => (chars / 1000) * planRatePer1k(PLAN);
const whisperCost = (seconds) => (seconds / 60) * P.openai['whisper-1'].price;
const openaiTts = (chars) => (chars / 1e6) * P.openai['tts-1'].price;
const usd = (x, d = 4) => `$${x.toFixed(d)}`;
const usd2 = (x) => `$${x.toFixed(2)}`;
const nzd = (x) => `NZ$${(x * P.currency.nzd_per_usd).toFixed(2)}`;

// ── replay the voice path over an answer ──────────────────────────────────────
// openaiClient.chatStream strips [S#] markers as it streams (inline citations),
// the sentence splitter cuts the clean stream into segments, and ttsClient.tts()
// normalises each segment's numbers to words before the ElevenLabs request
// (apps/web/src/voice/useVoiceConversation.js:214-280, services/ttsClient.js:75).
// Streaming is emulated by pushing the text word by word, which is close to
// token granularity and lets the splitter's early-flush rule fire as it would live.
function spokenSegments(answer) {
  const stripper = createMarkerStripper();
  const splitter = createSentenceSplitter();
  const pieces = String(answer ?? '').match(/\S+\s*|\s+/g) ?? [];
  const segments = [];
  for (const piece of pieces) {
    const clean = stripper.write(piece);
    if (clean) for (const s of splitter.push(clean)) segments.push(s);
  }
  const tail = stripper.flush();
  if (tail) for (const s of splitter.push(tail)) segments.push(s);
  const rest = splitter.finish();
  if (rest) segments.push(rest);
  // A "Sources:" trailer (p0/v1 trailing-citation mode) is spoken too on the
  // legacy path; it is kept, which is the conservative (higher) estimate.
  return segments.map(s => s.trim()).filter(Boolean).map(s => normalizeSpokenText(s));
}

const questionTokens = (q) => Math.ceil(String(q ?? '').length / 4);

// ── artefacts ─────────────────────────────────────────────────────────────────
const files = readdirSync(EVAL_DIR).filter(f => f.startsWith(`generation_${SNAPSHOT}_`) && f.endsWith('.json')).sort();
if (!files.length) { console.error(`no generation_${SNAPSHOT}_*.json under docs/report/eval`); process.exit(1); }

const columns = files.map(f => {
  const run = JSON.parse(readFileSync(resolve(EVAL_DIR, f), 'utf8'));
  const rows = run.rows.filter(r => r.promptTokens != null && r.completionTokens != null).map(r => {
    const segs = spokenSegments(r.answer);
    const chars = segs.reduce((a, s) => a + s.length, 0);
    const qTok = questionTokens(r.question);
    const typed = embedCost(qTok) + tok(run.model, r.promptTokens, r.completionTokens);
    const spokenApi = typed + embedCost(qTok * SPEC_EMBEDS) + ttsApi(chars) + WHISPER_SHARE * whisperCost(WHISPER_SECONDS);
    const spokenPlan = typed + embedCost(qTok * SPEC_EMBEDS) + ttsPlan(chars) + WHISPER_SHARE * whisperCost(WHISPER_SECONDS);
    return { ...r, segs: segs.length, chars, typed, spokenApi, spokenPlan, llm: tok(run.model, r.promptTokens, r.completionTokens) };
  });
  const key = [run.condition ?? run.promptVersion, run.retrievalMode !== 'production' ? run.retrievalMode : null, run.model, run.samples > 1 ? `x${run.samples}` : 'seeded'].filter(Boolean).join(' · ');
  return { file: f, run, rows, key, partial: !!run.partial };
});

const s = (xs) => summary(xs);
const fmt3 = (st) => `${st.mean.toFixed(0)} / ${st.median.toFixed(0)} / ${st.p90.toFixed(0)}`;
const fmtUsd3 = (st, d = 4) => `${usd(st.mean, d)} / ${usd(st.median, d)} / ${usd(st.p90, d)}`;

// ── headline columns ──────────────────────────────────────────────────────────
const find = (pred) => columns.find(pred) ?? null;
const prod = find(c => c.run.condition === 'v2' && c.run.retrievalMode === 'production' && c.run.model === 'gpt-4o' && c.run.samples > 1)
          ?? find(c => c.run.condition === 'v2' && c.run.retrievalMode === 'production' && c.run.model === 'gpt-4o');
const mini = find(c => c.run.condition === 'v2' && c.run.retrievalMode === 'production' && c.run.model === 'gpt-4o-mini' && c.run.samples > 1)
          ?? find(c => c.run.condition === 'v2' && c.run.retrievalMode === 'production' && c.run.model === 'gpt-4o-mini');
const norag = find(c => c.run.condition === 'v2' && c.run.retrievalMode === 'none' && c.run.model === 'gpt-4o' && c.run.samples > 1)
           ?? find(c => c.run.condition === 'v2' && c.run.retrievalMode === 'none' && c.run.model === 'gpt-4o');
if (!prod) { console.error('no v2 production gpt-4o artefact found'); process.exit(1); }

const per = (col) => ({
  typed: mean(col.rows.map(r => r.typed)),
  spokenApi: mean(col.rows.map(r => r.spokenApi)),
  spokenPlan: mean(col.rows.map(r => r.spokenPlan)),
  chars: mean(col.rows.map(r => r.chars)),
  segs: mean(col.rows.map(r => r.segs)),
  promptTok: mean(col.rows.map(r => r.promptTokens)),
  completionTok: mean(col.rows.map(r => r.completionTokens)),
  llm: mean(col.rows.map(r => r.llm)),
});
const H = per(prod);

// blended turn under the usage assumptions
const blended = (p, useApi) => VOICE_SHARE * (useApi ? p.spokenApi : p.spokenPlan) + (1 - VOICE_SHARE) * p.typed;

// ── scale table ───────────────────────────────────────────────────────────────
const plansAsc = Object.entries(P.elevenlabs.plans).filter(([n]) => n !== 'free').sort((a, b) => a[1].usd_per_month - b[1].usd_per_month);
function elevenPlanFor(chars) {
  for (const [name, plan] of plansAsc) if (planCharsIncluded(plan) >= chars) return { name, plan, overageUsd: 0, fits: true };
  const [name, plan] = plansAsc[plansAsc.length - 1];
  // Beyond Business the honest figure is the pay-as-you-go API rate for the remainder; ElevenLabs sells enterprise above this.
  return { name, plan, overageUsd: ttsApi(chars - planCharsIncluded(plan)), fits: false };
}
function fleet(users) {
  const turns = users * TURNS_PER_DAY * DAYS;
  const spokenTurns = turns * VOICE_SHARE, typedTurns = turns - spokenTurns;
  const llmUsd = turns * H.typed + spokenTurns * embedCost(questionTokens('x'.repeat(100)) * SPEC_EMBEDS);
  const ttsChars = spokenTurns * H.chars;
  const whisperUsd = spokenTurns * WHISPER_SHARE * whisperCost(WHISPER_SECONDS);
  const ep = elevenPlanFor(ttsChars);
  const ttsPlanUsd = ep.plan.usd_per_month + ep.overageUsd;
  const ttsPaygUsd = ttsApi(ttsChars);
  const egressGb = users * UNITY_LOADS * UNITY_DATA_GB;
  const vercel = P.vercel.pro.usd_per_seat_month + Math.max(0, egressGb - P.vercel.pro.fast_data_transfer_included_gb) * P.vercel.pro.fast_data_transfer_overage_per_gb;
  const supabase = P.supabase.free.usd_per_month;
  const totalPlan = llmUsd + whisperUsd + ttsPlanUsd + vercel + supabase;
  const totalPayg = llmUsd + whisperUsd + ttsPaygUsd + vercel + supabase;
  return { users, turns, llmUsd, whisperUsd, ttsChars, ep, ttsPlanUsd, ttsPaygUsd, egressGb, vercel, supabase, totalPlan, totalPayg };
}

// ── one-off: ingestion ────────────────────────────────────────────────────────
const kbRows = readFileSync(resolve(ROOT, 'docs/report/kb_chunks_reference.csv'), 'utf8').trim().split('\n').length - 1;
const CHUNK_WORDS = 500;                 // scripts/ingest/chunking.js CHUNK_WORDS
const chunkTokens = Math.round(CHUNK_WORDS * 1.3);
const ingestEmbedUsd = embedCost(kbRows * chunkTokens);
const ingestTagUsd = kbRows * tok('gpt-4o-mini', 200 + 150, 25); // content.slice(0,800) ≈ 200 tok + instructions ≈ 150 tok, ~25 tok JSON out (ingest.mjs:187-198)

// ── one-off: the evaluation itself ────────────────────────────────────────────
const evalSpend = {};
const add = (model, inTok, outTok, kind) => { const k = `${kind} · ${model}`; evalSpend[k] ??= { model, inTok: 0, outTok: 0, calls: 0 }; evalSpend[k].inTok += inTok; evalSpend[k].outTok += outTok; evalSpend[k].calls += 1; };
for (const f of readdirSync(EVAL_DIR).filter(f => f.endsWith('.json'))) {
  let j; try { j = JSON.parse(readFileSync(resolve(EVAL_DIR, f), 'utf8')); } catch { continue; }
  if (f.startsWith('generation_')) for (const r of j.rows ?? []) if (r.promptTokens != null) add(j.model ?? 'gpt-4o', r.promptTokens, r.completionTokens ?? 0, 'generation');
  if (f.startsWith('judge_') || f.startsWith('pairwise_')) for (const r of j.rows ?? []) {
    const u = r.usage; if (!u) continue;
    add(j.judgeModel ?? 'unknown', u.prompt_tokens ?? u.input_tokens ?? 0, u.completion_tokens ?? u.output_tokens ?? 0, f.startsWith('judge_') ? 'judge' : 'pairwise');
  }
}
const evalRows = Object.entries(evalSpend).map(([k, v]) => ({ k, ...v, usd: P.openai[v.model] ? tok(v.model, v.inTok, v.outTok) : null }));
const evalTotal = evalRows.reduce((a, r) => a + (r.usd ?? 0), 0);

// ── report ────────────────────────────────────────────────────────────────────
const md = [];
md.push(`# Cost of operation — snapshot ${SNAPSHOT}, computed at ${SHA} (${new Date().toISOString().slice(0, 10)})`, '');
md.push(`Generated by \`scripts/eval/cost-model.mjs\` from the generation artefacts \`docs/report/eval/generation_${SNAPSHOT}_*.json\` and the price table \`${PRICING_PATH}\` (prices checked ${P.checked}; **every price must be verified against the account's actual plan before publication**). USD; NZ$ at ${P.currency.nzd_per_usd} per US$ (${P.currency.checked}).`, '');
md.push('## Assumptions', '');
md.push('| Assumption | Value | Basis |', '|---|---|---|');
md.push(`| Chat model / prompt / retrieval for the production turn | ${prod.run.model}, ${prod.run.condition}, ${prod.run.retrievalMode}, temperature ${prod.run.temperature} | \`${prod.file}\` (${prod.rows.length} answers) — production settings (ragConfig.js) |`);
md.push(`| Prompt and completion tokens per turn | measured per answer | OpenAI \`usage\` fields recorded by run-generation.mjs |`);
md.push(`| Query embedding tokens | ceil(question chars / 4) | one \`text-embedding-3-small\` call per turn (LRU cache ignored: conservative) |`);
md.push(`| Speculative embeddings per spoken turn | ${SPEC_EMBEDS} | voiceConfig.js SPECULATIVE_MAX_FIRES = 2; \`--speculative-embeds\` |`);
md.push(`| Text-to-speech characters per spoken turn | measured per answer | citation markers stripped, sentence splitter, normalizeSpokenText replayed over the answer (the production voice path); one ElevenLabs request per segment |`);
md.push(`| ElevenLabs price | API ${usd(P.elevenlabs.api_per_1k_chars.flash_turbo, 2)}/1k chars; plan-credit ${usd(planRatePer1k(PLAN), 4)}/1k chars on ${PLAN_NAME} (${usd2(PLAN.usd_per_month)}/month, ${planCharsIncluded(PLAN).toLocaleString()} chars) | pricing.json \`elevenlabs\`; production model eleven_turbo_v2_5 at 0.5 credit/char |`);
md.push(`| Speech-to-text | browser / on-device recognition (free); Whisper fallback on ${(WHISPER_SHARE * 100).toFixed(0)}% of spoken turns × ${WHISPER_SECONDS} s | sttWeb.js primary path; \`--whisper-share\`, \`--whisper-seconds\` |`);
md.push(`| Prompt caching | none assumed | the shared prefix (system prompt ≈ 715 tokens) is below OpenAI's 1,024-token caching minimum and the passages differ per question |`);
md.push(`| Session | ${TURNS_PER_SESSION} turns, ${(VOICE_SHARE * 100).toFixed(0)}% spoken | \`--turns-per-session\`, \`--voice-share\` (apps/api/.env.example: a full study session is ~30–60 requests ≈ this) |`);
md.push(`| User-month | ${TURNS_PER_DAY} turns/day × ${DAYS} days, ${(VOICE_SHARE * 100).toFixed(0)}% spoken | \`--turns-per-day\`, \`--days\` |`);
md.push(`| Unity WebGL download | ${UNITY_DATA_GB.toFixed(3)} GB per load × ${UNITY_LOADS} loads per user-month | unity.data.unityweb on disk; vercel.json \`max-age=86400\` so a daily user re-downloads daily (\`--unity-loads-per-user-month\`) |`);
md.push(`| Fixed platform | Vercel Pro ${usd2(P.vercel.pro.usd_per_seat_month)}/seat (1 seat, 2 projects), Supabase Free ${usd2(P.supabase.free.usd_per_month)} | user-stated plans 2026-09-18; Supabase Free pauses after 7 idle days — Pro (${usd2(P.supabase.pro.usd_per_month)}) is the production-grade line |`);
md.push('');

md.push('## A. Per-turn cost by artefact (mean / median / p90 per answer)', '');
md.push('Typed turn = embedding + chat completion. Spoken turn = typed + speculative embedding + ElevenLabs characters (+ Whisper share). Segments = ElevenLabs requests per answer.', '');
md.push('| Artefact | model · temp | n | prompt tok | completion tok | TTS chars | segments | typed turn | spoken turn (API rate) | spoken turn (plan rate) |', '|---|---|---|---|---|---|---|---|---|---|');
for (const c of columns) {
  if (!c.rows.length) continue;
  md.push(`| \`${c.file}\`${c.partial ? ' (partial)' : ''} | ${c.run.model} · ${c.run.temperature} | ${c.rows.length} | ${fmt3(s(c.rows.map(r => r.promptTokens)))} | ${fmt3(s(c.rows.map(r => r.completionTokens)))} | ${fmt3(s(c.rows.map(r => r.chars)))} | ${mean(c.rows.map(r => r.segs)).toFixed(1)} | ${fmtUsd3(s(c.rows.map(r => r.typed)))} | ${fmtUsd3(s(c.rows.map(r => r.spokenApi)))} | ${fmtUsd3(s(c.rows.map(r => r.spokenPlan)))} |`);
}
md.push('');

md.push('## B. Headline: what one production turn costs', '');
const line = (label, col) => {
  const p = per(col);
  return `| ${label} | \`${col.file}\` | ${usd(p.typed)} (${nzd(p.typed)}) | ${usd(p.spokenApi)} (${nzd(p.spokenApi)}) | ${usd(p.spokenPlan)} (${nzd(p.spokenPlan)}) | ${(p.spokenPlan / p.typed).toFixed(1)}× |`;
};
md.push('| Configuration | artefact | typed turn | spoken turn (API rate) | spoken turn (plan rate) | spoken ÷ typed |', '|---|---|---|---|---|---|');
md.push(line('v2 · gpt-4o (production)', prod));
if (mini) md.push(line('v2 · gpt-4o-mini (cost/quality alternative)', mini));
if (norag) md.push(line('v2 · gpt-4o · no retrieval (RAG ablation)', norag));
md.push('');
md.push('**Where the money goes in a spoken production turn (plan rate, means):**', '');
const specUsd = embedCost(questionTokens('x'.repeat(100)) * SPEC_EMBEDS);
const parts = [
  ['gpt-4o input', (H.promptTok * P.openai['gpt-4o'].input) / 1e6],
  ['gpt-4o output', (H.completionTok * P.openai['gpt-4o'].output) / 1e6],
  ['embeddings (query + speculative)', embedCost(25) + specUsd],
  [`ElevenLabs TTS, ${H.chars.toFixed(0)} chars in ${H.segs.toFixed(1)} requests (plan rate)`, ttsPlan(H.chars)],
  ['Whisper fallback share', WHISPER_SHARE * whisperCost(WHISPER_SECONDS)],
];
const partTotal = parts.reduce((a, [, v]) => a + v, 0);
md.push('| Component | USD | share |', '|---|---|---|');
for (const [k, v] of parts) md.push(`| ${k} | ${usd(v)} | ${((100 * v) / partTotal).toFixed(1)}% |`);
md.push(`| **total** | **${usd(partTotal)}** | 100% |`, '');
md.push(`Text-to-speech is ${(ttsPlan(H.chars) / H.llm).toFixed(1)}× the language-model cost of the same turn at the plan rate (${(ttsApi(H.chars) / H.llm).toFixed(1)}× at the API rate). Substituting OpenAI \`tts-1\` (${usd(P.openai['tts-1'].price, 2)}/1M chars) would cost ${usd(openaiTts(H.chars))} per turn — ${(ttsPlan(H.chars) / openaiTts(H.chars)).toFixed(1)}× cheaper — but returns no character alignment, so the avatar has no viseme timeline and falls back to a static or RMS-driven mouth (ttsClient.js: \`visemeTimeline: null\`). The lip-sync value chain has a price.`, '');
if (norag) {
  const n = per(norag);
  md.push(`Retrieval adds ${usd(H.typed - n.typed)} per typed turn over the same prompt with no passages (${(H.typed / n.typed).toFixed(2)}×): ${H.promptTok.toFixed(0)} vs ${n.promptTok.toFixed(0)} prompt tokens, i.e. ≈ ${(H.promptTok - n.promptTok).toFixed(0)} tokens for the five passages.`, '');
}
if (mini) {
  const m = per(mini);
  md.push(`\`gpt-4o-mini\` cuts the language-model share from ${usd(H.llm)} to ${usd(m.llm)} per turn (${(H.llm / m.llm).toFixed(1)}×) but leaves the spoken turn at ${usd(m.spokenPlan)} because TTS dominates; the quality side of that trade is in the E2 tables (column \`v2:mini-final\`).`, '');
}
md.push(`Sanity check: the July audit estimated US$0.01–0.03 per text question with up to 900 completion tokens (docs/rag/rag-current-state-audit.md:181); the measured production answer is ${H.completionTok.toFixed(0)} completion tokens, which puts the typed turn at ${usd(H.typed)}, at the low end of that range.`, '');

md.push('## C. Session and user-month', '');
md.push('| Unit | v2 · gpt-4o, API TTS rate | v2 · gpt-4o, plan TTS rate |' + (mini ? ' v2 · gpt-4o-mini, plan TTS rate |' : ''), '|---|---|---|' + (mini ? '---|' : ''));
const M = mini ? per(mini) : null;
const rowC = (label, mult) => `| ${label} | ${usd(mult * blended(H, true), 3)} (${nzd(mult * blended(H, true))}) | ${usd(mult * blended(H, false), 3)} (${nzd(mult * blended(H, false))}) |` + (M ? ` ${usd(mult * blended(M, false), 3)} (${nzd(mult * blended(M, false))}) |` : '');
md.push(rowC('one blended turn', 1));
md.push(rowC(`one session (${TURNS_PER_SESSION} turns)`, TURNS_PER_SESSION));
md.push(rowC(`one user-month (${TURNS_PER_DAY}/day × ${DAYS})`, TURNS_PER_DAY * DAYS));
md.push('', 'Variable cost only; fixed platform costs are in D.', '');

md.push('## D. Fleet cost per month (variable + fixed)', '');
md.push('ElevenLabs plan = the smallest plan whose included characters cover the month; beyond Business the remainder is priced at the API rate and flagged. Vercel = 1 Pro seat + transfer overage above the included 1 TB. Supabase Free is $0 but pauses after a week idle; add Pro if the deployment must stay up.', '');
md.push('| Users | turns/month | LLM + embeddings | TTS chars | ElevenLabs plan (fits?) | TTS on plan | TTS pay-as-you-go | Unity egress GB | Vercel | Supabase | **total (plan)** | **total (PAYG)** | per user |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const u of USERS) {
  const f = fleet(u);
  md.push(`| ${u.toLocaleString()} | ${f.turns.toLocaleString()} | ${usd2(f.llmUsd)} | ${(f.ttsChars / 1e6).toFixed(2)}M | ${f.ep.name} (${f.ep.fits ? 'yes' : 'no — enterprise'}) | ${usd2(f.ttsPlanUsd)} | ${usd2(f.ttsPaygUsd)} | ${f.egressGb.toFixed(0)} | ${usd2(f.vercel)} | ${usd2(f.supabase)} | **${usd2(f.totalPlan)}** (${nzd(f.totalPlan)}) | **${usd2(f.totalPayg)}** | ${usd2(f.totalPlan / u)} |`);
}
md.push('');
md.push(`Concurrency, not price, is what the ElevenLabs plan actually buys: ${Object.entries(P.elevenlabs.plans).map(([n, p]) => `${n} ${p.tts_concurrency}`).join(', ')} concurrent TTS requests (unverified, see pricing.json). The voice path issues one request per sentence as sentences arrive, ~${H.segs.toFixed(0)} per answer — see the scalability evaluation (E11).`, '');

md.push('## E. One-off costs', '');
md.push('| Item | Basis | USD |', '|---|---|---|');
md.push(`| Knowledge-base embedding | ${kbRows} chunks (docs/report/kb_chunks_reference.csv) × ~${chunkTokens} tokens (CHUNK_WORDS=${CHUNK_WORDS}) × text-embedding-3-small | ${usd(ingestEmbedUsd)} |`);
md.push(`| Knowledge-base auto-tagging | ${kbRows} gpt-4o-mini calls, content.slice(0,800) (scripts/ingest/ingest.mjs:187-198) | ${usd(ingestTagUsd)} |`);
md.push(`| Re-ingestion | content-hash gated: unchanged chunks are never re-embedded (ingest.mjs:8-12) | ≈0 per run |`);
for (const r of evalRows) md.push(`| Evaluation: ${r.k} | ${r.calls.toLocaleString()} calls, ${(r.inTok / 1e6).toFixed(2)}M in / ${(r.outTok / 1e6).toFixed(3)}M out tokens (usage fields in docs/report/eval/*.json) | ${r.usd == null ? 'no price in table' : usd2(r.usd)} |`);
md.push(`| **Evaluation total (priced rows)** | generation + judge + pairwise artefacts committed under docs/report/eval | **${usd2(evalTotal)}** (${nzd(evalTotal)}) |`);
md.push('', 'Not in the table: embeddings for the retrieval and latency benchmarks (a few hundred calls, well under $0.10), and any run whose artefact was not committed.', '');

md.push('## F. What this model does not capture', '');
md.push('- The BYO-key clients record no usage at all, and the study proxy writes `usage_events` only when a user id is present (apps/api/api/_lib/usage.js:14); anonymous study participants leave only a request count. The token and character figures above are therefore artefact-measured, not dashboard-measured. One real session read off the OpenAI and ElevenLabs dashboards is the validation step.');
md.push('- `usage_events.units` for Whisper is audio bytes, not seconds (transcribe.js:96-98); any query over that table needs a codec-specific bytes→seconds ratio.');
md.push('- Whisper cost is set to zero by default because browser and on-device recognition are the primary paths; `--whisper-share 1 --whisper-seconds 8` prices the all-fallback case.');
md.push('- Vercel function compute (Fluid active CPU) is not priced: a chat turn streams for a few seconds of mostly idle time and the included 360 GB-hours are not approached at these volumes.');
md.push('- No prompt caching is assumed. If the passage block were reordered so the cached prefix exceeded 1,024 tokens, gpt-4o input on the system prompt would halve; this is a design option, not a current saving.');
md.push('- Prices are list prices on the dates in pricing.json. The account\'s actual plan, tier and any credits must be checked before any figure is published.');
md.push('');

const text = md.join('\n');
console.log('\n' + md.slice(md.indexOf('## B. Headline: what one production turn costs'), md.indexOf('## C. Session and user-month')).join('\n'));
console.log(md.slice(md.indexOf('## D. Fleet cost per month (variable + fixed)'), md.indexOf('## E. One-off costs')).join('\n'));
console.log(`\nEvaluation spend to date (priced artefacts): ${usd2(evalTotal)}`);
if (DRY_RUN) { console.log('\n--dry-run: report not written'); }
else { mkdirSync(resolve(ROOT, 'docs/report/eval/final'), { recursive: true }); writeFileSync(OUT, text + '\n'); console.log(`\nWrote ${OUT}`); }
