// Pure metric helpers for the lip-sync evaluation scripts (plain CommonJS,
// Jest-tested). Nothing here touches Unity, audio or the network.

// Viseme → articulator class (mirrors VisemeMap.cs in the Unity engine).
const VISEME_CLASS = {
  aa: 'vowel', ih: 'vowel', ou: 'vowel', ee: 'vowel', oh: 'vowel',
  v_pp: 'bilabial', v_ff: 'labiodental',
  v_th: 'tongue', v_dd: 'tongue', v_nn: 'tongue', v_kk: 'tongue',
  v_ss: 'sibilant', v_ch: 'sibilant', v_rr: 'rhotic', neutral: 'neutral',
};

// ARPAbet phone → articulator class expected to be VISIBLE (used as the
// lexicon-derived ground truth for closure coverage).
const PHONE_CLASS = {
  P: 'bilabial', B: 'bilabial', M: 'bilabial',
  F: 'labiodental', V: 'labiodental',
  TH: 'tongue', DH: 'tongue',
};

// Non-neutral viseme labels in time order, consecutive duplicates collapsed.
function visemeSequence(frames, minWeight = 0.05) {
  const out = [];
  for (const f of [...frames].sort((a, b) => a.time - b.time)) {
    if (f.viseme === 'neutral' || (f.weight ?? 0) < minWeight) continue;
    if (out[out.length - 1] !== f.viseme) out.push(f.viseme);
  }
  return out;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

// Edit alignment with backtrace: ops of {op: match|sub|ins|del, a, b}.
function alignSequences(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push({ op: a[i - 1] === b[j - 1] ? 'match' : 'sub', a: a[i - 1], b: b[j - 1] }); i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'del', a: a[i - 1], b: null }); i--; }
    else { ops.push({ op: 'ins', a: null, b: b[j - 1] }); j--; }
  }
  return ops.reverse();
}

// Class-level confusion of `alt` against `ref` (ref rows, alt columns).
function classConfusion(ref, alt) {
  const matrix = {};
  const bump = (r, c) => { (matrix[r] ??= {})[c] = (matrix[r][c] ?? 0) + 1; };
  let matches = 0, subs = 0, ins = 0, dels = 0;
  for (const o of alignSequences(ref, alt)) {
    if (o.op === 'match') { matches++; bump(VISEME_CLASS[o.a] ?? o.a, VISEME_CLASS[o.b] ?? o.b); }
    else if (o.op === 'sub') { subs++; bump(VISEME_CLASS[o.a] ?? o.a, VISEME_CLASS[o.b] ?? o.b); }
    else if (o.op === 'ins') { ins++; bump('(none)', VISEME_CLASS[o.b] ?? o.b); }
    else { dels++; bump(VISEME_CLASS[o.a] ?? o.a, '(none)'); }
  }
  return { matrix, matches, substitutions: subs, insertions: ins, deletions: dels };
}

// Word spans from a character alignment: [{ word, start, end }].
function wordSpans(characters, startTimes, endTimes) {
  const spans = [];
  let wordStart = -1, word = '';
  for (let i = 0; i <= characters.length; i++) {
    const ch = i < characters.length ? characters[i] : null;
    if (ch && /[a-zA-Z']/.test(ch)) { if (wordStart < 0) wordStart = i; word += ch; }
    else if (wordStart >= 0) { spans.push({ word, start: startTimes[wordStart], end: endTimes[i - 1] }); wordStart = -1; word = ''; }
  }
  return spans;
}

// Does any frame of `viseme` with weight ≥ minWeight start inside [start, end]?
function producedInSpan(frames, viseme, start, end, minWeight = 0.3) {
  return frames.some(f => f.viseme === viseme && (f.weight ?? 0) >= minWeight && f.time >= start - 1e-6 && f.time < end + 1e-6);
}

// Closure coverage: for each word whose lexicon phones contain a visible
// articulator class, did the timeline produce that class's viseme inside the
// word's span? Returns per-class { expected, produced, missed[] }.
const CLASS_VISEME = { bilabial: 'v_pp', labiodental: 'v_ff', tongue: 'v_th' };
function closureCoverage(spans, phonesOf, frames) {
  const mk = () => ({ expected: 0, produced: 0, missed: [], notExpected: 0, falsePositive: 0, spurious: [] });
  const out = { bilabial: mk(), labiodental: mk(), tongue: mk() };
  for (const s of spans) {
    const phones = phonesOf(s.word);
    if (!phones) continue;
    const classes = new Set(phones.map(p => PHONE_CLASS[p]).filter(Boolean));
    for (const cls of Object.keys(out)) {
      const produced = producedInSpan(frames, CLASS_VISEME[cls], s.start, s.end);
      if (classes.has(cls)) {
        out[cls].expected += 1;
        if (produced) out[cls].produced += 1; else out[cls].missed.push(s.word);
      } else {
        out[cls].notExpected += 1;
        if (produced) { out[cls].falsePositive += 1; out[cls].spurious.push(s.word); }
      }
    }
  }
  return out;
}

// Synthetic character alignment for a sentence at a fixed seconds-per-character
// rate — both ablation arms share it, so only the phonemiser differs.
function syntheticAlignment(text, secondsPerChar = 0.055) {
  const characters = [...text];
  const r6 = (x) => Number(x.toFixed(6)); // avoid 0.30000000000000004-style drift in spans
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => r6(i * secondsPerChar)),
    character_end_times_seconds: characters.map((_, i) => r6((i + 1) * secondsPerChar)),
  };
}

module.exports = { VISEME_CLASS, PHONE_CLASS, CLASS_VISEME, visemeSequence, levenshtein, alignSequences, classConfusion, wordSpans, producedInSpan, closureCoverage, syntheticAlignment };
