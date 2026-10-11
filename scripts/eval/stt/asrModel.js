// Recogniser error model for the §19B P1 propagation study (plan-19b-propagation.md).
//
// Two parts, both deterministic and network-free:
//   deriveRecogniser(aggregates)  — turns the COMMITTED E9 aggregates of one
//       recogniser (pooled S/D/I counts, the hallucination/empty table, the
//       function-word deletion share and the top-30 substitution table) into
//       per-utterance event rates and per-word rates for non-empty output.
//   transcribe(text, recogniser, rnd, opts) — applies that model to one typed
//       question: empty output, else word substitutions / deletions /
//       insertions (perturb.js), then an optional stock phrase appended.
// And the app's own STT boundary rule, mirrored exactly:
//   appBlankGuard(t)  — apps/web/src/voice/useVoiceConversation.js:464
//       `const transcript = (heard ?? '').trim(); if (!transcript) { … "I didn't
//       catch that" … return; }` and apps/mobile/…/useAvatarConversation.js:599
//       `if (!transcript) { … setVoiceState(IDLE); return; }`.
//
// Calibration rule (fixed in the plan): the model's expected per-word S, D and I
// over a population of utterances equal the committed pooled totals, with every
// word of an empty utterance counted as a deletion and every word of a stock
// phrase counted as an insertion, under the declared assumption that empty and
// phrase utterances have the mean reference length. Hence, for non-empty output:
//   s = S / (N (1 − pE))
//   d = (D − pE N) / (N (1 − pE))
//   i = (I − P · L̄) / (N (1 − pE))
// where N = reference words, pE = empty utterances / utterances, P = phrase
// utterances, L̄ = mean words of the stock phrases drawn uniformly.
// Plain CommonJS so Jest can test it.
const { perturb } = require('./perturb.js');
const { FUNCTION_WORDS } = require('../lib/wer.js');

// The four stock phrases of the committed hallucination table
// (wer_57ad032_whisper-1.md line 19), rendered as Whisper prints them.
const STOCK_PHRASES = ['Thank you.', 'Thanks for watching!', 'Subscribe.', 'Bye.'];
const STOCK_PHRASE_WORDS = new Set(['thank', 'thanks', 'you', 'for', 'watching', 'subscribe', 'bye']);

const wordsIn = (s) => s.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);

/**
 * @param {object} a  committed aggregates for ONE recogniser and ONE group:
 *   { refWords, S, D, I, utterances, phraseUtterances, emptyUtterances,
 *     fnDeleted, contentDeleted, substitutions: [{ref, hyp, n}] }
 */
function deriveRecogniser(a, { phrases = STOCK_PHRASES } = {}) {
  const N = a.refWords;
  const pE = a.emptyUtterances / a.utterances;
  const L = phrases.reduce((s, p) => s + wordsIn(p).length, 0) / phrases.length;
  const nonEmptyWords = N * (1 - pE);
  const sub = a.S / nonEmptyWords;
  const del = (a.D - pE * N) / nonEmptyWords;
  const ins = (a.I - a.phraseUtterances * L) / nonEmptyWords;
  if (del < 0 || ins < 0) throw new Error(`derived rates negative (del ${del}, ins ${ins}) — the calibration assumption fails for these aggregates`);
  const pPhrase = a.phraseUtterances / (a.utterances - a.emptyUtterances);
  // Substitution pairs whose hypothesis is a stock-phrase word are the
  // alignment's view of the phrase hallucinations, which the model injects
  // explicitly; they are dropped so the phrase is not counted twice.
  const confusions = a.substitutions.filter(c => !STOCK_PHRASE_WORDS.has(c.hyp));
  // Inserted words: the function-word hypotheses of the same table, weighted
  // by count (the committed data list no insertion words directly).
  const weights = new Map();
  for (const c of confusions) if (FUNCTION_WORDS.has(c.hyp)) weights.set(c.hyp, (weights.get(c.hyp) ?? 0) + c.n);
  const insertWords = [...weights].map(([w, n]) => ({ w, n })).sort((x, y) => y.n - x.n || x.w.localeCompare(y.w));
  return {
    pEmpty: pE,
    pPhraseGivenNonEmpty: pPhrase,
    phrases,
    meanPhraseWords: L,
    rates: { sub, del, ins },
    functionWordDeletionShare: a.fnDeleted / (a.fnDeleted + a.contentDeleted),
    confusions,
    insertWords,
    // What the model implies per reference word over a population of
    // utterances of mean length — equals the committed pooled rates by construction.
    impliedPooled: { sub: a.S / N, del: a.D / N, ins: a.I / N, wer: (a.S + a.D + a.I) / N },
  };
}

/**
 * Apply a derived recogniser to one question. Consumes rnd() in a fixed order:
 * empty test, then (if not empty) perturb()'s draws, then the phrase test and,
 * when a phrase fires, its choice.
 * @returns {{ text: string, emptyOutput: boolean, phrase: string|null }}
 */
function transcribe(text, rec, rnd, { vocabulary = [] } = {}) {
  if (rnd() < rec.pEmpty) return { text: '', emptyOutput: true, phrase: null };
  const profile = { levels: { model: rec.rates }, confusions: rec.confusions, functionWordDeletionShare: rec.functionWordDeletionShare, fillers: ['um', 'uh'] };
  let out = perturb(text, profile, 'model', rnd, { vocabulary, insertWords: rec.insertWords });
  let phrase = null;
  if (rec.pPhraseGivenNonEmpty > 0 && rnd() < rec.pPhraseGivenNonEmpty) {
    phrase = rec.phrases[Math.floor(rnd() * rec.phrases.length)];
    out = `${out} ${phrase}`.trim();
  }
  return { text: out, emptyOutput: false, phrase };
}

// The app's blank-transcript guard at the STT boundary (see header).
function appBlankGuard(transcript) {
  return !(transcript ?? '').trim();
}

module.exports = { deriveRecogniser, transcribe, appBlankGuard, STOCK_PHRASES, STOCK_PHRASE_WORDS };
