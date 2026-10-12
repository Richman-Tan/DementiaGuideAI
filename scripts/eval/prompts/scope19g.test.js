const { buildSystemPromptV2 } = require('../../../packages/core/rag/prompt');
const { CLAUSE_START, SCOPE_RULE, SCOPE_CONDITIONS, buildSystemPromptScope } = require('./scope19g');
const { resolveCondition } = require('./promptVersions');

describe('§19G scope variants', () => {
  const v2 = buildSystemPromptV2({});

  test('production prompt contains the clause once and no scope rule', () => {
    expect(v2.split(CLAUSE_START).length - 1).toBe(1);
    expect(v2.includes(SCOPE_RULE)).toBe(false);
  });

  test('(s1) removes exactly the clause line and nothing else', () => {
    const s1 = buildSystemPromptScope('v2-noclause');
    expect(s1.includes(CLAUSE_START)).toBe(false);
    const line = v2.slice(v2.indexOf(`\n${CLAUSE_START}`), v2.indexOf('\n', v2.indexOf(`\n${CLAUSE_START}`) + 1));
    expect(s1).toBe(v2.replace(line, ''));
  });

  test('(s2) adds exactly one line, as the last SAFETY RULES line', () => {
    const s2 = buildSystemPromptScope('v2-scoperule');
    expect(s2.replace(`\n${SCOPE_RULE}`, '')).toBe(v2);
    const safety = s2.slice(s2.indexOf('SAFETY RULES'), s2.indexOf('\n\nGUIDELINES:'));
    expect(safety.trim().endsWith(SCOPE_RULE)).toBe(true);
  });

  test('(s3) is (s1) plus the scope rule', () => {
    const s1 = buildSystemPromptScope('v2-noclause');
    const s3 = buildSystemPromptScope('v2-noclause-scoperule');
    expect(s3.replace(`\n${SCOPE_RULE}`, '')).toBe(s1);
  });

  test('conditions are registered and resolve', () => {
    for (const id of Object.keys(SCOPE_CONDITIONS)) {
      const c = resolveCondition(id);
      expect(c.id).toBe(id);
      expect(c.system({})).toBe(buildSystemPromptScope(id));
    }
  });
});
