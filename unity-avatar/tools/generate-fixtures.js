/**
 * Lip-sync test fixture generator.
 *
 * Produces Assets/Tests/Fixtures/<name>.json — one file per test sentence —
 * consumed by LipSyncTestDriver/LipSyncFixturePlayer in the Unity editor.
 *
 * Each fixture is a superset of the native-bridge "play" message:
 *   {
 *     type: "play", name, text, duration,
 *     visemes:     [{ t, d, v, w }],            // 14-key viseme events (Phase 1 engine input)
 *     blendshapes: [{ time, weights: {...} }],  // legacy pre-translated keyframes (current prod path)
 *     checks:      [{ time, type, label, ... }] // assertion/screenshot points
 *   }
 *
 * Phoneme sequences are HAND-AUTHORED ARPAbet (deterministic ground truth —
 * these sentences must not depend on the G2P heuristics under test). Timing is
 * synthesized from per-class nominal durations scaled to the app's 0.78 speech
 * rate. The legacy `blendshapes` track is produced with the real production
 * translator (src/features/avatar/bridge/blendshapeTranslator.js) so baseline
 * runs measure exactly what the app ships today.
 *
 * Usage: node generate-fixtures.js
 */

const fs   = require('fs');
const path = require('path');
const { loadModule } = require('./esm-loader');

// Production modules — single source of truth for translation and (for the
// g2p_pipeline fixture) the real ElevenLabs-alignment → viseme pipeline.
const { visemeTimelineToCC4, visemeTimelineToEvents } =
  loadModule(path.join(__dirname, '../../src/features/avatar/bridge/blendshapeTranslator.js'));
const { createVisemeTimeline } =
  loadModule(path.join(__dirname, '../../src/lib/lipsync/createVisemeTimeline.js'));

// ── Phoneme model ──────────────────────────────────────────────────────────────

const SPEECH_RATE = 0.78;            // app default; durations divided by this
const WORD_GAP    = 0.04;            // s between words
const COMMA_PAUSE = 0.20;
const SENT_PAUSE  = 0.30;

// ARPAbet → internal 14-key viseme set
const PHONE_TO_VISEME = {
  AA: 'aa', AE: 'aa', AH: 'aa', AO: 'aa', AW: 'aa', AY: 'aa',
  EH: 'ih', IH: 'ih',
  EY: 'ee', IY: 'ee', Y: 'ee',
  OW: 'oh', OY: 'oh',
  UH: 'ou', UW: 'ou', W: 'ou',
  ER: 'v_rr', R: 'v_rr',
  L: 'v_dd', T: 'v_dd', D: 'v_dd', N: 'v_dd',
  K: 'v_kk', G: 'v_kk', NG: 'v_kk',
  CH: 'v_ch', JH: 'v_ch', SH: 'v_ch', ZH: 'v_ch',
  S: 'v_ss', Z: 'v_ss',
  TH: 'v_th', DH: 'v_th',
  F: 'v_ff', V: 'v_ff',
  P: 'v_pp', B: 'v_pp', M: 'v_pp',
  HH: 'neutral',
};

const PHONE_CLASS = {
  vowel:     ['AA','AE','AH','AO','EH','IH','IY','UH','UW','ER'],
  diphthong: ['AW','AY','EY','OW','OY'],
  stop:      ['P','B','T','D','K','G'],
  nasal:     ['M','N','NG'],
  fricative: ['F','V','S','Z','TH','DH','SH','ZH','HH'],
  affricate: ['CH','JH'],
  glide:     ['W','Y','R','L'],
};
const CLASS_DURATION = {                 // seconds at rate 1.0
  vowel: 0.11, diphthong: 0.15, stop: 0.06, nasal: 0.07,
  fricative: 0.09, affricate: 0.09, glide: 0.08,
};
const CLASS_WEIGHT = {
  vowel: 0.85, diphthong: 0.85, stop: 0.9, nasal: 0.8,
  fricative: 0.85, affricate: 0.8, glide: 0.7,
};

function classOf(p) {
  for (const [cls, list] of Object.entries(PHONE_CLASS))
    if (list.includes(p)) return cls;
  throw new Error(`unknown phone ${p}`);
}

// Per-viseme peak weights (bilabial/labiodental closures must be near-full)
const VISEME_PEAK = { v_pp: 0.95, v_ff: 0.90, neutral: 0.25 };

const FUNCTION_WORDS = new Set(['a','of','the','by','than','that','is','your','are','you']);
const FUNCTION_WORD_SCALE = 0.68;

// ── Fixture definitions (hand-authored ARPAbet) ────────────────────────────────
// Words: [orthography, [phones...]]. '|' entries insert pauses.
const FIXTURES = [
  {
    name: 'hello', text: 'Hello, how are you feeling today?',
    words: [
      ['hello', ['HH','AH','L','OW']], [','],
      ['how', ['HH','AW']], ['are', ['AA','R']], ['you', ['Y','UW']],
      ['feeling', ['F','IY','L','IH','NG']], ['today', ['T','AH','D','EY']],
    ],
  },
  {
    name: 'bilabials', text: 'Peter put a pumpkin by the barn.',
    words: [
      ['peter', ['P','IY','T','ER']], ['put', ['P','UH','T']], ['a', ['AH']],
      ['pumpkin', ['P','AH','M','P','K','IH','N']], ['by', ['B','AY']],
      ['the', ['DH','AH']], ['barn', ['B','AA','R','N']],
    ],
  },
  {
    name: 'labiodental', text: 'Five very fine views of the valley.',
    words: [
      ['five', ['F','AY','V']], ['very', ['V','EH','R','IY']],
      ['fine', ['F','AY','N']], ['views', ['V','Y','UW','Z']],
      ['of', ['AH','V']], ['the', ['DH','AH']], ['valley', ['V','AE','L','IY']],
    ],
  },
  {
    name: 'dental', text: 'This thing is thicker than that thing.',
    words: [
      ['this', ['DH','IH','S']], ['thing', ['TH','IH','NG']], ['is', ['IH','Z']],
      ['thicker', ['TH','IH','K','ER']], ['than', ['DH','AE','N']],
      ['that', ['DH','AE','T']], ['thing', ['TH','IH','NG']],
    ],
  },
  {
    name: 'rounded', text: 'Who would choose your shoes?',
    words: [
      ['who', ['HH','UW']], ['would', ['W','UH','D']],
      ['choose', ['CH','UW','Z']], ['your', ['Y','AO','R']],
      ['shoes', ['SH','UW','Z']],
    ],
  },
  {
    name: 'sibilant_rhotic', text: 'Sister runs errands every morning.',
    words: [
      ['sister', ['S','IH','S','T','ER']], ['runs', ['R','AH','N','Z']],
      ['errands', ['EH','R','AH','N','D','Z']], ['every', ['EH','V','R','IY']],
      ['morning', ['M','AO','R','N','IH','NG']],
    ],
  },
  {
    name: 'silence_gaps', text: 'Yes. No. Maybe.',
    words: [
      ['yes', ['Y','EH','S']], ['.'],
      ['no', ['N','OW']], ['.'],
      ['maybe', ['M','EY','B','IY']],
    ],
  },
];

// ── Timeline synthesis ─────────────────────────────────────────────────────────

function buildFixture(fx) {
  const visemes = [];
  const checks  = [];
  let t = 0.10; // small lead-in

  for (const entry of fx.words) {
    if (entry[0] === ',') { checkSilence(t + COMMA_PAUSE / 2); t += COMMA_PAUSE; continue; }
    if (entry[0] === '.') { checkSilence(t + SENT_PAUSE / 2); t += SENT_PAUSE + 0.10; continue; }

    const [word, phones] = entry;
    const wordScale = FUNCTION_WORDS.has(word) ? FUNCTION_WORD_SCALE : 1.0;
    let firstVowelSeen = false;

    for (const p of phones) {
      const cls = classOf(p);
      const dur = CLASS_DURATION[cls] / SPEECH_RATE;
      const vis = PHONE_TO_VISEME[p];
      const w   = Math.min(1, (VISEME_PEAK[vis] ?? CLASS_WEIGHT[cls]) * wordScale);

      visemes.push({ t: round(t), d: round(dur), v: vis, w: round(w) });

      const mid = t + dur / 2;
      if (['P','B','M'].includes(p))
        checks.push({ time: round(mid), type: 'bilabial', label: `${p}-${word}` });
      else if (['F','V'].includes(p))
        checks.push({ time: round(mid), type: 'labiodental', label: `${p}-${word}` });
      else if (['TH','DH'].includes(p))
        checks.push({ time: round(mid), type: 'tongue', viseme: 'v_th', label: `${p}-${word}` });
      else if (['T','D','N','L'].includes(p))
        checks.push({ time: round(mid), type: 'tongue', viseme: 'v_dd', label: `${p}-${word}` });
      else if ((cls === 'vowel' || cls === 'diphthong') && !firstVowelSeen && wordScale === 1.0) {
        checks.push({ time: round(mid), type: 'peak', viseme: vis, label: `${p}-${word}` });
        firstVowelSeen = true;
      }
      t += dur;
    }
    t += WORD_GAP;
  }

  const duration = round(t + 0.25); // trailing decay window
  checks.push({ time: round(duration - 0.02), type: 'end', label: 'segment-end' });

  // Legacy production track: translate through the real app translator.
  const frames = visemes.map(e => ({ time: e.t, viseme: e.v, duration: e.d, weight: e.w }));
  const blendshapes = visemeTimelineToCC4({ frames, totalDuration: duration }, null);

  function checkSilence(time) {
    checks.push({ time: round(time), type: 'silence', label: 'pause' });
  }

  return { type: 'play', name: fx.name, text: fx.text, duration, visemes, blendshapes, checks };
}

const round = (x) => Math.round(x * 1000) / 1000;

// ── g2p_pipeline fixture ───────────────────────────────────────────────────────
// Unlike the hand-authored fixtures above (independent ground truth for the
// Unity engine), this one runs a sentence through the REAL production pipeline
// (createVisemeTimeline G2P path → visemeTimelineToEvents) from a synthetic
// ElevenLabs-style character alignment, so the Unity suite exercises exactly
// what the app ships. Checks are derived from the pipeline's own output.
function buildPipelineFixture() {
  const text = 'Maybe we should phone the pharmacy before five.';
  const secondsPerChar = 0.055;
  const characters = [...text];
  const alignment = {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * secondsPerChar),
    character_end_times_seconds:   characters.map((_, i) => (i + 1) * secondsPerChar),
  };

  const timeline = createVisemeTimeline(alignment);
  const visemes  = visemeTimelineToEvents(timeline);
  const duration = round(timeline.totalDuration + 0.25);

  const checks = [];
  for (const e of visemes) {
    const mid = round(e.t + e.d / 2);
    if (e.v === 'v_pp' && e.w > 0.4) checks.push({ time: mid, type: 'bilabial', label: `pp-${mid}` });
    if (e.v === 'v_ff' && e.w > 0.4) checks.push({ time: mid, type: 'labiodental', label: `ff-${mid}` });
    if (e.v === 'v_th' && e.w > 0.3) checks.push({ time: mid, type: 'tongue', viseme: 'v_th', label: `th-${mid}` });
  }
  checks.push({ time: round(duration - 0.02), type: 'end', label: 'segment-end' });

  return {
    type: 'play', name: 'g2p_pipeline', text, duration, visemes,
    blendshapes: visemeTimelineToCC4(timeline, null),
    checks,
  };
}

// ── Emit ───────────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '../UnityAvatarProject/Assets/Tests/Fixtures');
fs.mkdirSync(outDir, { recursive: true });

for (const fx of FIXTURES.map(buildFixture).concat([buildPipelineFixture()])) {
  const file = path.join(outDir, `${fx.name}.json`);
  fs.writeFileSync(file, JSON.stringify(fx, null, 2));
  console.log(`${fx.name}: ${fx.visemes.length} visemes, ${fx.checks.length} checks, ${fx.duration}s -> ${path.relative(process.cwd(), file)}`);
}
