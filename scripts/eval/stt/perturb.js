// Perturbation core for perturb-questions.mjs, kept CommonJS so Jest can test
// it directly. Word-level operations only; capitalisation and terminal
// punctuation of the original are preserved where possible so the text still
// reads like a typed-or-spoken question rather than a token soup.
const { FUNCTION_WORDS, FILLERS } = require('../lib/wer.js');

const WORD_SPLIT = /(\s+)/;

function tokenise(text) {
  // Keep whitespace tokens so the sentence re-joins naturally.
  return text.split(WORD_SPLIT).filter(t => t.length);
}

function isWord(t) { return /[A-Za-z]/.test(t); }
function bare(t) { return t.toLowerCase().replace(/[^a-z']/g, ''); }

// Cheap phonetic neighbour: same first letter and length within 1, drawn from
// the vocabulary of the question set; falls back to a filler if none.
function nearCandidate(word, vocabulary, rnd) {
  const w = bare(word);
  const cands = vocabulary.filter(v => v !== w && v[0] === w[0] && Math.abs(v.length - w.length) <= 1);
  if (!cands.length) return null;
  return cands[Math.floor(rnd() * cands.length)];
}

function substituteFor(word, profile, vocab, rnd) {
  const w = bare(word);
  const hits = (profile.confusions ?? []).filter(c => c.ref === w);
  if (hits.length) {
    const total = hits.reduce((s, c) => s + c.n, 0);
    let u = rnd() * total;
    for (const c of hits) { u -= c.n; if (u <= 0) return c.hyp; }
    return hits[hits.length - 1].hyp;
  }
  return nearCandidate(w, vocab, rnd) ?? (profile.fillers ?? ['um'])[0];
}

function restoreCase(original, replacement) {
  if (/^[A-Z]/.test(original)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function keepPunct(original, replacement) {
  const m = original.match(/[.,?!;:]+$/);
  return m ? replacement + m[0] : replacement;
}

// `level` ∈ profile.levels for ASR-style errors; 'disfluent' applies only the
// disfluency rates (fillers, repetitions, retracings), no recognition errors.
function perturb(text, profile, level, rnd, { vocabulary = [] } = {}) {
  const vocab = [...new Set(vocabulary.flatMap(v => v.split(/\s+/).map(bare)).filter(v => v.length > 2 && !FILLERS.has(v)))];
  const tokens = tokenise(text);
  const fillers = profile.fillers ?? ['um', 'uh'];
  const out = [];
  if (level === 'disfluent') {
    const d = profile.disfluencyPer100Words ?? {};
    const pFill = (d.filler ?? 0) / 100, pRep = (d.repetition ?? 0) / 100, pRetr = (d.retracing ?? 0) / 100;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!isWord(t)) { out.push(t); continue; }
      if (rnd() < pFill) out.push(fillers[Math.floor(rnd() * fillers.length)] + ',', ' ');
      if (rnd() < pRep) out.push(t.replace(/[.,?!;:]+$/, ''), ' ');
      if (rnd() < pRetr && vocab.length) {
        const alt = nearCandidate(t, vocab, rnd);
        if (alt) out.push(restoreCase(t, alt) + ',', ' ', 'I mean', ' ');
      }
      out.push(t);
    }
    return out.join('').replace(/\s+([.,?!])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  const rates = profile.levels?.[level];
  if (!rates) throw new Error(`unknown level "${level}" — profile has ${Object.keys(profile.levels ?? {}).join(', ')} and disfluent`);
  const fnShare = profile.functionWordDeletionShare ?? 0.5;
  const words = tokens.filter(isWord);
  const nFn = words.filter(t => FUNCTION_WORDS.has(bare(t))).length;
  const nContent = words.length - nFn;
  // Per-class deletion probabilities so that the overall deletion rate is
  // `rates.del` with the function-word share `fnShare` (clamped to what exists).
  const delTotal = rates.del * words.length;
  const pDelFn = nFn ? Math.min(1, delTotal * fnShare / nFn) : 0;
  const pDelContent = nContent ? Math.min(1, delTotal * (1 - fnShare) / nContent) : 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!isWord(t)) { out.push(t); continue; }
    const u = rnd();
    const pDel = FUNCTION_WORDS.has(bare(t)) ? pDelFn : pDelContent;
    if (u < pDel) { // deletion (terminal punctuation moves to the previous word)
      const m = t.match(/[.,?!;:]+$/);
      if (out.length && !isWord(out[out.length - 1])) out.pop(); // trailing whitespace
      if (m && out.length) out[out.length - 1] = out[out.length - 1].replace(/[.,?!;:]+$/, '') + m[0];
      if (out.length) out.push(' ');
      if (tokens[i + 1] && !isWord(tokens[i + 1])) i++; // its own following whitespace
      continue;
    }
    if (u < pDel + rates.sub) {
      out.push(keepPunct(t, restoreCase(t, substituteFor(t, profile, vocab, rnd))));
    } else {
      out.push(t);
    }
    if (rnd() < rates.ins) out.push(' ', fillers[Math.floor(rnd() * fillers.length)]);
  }
  return out.join('').replace(/\s{2,}/g, ' ').replace(/\s+([.,?!])/g, '$1').trim();
}

module.exports = { perturb, tokenise };
