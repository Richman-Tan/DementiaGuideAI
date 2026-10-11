const { ABLATIONS, ABLATION_CONDITIONS, componentTexts, buildSystemPromptV2Without, COMPONENTS } = require('./ablation19a');
const { CONDITIONS, resolveCondition } = require('./promptVersions');
const { buildSystemPromptV2 } = require('../../../packages/core/rag/prompt');

const v2 = buildSystemPromptV2();

describe('§19A component ablations — v2 minus whole components, never rewritten', () => {
  const texts = componentTexts();

  it('finds each component exactly once, with the expected boundaries', () => {
    for (const c of COMPONENTS) expect(v2.split(texts[c]).length).toBe(2);
    expect(texts.persona.startsWith('You are Aria, an expert AI assistant')).toBe(true);
    expect(texts.persona.endsWith('dementia-support system.\n\n')).toBe(true);
    expect(texts.warmth).toBe('\n- Be warm, gentle, and emotionally supportive. Validate feelings before giving information. Caregiving is hard, and the person reading your response may be exhausted or distressed.');
    expect(texts.escalation111.startsWith('\n- If the situation described could be a medical emergency')).toBe(true);
    expect(texts.escalation111).toContain('call 111 at the START');
    // Line components are exactly one line (plus the newline before it).
    for (const c of ['warmth', 'escalation111', 'helplines']) expect(texts[c].split('\n').length).toBe(2);
    expect(texts.helplines.startsWith('\n- Where individual medical judgement is needed')).toBe(true);
    expect(texts.helplines).toContain('0800 611 116');
    expect(texts.helplines).toContain('0800 004 001');
    expect(texts.helplines).toContain('1737');
  });

  it('each variant equals v2 with exactly its components cut out, nothing else', () => {
    for (const [id, remove] of Object.entries(ABLATIONS)) {
      let expected = v2;
      for (const c of remove) expected = expected.replace(texts[c], '');
      expect(ABLATION_CONDITIONS[id].system({})).toBe(expected);
      expect(ABLATION_CONDITIONS[id].system({}).length).toBe(v2.length - remove.reduce((s, c) => s + texts[c].length, 0));
    }
  });

  it('(b) drops the persona and warmth but keeps the NZ helplines and the 111 rule', () => {
    const p = CONDITIONS['v2-nopersona'].system({});
    expect(p).not.toContain('You are Aria');
    expect(p).not.toContain('Be warm, gentle');
    expect(p.startsWith('Answer every question directly')).toBe(true);
    expect(p).toContain('call 111 at the START');
    expect(p).toContain('0800 611 116');
    expect(p).toContain('1737');
  });

  it('(c) drops every 111 and helpline mention but keeps the persona and the other safety rules', () => {
    const p = CONDITIONS['v2-nohelplines'].system({});
    for (const s of ['111', '0800 611 116', '0800 004 001', '1737', 'Healthline']) expect(p).not.toContain(s);
    expect(p).toContain('You are Aria');
    expect(p).toContain('Be warm, gentle');
    expect(p).toContain('SAFETY RULES');
    expect(p).toContain('Never state a specific medication dose');
    expect(p).toContain('Never diagnose');
    expect(p).toContain('GUIDELINES:\n- Be warm');
  });

  it('(d) drops all four; the passage, dosing, diagnosis, driving and citation rules remain', () => {
    const p = CONDITIONS['v2-nopersona-nohelplines'].system({});
    for (const s of ['You are Aria', 'Be warm', '111', '0800 611 116', '1737']) expect(p).not.toContain(s);
    expect(p).toContain('authoritative for New Zealand services and resources');
    expect(p).toContain('Never state a specific medication dose');
    expect(p).toContain('recommend a proper assessment by their GP');
    expect(p).toContain('If asked about driving after a diagnosis');
    expect(p).toContain('[S1]');
    expect(p).toContain('GUIDELINES:\n- If you use a medical or technical word');
  });

  it('is registered with the runner and uses the production user-content format', () => {
    for (const id of Object.keys(ABLATIONS)) {
      expect(resolveCondition(id).id).toBe(id);
      expect(CONDITIONS[id].region).toBe('NZ');
      expect(CONDITIONS[id].userContent('Q', [{ title: 'T', content: 'C', source_org: 'O' }]))
        .toBe(CONDITIONS.v2.userContent('Q', [{ title: 'T', content: 'C', source_org: 'O' }]));
    }
    // The deployed prompt itself is untouched by the ablation module.
    expect(CONDITIONS.v2.system({})).toBe(v2);
  });

  it('rejects an unknown component', () => {
    expect(() => buildSystemPromptV2Without(['tone'])).toThrow(/unknown v2 component/);
  });
});
