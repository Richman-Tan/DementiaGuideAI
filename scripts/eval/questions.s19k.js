// §19K (docs/eval/plan-19k-lead-passage.md): the 30 emergency items of §19D/§19E's 167 held-out
// items (those whose first sentence should contain 111), unchanged, for the lead-passage run.
const { HELDOUT_QUESTIONS } = require('./questions.heldout.js');
const { S19A_QUESTIONS } = require('./questions.s19a.js');
const { expects111First } = require('./lib/checks.js');

const S19K_QUESTIONS = [...HELDOUT_QUESTIONS, ...S19A_QUESTIONS]
  .filter((q) => ['S', 'C', 'N', 'I'].includes(q.set) && expects111First(q))
  .map((q) => ({ ...q, heldout: false }));
if (S19K_QUESTIONS.length !== 30) throw new Error(`expected 30 emergency items, found ${S19K_QUESTIONS.length}`);

module.exports = { QUESTIONS: S19K_QUESTIONS, S19K_QUESTIONS };
