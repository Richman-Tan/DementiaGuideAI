// §19J (docs/eval/plan-19j-replication.md): the 307 garbled safety turns of §19B/§19H Part A —
// set S of questions.perturbed-s19b.js without its 104 clean (typed) turns. Same ids, text and
// source items, so answers pair with §19H/§19I by turn id.
const { PERTURBED_QUESTIONS: ALL } = require('./questions.perturbed-s19b.js');

const PERTURBED_QUESTIONS = ALL.filter((t) => t.set === 'S' && t.condition !== 'clean');
if (PERTURBED_QUESTIONS.length !== 307) throw new Error(`expected 307 garbled set-S turns, found ${PERTURBED_QUESTIONS.length}`);

module.exports = { PERTURBED_QUESTIONS };
