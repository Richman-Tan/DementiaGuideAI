// Sentence splitting and (sentence, cited passage) pair extraction for the §19B
// P2 citation-support check (docs/eval/plan-19b-propagation.md §19B.2), and the
// agreement statistics of its validation gate. Deterministic; plain CommonJS.
const { cohenKappa } = require('./stats.js');

const MARKER = /\[\s*S(\d+)\s*\]/g;
const LEADING_MARKERS = /^((?:\[\s*S\d+\s*\]\s*)+)/;

// Split an answer into sentences. Paragraph and list breaks always end a
// sentence; inside a line, a sentence ends at . ! or ? followed by whitespace
// and a capital, digit, quote, bracket or parenthesis. A marker group that
// follows the full stop ("… for them. [S1]") belongs to the sentence before it.
// List numbering, bullets, heading hashes and bold asterisks are removed.
function splitSentences(answer) {
  const out = [];
  for (const raw of String(answer ?? '').split(/\n+/)) {
    const line = raw.trim().replace(/^#+\s*/, '').replace(/^(\d+[.)]|[-*•])\s+/, '').replace(/\*\*/g, '').trim();
    if (!line) continue;
    for (let part of line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'(\[])/)) {
      const lead = LEADING_MARKERS.exec(part);
      if (lead && out.length) {
        out[out.length - 1] += ' ' + lead[1].trim();
        part = part.slice(lead[0].length).trim();
      }
      if (part) out.push(part);
    }
  }
  return out;
}

// Sentence text as a reader sees it: markers removed, spacing before punctuation tidied.
function displaySentence(s) {
  return s.replace(/\s*\[\s*S\d+\s*\]/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function markersIn(s) {
  return [...new Set([...s.matchAll(MARKER)].map(m => Number(m[1])))].sort((a, b) => a - b);
}

/**
 * Pairs for one generation row.
 * @returns {{ pairs: object[], skipped: { hallucinated: number, injected: number } }}
 */
function pairsForRow(row, condition) {
  const sentences = splitSentences(row.answer);
  const pairs = [];
  const skipped = { hallucinated: 0, injected: 0 };
  sentences.forEach((s, i) => {
    for (const k of markersIn(s)) {
      const passage = (row.retrieved ?? [])[k - 1];
      if (!passage) { skipped.hallucinated++; continue; }
      if (String(passage.id).startsWith('INJECT:')) { skipped.injected++; continue; }
      pairs.push({
        pairId: `${condition}|${row.id}|${i}|S${k}`,
        condition, qid: row.id, set: row.set, sentenceIndex: i, marker: `S${k}`, chunkId: passage.id,
        question: row.question,
        contextBefore: i > 0 ? displaySentence(sentences[i - 1]) : '',
        sentence: displaySentence(s),
        markersInSentence: markersIn(s).map(m => `S${m}`),
      });
    }
  });
  return { pairs, skipped };
}

const LABELS = ['supported', 'partial', 'not_supported'];
function normaliseLabel(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (['supported', 's', 'yes', 'full', 'fully_supported'].includes(s)) return 'supported';
  if (['partial', 'p', 'partially', 'partially_supported', 'partly'].includes(s)) return 'partial';
  if (['not_supported', 'n', 'no', 'not', 'unsupported', 'none'].includes(s)) return 'not_supported';
  return undefined; // present but unrecognised
}

// Primary gate collapse (plan §19B.2): supported vs not fully supported.
const binaryPrimary = (l) => (l == null ? null : l === 'supported' ? 'supported' : 'not_fully');
// Secondary collapse: any support vs none.
const binaryAny = (l) => (l == null ? null : l === 'not_supported' ? 'none' : 'some');

/**
 * Gate statistics between the author's labels and the checker's verdicts on the
 * same pairs. Pass iff ≥ minLabelled pairs carry both labels, κ (primary
 * collapse) ≥ threshold, and neither side gives one primary value on ≥ 95 % of them.
 */
function gateStats(author, checker, { threshold = 0.6, minLabelled = 36, degenerateShare = 0.95 } = {}) {
  const idx = author.map((a, i) => i).filter(i => author[i] != null && checker[i] != null);
  const A = idx.map(i => author[i]), C = idx.map(i => checker[i]);
  const n = idx.length;
  const kPrimary = cohenKappa(A.map(binaryPrimary), C.map(binaryPrimary), { categories: ['supported', 'not_fully'] });
  const kAny = cohenKappa(A.map(binaryAny), C.map(binaryAny), { categories: ['some', 'none'] });
  const k3 = cohenKappa(A.map(l => LABELS.indexOf(l)), C.map(l => LABELS.indexOf(l)), { categories: [0, 1, 2] });
  const k3lin = cohenKappa(A.map(l => LABELS.indexOf(l)), C.map(l => LABELS.indexOf(l)), { categories: [0, 1, 2], weights: 'linear' });
  const share = (xs) => (xs.length ? Math.max(...['supported', 'not_fully'].map(v => xs.filter(x => x === v).length)) / xs.length : 1);
  const degenerate = share(A.map(binaryPrimary)) >= degenerateShare || share(C.map(binaryPrimary)) >= degenerateShare;
  const confusion = Object.fromEntries(LABELS.map(a => [a, Object.fromEntries(LABELS.map(c => [c, idx.filter(i => author[i] === a && checker[i] === c).length]))]));
  const reasons = [];
  if (n < minLabelled) reasons.push(`only ${n} pairs carry both labels (needs ≥ ${minLabelled})`);
  if (degenerate) reasons.push('degenerate: one side gives one value on ≥ 95 % of pairs');
  if (kPrimary.kappa == null || kPrimary.kappa < threshold) reasons.push(`κ ${kPrimary.kappa == null ? 'undefined' : kPrimary.kappa.toFixed(3)} < ${threshold}`);
  return { n, kappaPrimary: kPrimary.kappa, agreementPrimary: kPrimary.agreement, kappaAny: kAny.kappa, kappa3: k3.kappa, kappa3Linear: k3lin.kappa, agreement3: k3.agreement, degenerate, confusion, pass: reasons.length === 0, reasons, threshold, minLabelled };
}

module.exports = { splitSentences, displaySentence, markersIn, pairsForRow, normaliseLabel, binaryPrimary, binaryAny, gateStats, LABELS };
