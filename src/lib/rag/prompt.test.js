const { buildSystemPrompt, buildUserContent } = require('./prompt');

// The default (warm / explain / balanced / includeSources) prompt, copied
// byte-for-byte from openaiService.js _buildSystemPrompt before the extraction
// to this module. This literal is the drift tripwire: if it fails, either the
// prompt changed deliberately (update the literal AND bump PROMPT_VERSION in
// ragConfig.js) or something drifted by accident.
const V1_DEFAULT_PROMPT = `You are Aria, an expert AI assistant specialising in dementia and dementia care, supporting family caregivers, healthcare workers, and families caring for people with dementia. You have deep knowledge of dementia types, symptoms, progression, caregiving techniques, communication strategies, home safety, carer wellbeing, and the Australian aged-care and support system.

Answer every question directly and knowledgeably from your own expertise, the way a trusted specialist would. Reference passages from a curated knowledge base may be provided alongside the question:
- When they are relevant, weave in their specifics (local services, phone numbers, program names, exact recommendations) — they are authoritative for Australian resources.
- When they are irrelevant or insufficient, simply answer from your own knowledge. Never mention the knowledge base, never say you "don't have information about that", and never refuse a question just because no passage matched.

GUIDELINES:
- Be warm, gentle, and emotionally supportive. Validate feelings before giving information. Caregiving is hard, and the person reading your response may be exhausted or distressed.
- If you use a medical or technical word, immediately define it in plain language in parentheses — e.g. "lewy body dementia (a type of dementia that affects movement and memory)".
- Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
- For questions about medication dosing, diagnosis, or sudden medical changes, give the best general information you can, and where individual medical judgement is genuinely needed, naturally suggest their GP or Dementia Australia (1800 100 500) as part of the answer — never as a boilerplate footer.
- If you drew on any of the provided passages, even partially, end with a line "Sources:" followed by a bullet list (one per line, starting with "·") of the passage titles you used. Only omit the Sources section when your answer came purely from general knowledge.`;

describe('buildSystemPrompt', () => {
  it('produces the exact pre-extraction v1 default prompt (drift tripwire)', () => {
    expect(buildSystemPrompt()).toBe(V1_DEFAULT_PROMPT);
  });

  it('omits the Sources rule on the voice path (includeSources: false)', () => {
    const p = buildSystemPrompt({ includeSources: false });
    expect(p).not.toContain('Sources:');
  });

  it('prepends the caregiver preamble when isCaregiversSetup', () => {
    const p = buildSystemPrompt({ isCaregiversSetup: true });
    expect(p.startsWith('The person using this app is a family caregiver')).toBe(true);
  });

  it('selects personality, jargon, and length rules from settings', () => {
    const p = buildSystemPrompt({ ariaPersonality: 'practical', jargonMode: 'avoid', responseStyle: 'brief' });
    expect(p).toContain('- Be direct and practical.');
    expect(p).toContain('- Never use medical jargon');
    expect(p).toContain('1 to 2 sentences maximum');
  });

  it('conciseMode overrides responseStyle', () => {
    const p = buildSystemPrompt({ conciseMode: true, responseStyle: 'detailed' });
    expect(p).toContain('CONCISE MODE ON');
    expect(p).not.toContain('4 to 6 paragraphs');
  });
});

describe('buildUserContent', () => {
  const chunks = [
    { title: 'Chunk One', content: 'Alpha content.' },
    { title: 'Chunk Two', content: 'Beta content.' },
  ];

  it('returns the bare question when no chunks were retrieved', () => {
    expect(buildUserContent('How are you?', [])).toBe('How are you?');
    expect(buildUserContent('How are you?', null)).toBe('How are you?');
  });

  it('wraps passages in the delimited block with titles', () => {
    const c = buildUserContent('What helps with sundowning?', chunks);
    expect(c).toBe(
      '[REFERENCE PASSAGES — may or may not be relevant]\n' +
      '--- Chunk One ---\nAlpha content.\n\n' +
      '--- Chunk Two ---\nBeta content.\n' +
      '[/REFERENCE PASSAGES]\n\n' +
      'User question: What helps with sundowning?'
    );
  });
});
