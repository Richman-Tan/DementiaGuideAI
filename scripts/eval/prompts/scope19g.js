// §19G scope ablation (docs/eval/plan-19g-scope.md, E3-S): does the production
// v2 prompt's "answer from your own knowledge" clause stop it declining
// out-of-scope questions, and does an explicit scope rule fix that?
//
// Every variant is derived from the live buildSystemPromptV2() output at call
// time, so it cannot drift from production; the deployed prompt
// (packages/core/rag/prompt.js) is not touched. The clause is located by an
// exact anchor that must occur exactly once, or the builder throws.
//
// Components:
//   ownKnowledgeClause  the passage-handling line "- When they are irrelevant or
//                       insufficient, simply answer from your own knowledge. Never
//                       mention the knowledge base, … never refuse a question just
//                       because no passage matched." (the line and the newline
//                       before it)
//   scopeRule           ONE added line, the only added text in any §19G condition,
//                       appended as the last SAFETY RULES line (SCOPE_RULE below)
//
// Conditions:
//   v2-noclause             (s1) v2 − ownKnowledgeClause
//   v2-scoperule            (s2) v2 + scopeRule
//   v2-noclause-scoperule   (s3) v2 − ownKnowledgeClause + scopeRule
// Everything else is byte-identical to v2.
//
// Plain CommonJS (Jest + the .mjs runners).

const { buildSystemPromptV2, buildUserContent } = require('../../../packages/core/rag/prompt');

const CLAUSE_START = '- When they are irrelevant or insufficient, simply answer from your own knowledge.';
const SAFETY_HEADER = '\nSAFETY RULES (these always apply, whatever the style settings say):\n';
const GUIDELINES_HEADER = '\n\nGUIDELINES:\n';
const SCOPE_RULE = "- Only help with questions about dementia, caring for someone living with dementia, or the carer's own wellbeing. If a question is about something else, say kindly that it is outside what you can help with and, where useful, suggest where to ask instead; do not answer it.";

function countOccurrences(haystack, needle) {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
}

function layoutError(what) {
  return new Error(`v2 prompt layout changed: ${what} — update scripts/eval/prompts/scope19g.js`);
}

function removeClause(v2) {
  const needle = `\n${CLAUSE_START}`;
  if (countOccurrences(v2, needle) !== 1) throw layoutError('own-knowledge clause not found exactly once');
  const s = v2.indexOf(needle);
  const nl = v2.indexOf('\n', s + 1);
  if (nl === -1) throw layoutError('own-knowledge clause is the last line');
  return v2.slice(0, s) + v2.slice(nl);
}

function addScopeRule(v2) {
  if (countOccurrences(v2, SAFETY_HEADER) !== 1) throw layoutError('SAFETY RULES header not found exactly once');
  if (countOccurrences(v2, GUIDELINES_HEADER) !== 1) throw layoutError('GUIDELINES header not found exactly once');
  const end = v2.indexOf(GUIDELINES_HEADER);
  if (end < v2.indexOf(SAFETY_HEADER)) throw layoutError('GUIDELINES before SAFETY RULES');
  return `${v2.slice(0, end)}\n${SCOPE_RULE}${v2.slice(end)}`;
}

const VARIANTS = {
  'v2-noclause': (v2) => removeClause(v2),
  'v2-scoperule': (v2) => addScopeRule(v2),
  'v2-noclause-scoperule': (v2) => addScopeRule(removeClause(v2)),
};

function buildSystemPromptScope(id, opts = {}) {
  const f = VARIANTS[id];
  if (!f) throw new Error(`unknown §19G variant ${id}`);
  return f(buildSystemPromptV2(opts));
}

const LABELS = {
  'v2-noclause': 'v2 minus the "answer from your own knowledge" clause (§19G (s1) — never shipped)',
  'v2-scoperule': 'v2 plus one scope rule (§19G (s2) — never shipped)',
  'v2-noclause-scoperule': 'v2 minus the own-knowledge clause, plus the scope rule (§19G (s3) — never shipped)',
};

const SCOPE_CONDITIONS = Object.fromEntries(Object.keys(VARIANTS).map(id => [id, {
  id,
  label: LABELS[id],
  region: 'NZ',
  citationMode: 'inline',
  system: (opts) => buildSystemPromptScope(id, opts),
  userContent: (q, chunks) => buildUserContent(q, chunks, 'inline'),
  lineage: { derivedFrom: 'v2', ablation: id, plan: 'docs/eval/plan-19g-scope.md' },
}]));

module.exports = { CLAUSE_START, SCOPE_RULE, SCOPE_CONDITIONS, buildSystemPromptScope, removeClause, addScopeRule };
