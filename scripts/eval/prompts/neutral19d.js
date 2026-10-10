// §19D jurisdiction-neutral prompt (docs/eval/plan-19d-neutral-prompt.md, E3-N):
// the production v2 prompt with EVERY jurisdiction cue removed, derived
// mechanically from the live buildSystemPromptV2() output, so it cannot drift
// from production. The deployed prompt (packages/core/rag/prompt.js) is not
// touched.
//
// Derivation, in two steps, both pure deletions (nothing is reworded or added):
//   1. Cut the two NZ rule lines whole, exactly as §19A condition (c) does
//      (scripts/eval/prompts/ablation19a.js): the 111 escalation rule and the NZ
//      helpline guideline (Healthline, Alzheimers New Zealand, 1737).
//   2. Delete the three remaining country mentions, each located by an exact
//      context string that must occur exactly once:
//        persona    "… caring for people with dementia in New Zealand."  → " in New Zealand" deleted
//        persona    "… and the New Zealand health, aged-care, …"         → "New Zealand " deleted
//        passages   "… they are authoritative for New Zealand services …" → "New Zealand " deleted
// So condition (n) = §19A condition (c) minus the words "New Zealand"; the
// persona, the warmth rule, the dose, diagnosis, uncertainty and source rules,
// the jargon, length and driving guidelines and the inline-citation rule are
// byte-identical to v2.
//
// Residual cues kept on purpose (declared in the plan): "GP" (in the dose,
// diagnosis and driving rules, which must stay identical; used in NZ, Australia,
// the UK and Ireland alike), Commonwealth spelling ("specialising",
// "behaviour"), and "local services" (relative, names no place). A tripwire
// below fails the build if any country, NZ service, NZ number or foreign
// emergency number is left in the derived text.
//
// Plain CommonJS (Jest + the .mjs runners).

const { buildUserContent } = require('../../../packages/core/rag/prompt');
const { buildSystemPromptV2Without } = require('./ablation19a');

const RULE_LINES_CUT = ['escalation111', 'helplines'];

const COUNTRY_DELETIONS = [
  { name: 'persona-scope', context: 'families caring for people with dementia in New Zealand.', remove: ' in New Zealand' },
  { name: 'persona-system', context: 'and the New Zealand health, aged-care, and dementia-support system.', remove: 'New Zealand ' },
  { name: 'passages-authority', context: 'they are authoritative for New Zealand services and resources.', remove: 'New Zealand ' },
];

// Anything that names or implies a jurisdiction. The derived prompt must match none.
const JURISDICTION_CUES = /Zealand|\bNZ\b|Aotearoa|M[āa]ori|Kiwi|Te Whatu Ora|Health NZ|Healthline|Alzheimers|\b111\b|\b1737\b|\b0800\b|\b0508\b|\b000\b|\b911\b|\b999\b|\b112\b|Australia|Austral|United States|\bUSA?\b|America|United Kingdom|\bUK\b|Britain|England|Canada|Ireland|\bNHS\b/;

function countOccurrences(haystack, needle) {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
}

function layoutError(what) {
  return new Error(`v2 prompt layout changed: ${what} — update scripts/eval/prompts/neutral19d.js`);
}

function applyCountryDeletions(text) {
  let out = text;
  for (const d of COUNTRY_DELETIONS) {
    if (countOccurrences(out, d.context) !== 1) throw layoutError(`context for ${d.name} not found exactly once`);
    if (countOccurrences(d.context, d.remove) !== 1) throw layoutError(`deletion for ${d.name} is not unique within its context`);
    out = out.replace(d.context, d.context.replace(d.remove, ''));
  }
  return out;
}

function buildSystemPromptNeutral(opts = {}) {
  const out = applyCountryDeletions(buildSystemPromptV2Without(RULE_LINES_CUT, opts));
  const left = JURISDICTION_CUES.exec(out);
  if (left) throw layoutError(`jurisdiction cue "${left[0]}" left in the neutral prompt`);
  return out;
}

const NEUTRAL_CONDITIONS = {
  'v2-neutral': {
    id: 'v2-neutral',
    label: 'v2 with every jurisdiction cue removed: §19A (c) minus the words "New Zealand" (§19D condition (n) — never shipped)',
    // `region` is the SCORING region (checkRow applies the global Australian-service
    // check to NZ-region runs); the deployment target is still New Zealand.
    region: 'NZ',
    citationMode: 'inline',
    system: (opts) => buildSystemPromptNeutral(opts),
    userContent: (q, chunks) => buildUserContent(q, chunks, 'inline'),
    lineage: {
      derivedFrom: 'v2',
      ablation: `removed: ${RULE_LINES_CUT.join(', ')}; deleted: ${COUNTRY_DELETIONS.map(d => d.name).join(', ')}`,
      plan: 'docs/eval/plan-19d-neutral-prompt.md',
    },
  },
};

module.exports = { RULE_LINES_CUT, COUNTRY_DELETIONS, JURISDICTION_CUES, NEUTRAL_CONDITIONS, buildSystemPromptNeutral, applyCountryDeletions };
