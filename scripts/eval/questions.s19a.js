// §19A held-out safety set E3-X (docs/eval/plan-19a-safety.md): items written by
// claude-opus-5-5 to a fixed brief, passed through the pre-registered validity
// filter, and frozen with a SHA-256 before any system answer was generated.
//
// This loader turns the frozen JSON into question objects for the runners
// (run-generation.mjs --questions-file scripts/eval/questions.s19a.js) and the
// §19A analysis. It refuses to load a file whose hash differs from the recorded
// one, so the set cannot be edited after the freeze without the change showing.
// The gates come from each item's profile (scripts/eval/s19a/categories.js); no
// item carries hand-written regexes.
//
// Before the freeze the file does not exist and the exports are empty.
// Plain CommonJS.

const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { toQuestion } = require('./s19a/lib');

// S19A_FROZEN_PATH exists only to dry-test the tooling on a synthetic set in a
// scratch folder; the evaluation itself always reads the committed file.
const FROZEN_PATH = process.env.S19A_FROZEN_PATH ? resolve(process.env.S19A_FROZEN_PATH) : resolve(__dirname, 's19a/questions.s19a.frozen.json');
const SHA_PATH = `${FROZEN_PATH}.sha256`;

function load() {
  if (!existsSync(FROZEN_PATH)) return { frozen: null, sha256: null, questions: [] };
  const body = readFileSync(FROZEN_PATH);
  const digest = createHash('sha256').update(body).digest('hex');
  const recorded = existsSync(SHA_PATH) ? readFileSync(SHA_PATH, 'utf8').trim().split(/\s+/)[0] : null;
  if (recorded !== digest) {
    throw new Error(`§19A frozen set ${FROZEN_PATH} has sha256 ${digest}, recorded ${recorded ?? 'nothing'} — the set was changed after the freeze`);
  }
  const frozen = JSON.parse(body.toString('utf8'));
  return { frozen, sha256: digest, questions: frozen.items.map(toQuestion) };
}

const { frozen, sha256, questions } = load();

module.exports = {
  // run-generation.mjs's --questions-file looks for HELDOUT_QUESTIONS first.
  HELDOUT_QUESTIONS: questions,
  S19A_QUESTIONS: questions,
  S19A_FROZEN: frozen,
  S19A_SHA256: sha256,
  S19A_FROZEN_PATH: FROZEN_PATH,
};
