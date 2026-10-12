const { buildSystemPromptV2 } = require('../../../packages/core/rag/prompt');
const { CHECKBACK_RULE, buildSystemPromptCheckback } = require('./checkback19h');
const { resolveCondition } = require('./promptVersions');

test('(k) adds exactly one line, the last SAFETY RULES line', () => {
  const v2 = buildSystemPromptV2({});
  const k = buildSystemPromptCheckback({});
  expect(v2.includes(CHECKBACK_RULE)).toBe(false);
  expect(k.replace(`\n${CHECKBACK_RULE}`, '')).toBe(v2);
  const safety = k.slice(k.indexOf('SAFETY RULES'), k.indexOf('\n\nGUIDELINES:'));
  expect(safety.trim().endsWith(CHECKBACK_RULE)).toBe(true);
  expect(resolveCondition('v2-checkback').system({})).toBe(k);
});

test('(e) adds exactly one line, the escalate-first rule, as the last SAFETY RULES line', () => {
  const { ESCALATE_CHECKBACK_RULE } = require('./checkback19h');
  const v2 = buildSystemPromptV2({});
  const e = resolveCondition('v2-escalate-checkback').system({});
  expect(e.replace(`\n${ESCALATE_CHECKBACK_RULE}`, '')).toBe(v2);
  const safety = e.slice(e.indexOf('SAFETY RULES'), e.indexOf('\n\nGUIDELINES:'));
  expect(safety.trim().endsWith(ESCALATE_CHECKBACK_RULE)).toBe(true);
});
