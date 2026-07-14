/**
 * Node smoke tests for the G2P viseme pipeline (src/lib/lipsync/*).
 *
 * The RN sources are ESM (Metro-bundled); this runner uses a minimal
 * regex-based module loader (same spirit as generate-fixtures.js) so the
 * production code can be exercised without a bundler.
 *
 * Usage: node test-g2p.js
 */

const path = require('path');
const { loadModule } = require('./esm-loader');

const SRC = path.join(__dirname, '../../src/lib/lipsync');

// ── Load production modules ────────────────────────────────────────────────────
const { wordToPhonemes }        = loadModule('g2p/g2p.js', SRC);
const { createVisemeTimeline }  = loadModule('createVisemeTimeline.js', SRC);
const { normalizeSpokenText }   = loadModule('../tts/normalizeSpokenText.js', SRC);

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${cond ? '' : '  ' + detail}`);
  if (!cond) failures++;
}

// ── 1. G2P fixes classic spelling traps ────────────────────────────────────────
const one = wordToPhonemes('one');
check('"one" starts with /W/ (spelling heuristic saw a vowel)',
  one && one[0] === 'W', JSON.stringify(one));

const enough = wordToPhonemes('enough');
check('"enough" ends with /F/ (gh)',
  enough && enough[enough.length - 1] === 'F', JSON.stringify(enough));

const knight = wordToPhonemes('knight');
check('"knight" starts with /N/ (silent k)',
  knight && knight[0] === 'N', JSON.stringify(knight));

const phone = wordToPhonemes('phone');
check('"phone" starts with /F/',
  phone && phone[0] === 'F', JSON.stringify(phone));

check('"pumpkins" plural suffix rule works',
  (wordToPhonemes('pumpkins') || []).join(' ').endsWith('Z'),
  JSON.stringify(wordToPhonemes('pumpkins')));

check('nonsense word returns null (falls back to char path)',
  wordToPhonemes('zorblex') === null);

// ── 2. Timeline through the full production path ──────────────────────────────
function makeAlignment(text, secondsPerChar = 0.055) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * secondsPerChar),
    character_end_times_seconds:   characters.map((_, i) => (i + 1) * secondsPerChar),
  };
}

const text = 'Peter put a pumpkin by the barn.';
const { frames, totalDuration } = createVisemeTimeline(makeAlignment(text));

const bilabials = frames.filter(f => f.viseme === 'v_pp');
// P-eter, p-ut, p-um-P-kin(2), b-y, b-arn = 6 bilabial phones
check(`bilabial count = 6 (got ${bilabials.length})`, bilabials.length === 6,
  JSON.stringify(bilabials.map(b => b.time.toFixed(2))));

// "one" through the full timeline: first non-neutral frame should be 'ou' (/W/)
const oneTl = createVisemeTimeline(makeAlignment('one'));
const firstActive = oneTl.frames.find(f => f.viseme !== 'neutral');
check('"one" timeline starts with ou viseme (/W/)',
  firstActive && firstActive.viseme === 'ou', JSON.stringify(oneTl.frames));

// Frames must be time-ordered and inside the audio span
let ordered = true;
for (let i = 1; i < frames.length; i++)
  if (frames[i].time < frames[i - 1].time - 1e-6) ordered = false;
check('frames time-ordered', ordered);
check('frames within duration', frames.every(f => f.time <= totalDuration + 1e-6));

// Function word "the" should articulate at reduced weight
const the = createVisemeTimeline(makeAlignment('the barn'));
const thFrame = the.frames.find(f => f.viseme === 'v_th');
check('"the" v_th frame exists at reduced weight',
  thFrame && thFrame.weight < 0.55, JSON.stringify(thFrame));

// OOV word still yields frames via the char-heuristic fallback
const oov = createVisemeTimeline(makeAlignment('zorblex says hi'));
check('OOV sentence still produces active frames',
  oov.frames.some(f => f.viseme !== 'neutral' && f.time < 0.055 * 7));

// ── 3. Spoken-text normalization (numbers → words, so the mouth moves) ────────
check('"23" → "twenty-three"', normalizeSpokenText('23') === 'twenty-three',
  normalizeSpokenText('23'));
check('"I have 23 cats" expands the number',
  normalizeSpokenText('I have 23 cats') === 'I have twenty-three cats',
  normalizeSpokenText('I have 23 cats'));
check('"3:30" → "three thirty"', normalizeSpokenText("it's 3:30") === "it's three thirty",
  normalizeSpokenText("it's 3:30"));
check('"3:05" → "three oh five"', normalizeSpokenText('3:05') === 'three oh five',
  normalizeSpokenText('3:05'));
check('"3:00" → "three o\'clock"', normalizeSpokenText('3:00') === "three o'clock",
  normalizeSpokenText('3:00'));
check('"3.5" → "three point five"', normalizeSpokenText('3.5') === 'three point five',
  normalizeSpokenText('3.5'));
check('"$5.50" → "five dollars and fifty cents"',
  normalizeSpokenText('$5.50') === 'five dollars and fifty cents',
  normalizeSpokenText('$5.50'));
check('"$1" is singular dollar', normalizeSpokenText('$1') === 'one dollar',
  normalizeSpokenText('$1'));
check('"50%" → "fifty percent"', normalizeSpokenText('50%') === 'fifty percent',
  normalizeSpokenText('50%'));
check('"1,000" → "one thousand"', normalizeSpokenText('1,000') === 'one thousand',
  normalizeSpokenText('1,000'));
check('"A & B" ampersand → and', normalizeSpokenText('A & B') === 'A and B',
  normalizeSpokenText('A & B'));
check('text with no numbers is untouched',
  normalizeSpokenText('hello there friend') === 'hello there friend');

// ── 4. Normalized numbers actually produce mouth movement end-to-end ──────────
// The whole point: pre-normalization, digits mapped to neutral/weight-0 (frozen
// mouth). After normalization the words flow through G2P and drive visemes.
const rawDigits = createVisemeTimeline(makeAlignment('23'));
check('bare "23" produces NO active visemes (the bug we are fixing)',
  rawDigits.frames.every(f => f.viseme === 'neutral' || f.weight === 0),
  JSON.stringify(rawDigits.frames));

const spoken = createVisemeTimeline(makeAlignment(normalizeSpokenText('I have 23 cats')));
check('normalized "23 cats" sentence produces active visemes',
  spoken.frames.some(f => f.viseme !== 'neutral' && f.weight > 0));

const time330 = createVisemeTimeline(makeAlignment(normalizeSpokenText("it's 3:30")));
check('normalized "3:30" produces active visemes',
  time330.frames.some(f => f.viseme !== 'neutral' && f.weight > 0));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
