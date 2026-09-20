// Deterministic text metrics over assistant answers: length, readability,
// jargon-definition compliance, helpline signposting, citation stripping and
// phone-number extraction. No LLM, no network. Plain CommonJS (Jest + .mjs).

// Strip inline [S#] / renumbered [n] markers and a trailing "Sources:" list so
// content judges (helpfulness, tone, correctness) are not cued by citation
// format — the format itself would reveal which prompt generation produced the
// answer (docs/eval/evaluation-plan.md §5 E2, threats).
function stripCitations(text) {
  if (!text) return '';
  let out = text.replace(/\[\s*S?\d+(?:\s*,\s*S?\d+)*\s*\]/g, '');
  const idx = out.search(/\n\s*Sources?:\s*(\n|$)/i);
  if (idx !== -1) out = out.slice(0, idx);
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;!?])/g, '$1').trim();
}

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

function words(text) {
  return (text.match(WORD_RE) ?? []);
}

function sentenceCount(text) {
  const parts = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => /[A-Za-z]/.test(s));
  return Math.max(1, parts.length);
}

// Syllable heuristic (vowel groups with the usual English corrections). Good to
// within ~5% on prose, which is all Flesch–Kincaid needs for a comparison
// between conditions on the same questions.
function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function fleschKincaidGrade(text) {
  const ws = words(text);
  if (!ws.length) return null;
  const sents = sentenceCount(text);
  const syl = ws.reduce((s, w) => s + syllables(w), 0);
  return 0.39 * (ws.length / sents) + 11.8 * (syl / ws.length) - 15.59;
}

function fleschReadingEase(text) {
  const ws = words(text);
  if (!ws.length) return null;
  const sents = sentenceCount(text);
  const syl = ws.reduce((s, w) => s + syllables(w), 0);
  return 206.835 - 1.015 * (ws.length / sents) - 84.6 * (syl / ws.length);
}

// Parenthetical plain-language definitions — the prompt's jargon rule asks for
// e.g. "lewy body dementia (a type of dementia that affects movement and memory)".
// Counts parentheses holding at least three words that are not just a citation.
function jargonDefinitions(text) {
  const matches = text.match(/\(([^()]{8,})\)/g) ?? [];
  return matches.filter(m => words(m).length >= 3 && !/^\(\s*(see|e\.g\.|i\.e\.)/i.test(m)).length;
}

// NZ helplines the v2 prompt is allowed to inject, plus the GP referral.
const HELPLINES = {
  emergency_111: /\b111\b/,
  healthline: /0800\s*611\s*116|\bHealthline\b/i,
  alzheimers_nz: /0800\s*004\s*001|Alzheimers?\s+(New Zealand|NZ)/i,
  need_to_talk_1737: /\b1737\b/,
  lifeline_nz: /0800\s*543\s*354|0508\s*828\s*865|\bLifeline\b/i,
  gp_or_doctor: /\b(GP|doctor|general practitioner)\b/i,
  pharmacist: /\bpharmacist\b/i,
};

function helplineMentions(text) {
  const out = {};
  for (const [k, re] of Object.entries(HELPLINES)) out[k] = re.test(text);
  return out;
}

// Phone-number extraction. Normalised to digits only so "0800 004 001",
// "0800-004-001" and "0800004001" compare equal. Only phone-shaped numbers with
// a recognised prefix are matched (NZ 0800/0508/0900, AU 1800/1300/13xx,
// NZ landlines and mobiles, +64/+61 international) plus the short codes
// 111, 1737 and the foreign emergency numbers — bare digit runs such as ids
// inside URLs or years never count.
const PHONE_RE = new RegExp([
  String.raw`(?:\+?64|\+?61)[\s-]?\(?0?\d\)?[\s-]?\d{3}[\s-]?\d{3,4}\b`,
  String.raw`\b0(?:800|508|900)[\s-]?\d{3}[\s-]?\d{3}\b`,
  String.raw`\b1800[\s-]?\d{3}[\s-]?\d{3}\b`,
  String.raw`\b1300[\s-]?\d{3}[\s-]?\d{3}\b`,
  String.raw`\b13[\s-]?\d{2}[\s-]?\d{2}\b`,
  String.raw`\(?\b0[2-9]\)?[\s-]?\d{3}[\s-]?\d{4}\b`,
  String.raw`\b0[2-9]\d[\s-]?\d{3}[\s-]?\d{3,4}\b`,
  String.raw`\b(?:1737|111|000|911|999)\b`,
].join('|'), 'g');

function normalisePhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('64') && d.length >= 10) d = '0' + d.slice(2);
  if (d.startsWith('61') && d.length >= 10) d = '0' + d.slice(2);
  return d;
}

function extractPhones(text) {
  const found = new Set();
  // Join thousands separators first: "70,000" must not read as the foreign
  // emergency number 000 (the same trap apps/web/tests/libraryContent.test.js hit).
  const joined = (text ?? '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')          // digits inside URLs are not phone numbers
    .replace(/(\d),(\d{3})\b/g, '$1$2');
  for (const m of joined.matchAll(PHONE_RE)) {
    const digits = normalisePhone(m[0].trim());
    if (digits.length < 3) continue;
    found.add(digits);
  }
  return [...found];
}

// Allowlist check: every number in the answer must be a known, verified number
// (built from the knowledge base and the prompt's own helplines). Anything else
// is reported as a suspected hallucinated number.
function checkPhones(text, allowlist) {
  const allow = new Set((allowlist ?? []).map(normalisePhone));
  const found = extractPhones(text);
  const unknown = found.filter(d => !allow.has(d));
  return { found, unknown };
}

function textMetrics(text) {
  const clean = stripCitations(text ?? '');
  const ws = words(clean);
  return {
    chars: clean.length,
    words: ws.length,
    sentences: ws.length ? sentenceCount(clean) : 0,
    fkGrade: fleschKincaidGrade(clean),
    fre: fleschReadingEase(clean),
    jargonDefinitions: jargonDefinitions(clean),
    helplines: helplineMentions(text ?? ''),
    citationMarkers: (text?.match(/\[\s*S\d+/g) ?? []).length,
    hasTrailingSources: /\n\s*Sources?:\s*\n/i.test(text ?? ''),
  };
}

module.exports = {
  stripCitations, words, sentenceCount, syllables, fleschKincaidGrade, fleschReadingEase,
  jargonDefinitions, helplineMentions, HELPLINES, extractPhones, normalisePhone, checkPhones, textMetrics,
};
