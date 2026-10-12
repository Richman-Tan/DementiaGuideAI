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
