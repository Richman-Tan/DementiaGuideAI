const {
  CONDITIONS, resolveCondition, buildSystemPromptV0, buildUserContentV0, buildSystemPromptV2NoSafety,
} = require('./promptVersions');
const { buildSystemPromptV2, buildSystemPrompt } = require('../../../packages/core/rag/prompt');

// The P0 prompt as it shipped from 2026-06-02 to 2026-07-15 with default
// options (git 7c75fc0^:src/lib/openaiService.js). Frozen here so the
// evaluation baseline cannot drift; verified byte-for-byte against the git
// source when this file was written.
const P0_DEFAULT_PROMPT = `You are Aria, a compassionate and knowledgeable AI assistant created to support family caregivers, healthcare workers, and families caring for people with dementia. You work like a specialised library — every answer you give is grounded in the curated knowledge passages provided to you.

IMPORTANT RULES:
1. Base your response ONLY on the context passages provided. Do not draw on outside knowledge.
2. If the context passages do not contain enough information to answer the question, say so honestly: "I don't have specific information about that in my knowledge base, but I recommend speaking with your GP or Dementia Australia (1800 100 500)."
3. Be warm, gentle, and emotionally supportive. Validate feelings before giving information. Caregiving is hard, and the person reading your response may be exhausted or distressed.
4. If you use a medical or technical word, immediately define it in plain language in parentheses — e.g. "lewy body dementia (a type of dementia that affects movement and memory)".
5. Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
6. After your response, on a new line, write "Sources:" followed by a bullet list of the knowledge base titles you drew from (one per line, starting with "·"). Only list sources you actually used.
7. Always end with a brief reminder that your information is for guidance only and that a healthcare professional should be consulted for individual medical decisions.`;

describe('p0 — resurrected library prompt', () => {
  it('reproduces the shipped text byte-for-byte at default options', () => {
    expect(buildSystemPromptV0()).toBe(P0_DEFAULT_PROMPT);
    expect(CONDITIONS.p0.system({})).toBe(P0_DEFAULT_PROMPT);
  });
  it('keeps the ONLY-context rule, the canned refusal and the disclaimer', () => {
    const p = buildSystemPromptV0();
    expect(p).toContain('Base your response ONLY on the context passages provided');
    expect(p).toContain("I don't have specific information about that in my knowledge base");
    expect(p).toContain('Dementia Australia (1800 100 500)');
    expect(p).toContain('7. Always end with a brief reminder');
  });
  it('honours the style options the shipped builder had', () => {
    expect(buildSystemPromptV0({ ariaPersonality: 'calm' })).toContain('3. Maintain a calm, steady');
    expect(buildSystemPromptV0({ jargonMode: 'avoid' })).toContain('4. Never use medical jargon');
    expect(buildSystemPromptV0({ conciseMode: true })).toContain('5. CONCISE MODE ON');
    expect(buildSystemPromptV0({ isCaregiversSetup: true }).startsWith('The person using this app is a family caregiver')).toBe(true);
  });
  it('wraps passages in the [CONTEXT] block and keeps the "nothing matched" line', () => {
    const withChunks = buildUserContentV0('Q?', [{ title: 'T1', content: 'C1' }, { title: 'T2', content: 'C2' }]);
    expect(withChunks).toBe('[CONTEXT]\n--- T1 ---\nC1\n\n--- T2 ---\nC2\n[/CONTEXT]\n\nUser question: Q?');
    expect(buildUserContentV0('Q?', [])).toBe('[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]\n\nUser question: Q?');
  });
});

describe('v2-nosafety — v2 minus exactly the SAFETY RULES block', () => {
  it('removes the block and nothing else', () => {
    const v2 = buildSystemPromptV2();
    const ablated = buildSystemPromptV2NoSafety();
    expect(ablated).not.toContain('SAFETY RULES');
    expect(ablated).not.toContain('call 111 at the START');
    expect(ablated).not.toContain('Never state a specific medication dose');
    // The two strings differ by one contiguous deletion.
    let prefix = 0;
    while (prefix < ablated.length && v2[prefix] === ablated[prefix]) prefix++;
    let suffix = 0;
    while (suffix < ablated.length - prefix && v2[v2.length - 1 - suffix] === ablated[ablated.length - 1 - suffix]) suffix++;
    const removed = v2.slice(prefix, v2.length - suffix);
    expect(ablated).toBe(v2.slice(0, prefix) + v2.slice(v2.length - suffix));
    // The blank line before the block means the common prefix may absorb one
    // "\n" — the deletion still starts at the SAFETY RULES heading.
    expect(removed.replace(/^\n/, '')).toMatch(/^SAFETY RULES/);
    expect(removed).toContain('never invent a source');
    expect(removed).not.toContain('GUIDELINES');
  });
  it('keeps the NZ persona, the NZ helplines and inline citations', () => {
    const ablated = buildSystemPromptV2NoSafety();
    expect(ablated).toContain('in New Zealand');
    expect(ablated).toContain('0800 611 116');
    expect(ablated).toContain('0800 004 001');
    expect(ablated).toContain('[S1]');
    expect(ablated).toContain('GUIDELINES:');
  });
});

describe('condition registry', () => {
  it('resolves ids and aliases', () => {
    expect(resolveCondition('v2-nz-safety').id).toBe('v2');
    expect(resolveCondition('production').id).toBe('v2');
    expect(resolveCondition('v0').id).toBe('p0');
    expect(() => resolveCondition('nope')).toThrow(/Unknown prompt condition/);
  });
  it('v2 is the production prompt; v1 is the frozen rollback', () => {
    expect(CONDITIONS.v2.system({})).toBe(buildSystemPrompt({}));
    expect(CONDITIONS.v1.system({})).toBe(buildSystemPrompt({}, 'v1'));
  });
  it('v2-trailing asks for a Sources list, not inline markers', () => {
    const p = CONDITIONS['v2-trailing'].system({});
    expect(p).toContain('"Sources:"');
    expect(p).not.toContain('[S1]');
    expect(CONDITIONS['v2-trailing'].userContent('Q', [{ title: 'T', content: 'C' }])).toContain('--- T ---');
    expect(CONDITIONS.v2.userContent('Q', [{ title: 'T', content: 'C', source_org: 'O' }])).toContain('[S1] T — O');
  });
  it('every condition builds a system prompt and user content', () => {
    for (const c of Object.values(CONDITIONS)) {
      expect(typeof c.system({})).toBe('string');
      expect(c.system({}).length).toBeGreaterThan(200);
      expect(c.userContent('What is sundowning?', [])).toContain('What is sundowning?');
      expect(['AU', 'NZ']).toContain(c.region);
      expect(['inline', 'trailing']).toContain(c.citationMode);
    }
  });
});
