import { runTurn } from './runTurn.ts';
import { promptV2 } from './promptV2.ts';
import { SECTION_DELIMITER } from './sections.ts';
import type {
  Chunk,
  GenerateEvent,
  GenerateRequest,
  PipelineConfig,
  PromptAdapter,
  Providers,
  TriageResult,
  TurnEvent,
  TurnInput,
  TurnSettings,
} from './types.ts';

const SETTINGS: TurnSettings = {
  assistantName: 'Aaron',
  responseStyle: 'balanced',
  jargonMode: 'explain',
  personality: 'warm',
  conciseMode: false,
  isCaregiverSetup: true,
};

const CHUNKS: Chunk[] = [
  {
    id: 'kb-1',
    title: 'sundowning-management',
    display_title: 'Managing evening restlessness',
    content: 'Keep late afternoons calm and well lit.',
    source_org: 'Alzheimers NZ',
    source_url: 'https://example.org/sundowning',
    similarity: 0.71,
  },
  {
    id: 'kb-2',
    title: 'carer-support',
    content: 'Carers NZ runs a support line.',
    source_org: 'Carers NZ',
    source_url: null,
    similarity: 0.52,
  },
];

// A prompt adapter that is easy to read in assertions, with sections switchable.
const plainPrompt = (sections: boolean): PromptAdapter => ({
  version: 'test-prompt',
  sections,
  system: (settings, modality) => ({
    stable: `You are ${settings.assistantName}.`,
    perTurn: `mode=${modality}`,
  }),
  user: (question, passages) =>
    passages.length
      ? `${passages.map((p, i) => `[S${i + 1}] ${p.content}`).join('\n')}\n\n${question}`
      : question,
});

const config = (overrides: Partial<PipelineConfig> = {}): PipelineConfig => ({
  pipelineVersion: 'test-1',
  generation: {
    text: { model: 'model-text', maxTokens: 4000, effort: 'medium' },
    voice: { model: 'model-voice', maxTokens: 2000 },
  },
  retrieval: { topK: 5, oversample: 10, minSimilarity: 0.25, maxPerSourceFamily: 2 },
  maxHistory: 6,
  prompt: plainPrompt(false),
  triageTimeoutMs: 4000,
  ...overrides,
});

const USAGE: GenerateEvent = {
  type: 'usage',
  model: 'model-text',
  inputTokens: 900,
  outputTokens: 120,
  cacheReadTokens: 600,
  cacheWriteTokens: 0,
};

interface FakeOptions {
  /** What the model streams back. */
  stream?: GenerateEvent[];
  search?: () => Promise<Chunk[]>;
  triage?: Providers['triage'];
  rewrite?: Providers['rewrite'];
  rerank?: Providers['rerank'];
  /** Called between generate events, so a test can do something mid-stream. */
  between?: (index: number) => void | Promise<void>;
  generateError?: Error;
}

function fakeProviders(options: FakeOptions = {}) {
  let clock = 0;
  const log: { embed: string[]; requests: GenerateRequest[] } = { embed: [], requests: [] };
  const stream = options.stream ?? [
    { type: 'text', text: 'Keep afternoons calm [S1].' },
    USAGE,
    { type: 'stop', reason: 'end_turn' },
  ];
  const providers: Providers = {
    now: () => (clock += 10),
    embed: async (text) => {
      log.embed.push(text);
      return [1, 0];
    },
    search: options.search ?? (async () => CHUNKS),
    generate: async function* (request) {
      log.requests.push(request);
      for (let i = 0; i < stream.length; i += 1) {
        if (options.generateError && i === 1) throw options.generateError;
        yield stream[i] as GenerateEvent;
        await options.between?.(i);
      }
    },
    ...(options.triage ? { triage: options.triage } : {}),
    ...(options.rewrite ? { rewrite: options.rewrite } : {}),
    ...(options.rerank ? { rerank: options.rerank } : {}),
  };
  return { providers, log };
}

const input = (overrides: Partial<TurnInput> = {}): TurnInput => ({
  message: 'How do I manage sundowning?',
  history: [],
  modality: 'text',
  settings: SETTINGS,
  ...overrides,
});

async function collect(turn: AsyncGenerator<TurnEvent>) {
  const events: TurnEvent[] = [];
  for await (const event of turn) events.push(event);
  return events;
}

const of = <T extends TurnEvent['type']>(events: TurnEvent[], type: T) =>
  events.filter((e): e is Extract<TurnEvent, { type: T }> => e.type === type);

const types = (events: TurnEvent[]) => events.map((e) => e.type);

describe('runTurn: a normal turn', () => {
  it('emits meta, retrieval, safety, tokens, final, usage, timings, done, in that order', async () => {
    const { providers } = fakeProviders();
    const events = await collect(runTurn(input(), providers, config()));
    expect(types(events)).toEqual([
      'meta',
      'retrieval',
      'safety',
      'token',
      'final',
      'usage',
      'timings',
      'done',
    ]);
    expect(events[0]).toEqual({
      type: 'meta',
      pipelineVersion: 'test-1',
      promptVersion: 'test-prompt',
      model: 'model-text',
      modality: 'text',
    });
    expect(of(events, 'done')[0]).toEqual({ type: 'done', stopReason: 'end_turn' });
  });

  it('reports what was retrieved, by carer-facing title, without the passage text', async () => {
    const { providers, log } = fakeProviders();
    const [retrieval] = of(await collect(runTurn(input(), providers, config())), 'retrieval');
    expect(log.embed).toEqual(['How do I manage sundowning?']);
    expect(retrieval).toMatchObject({ mode: 'fresh', query: 'How do I manage sundowning?' });
    expect(retrieval?.chunks).toEqual([
      {
        id: 'kb-1',
        title: 'Managing evening restlessness',
        org: 'Alzheimers NZ',
        url: 'https://example.org/sundowning',
        similarity: 0.71,
      },
      { id: 'kb-2', title: 'carer-support', org: 'Carers NZ', url: null, similarity: 0.52 },
    ]);
    expect(JSON.stringify(retrieval)).not.toContain('Keep late afternoons');
  });

  it('strips citation markers from the stream and resolves them in the final answer', async () => {
    const { providers } = fakeProviders({
      stream: [
        { type: 'text', text: 'Keep afternoons calm [S' },
        { type: 'text', text: '1]. Carers NZ can help [S2][S9].' },
        { type: 'stop', reason: 'end_turn' },
      ],
    });
    const events = await collect(runTurn(input(), providers, config()));
    const spoken = of(events, 'token')
      .map((t) => t.text)
      .join('');
    expect(spoken).toBe('Keep afternoons calm. Carers NZ can help.');
    const [final] = of(events, 'final');
    // [S9] names no supplied passage: a made-up citation is dropped, never shown.
    expect(final?.text).toBe('Keep afternoons calm [1]. Carers NZ can help [2].');
    // The model's own markers are kept too, for evaluation and traces.
    expect(final?.marked).toBe('Keep afternoons calm [S1]. Carers NZ can help [S2][S9].');
    expect(final?.sources.map((s) => [s.num, s.id, s.title])).toEqual([
      [1, 'kb-1', 'Managing evening restlessness'],
      [2, 'kb-2', 'carer-support'],
    ]);
    expect(final?.lead).toBe('Keep afternoons calm. Carers NZ can help.');
  });

  it('builds the request from the prompt adapter, the modality and the retrieved passages', async () => {
    const { providers, log } = fakeProviders();
    await collect(runTurn(input({ modality: 'voice' }), providers, config()));
    expect(log.requests).toHaveLength(1);
    expect(log.requests[0]).toEqual({
      model: 'model-voice',
      maxTokens: 2000,
      system: { stable: 'You are Aaron.', perTurn: 'mode=voice' },
      history: [],
      question: 'How do I manage sundowning?',
      userText:
        '[S1] Keep late afternoons calm and well lit.\n[S2] Carers NZ runs a support line.\n\nHow do I manage sundowning?',
      passages: CHUNKS,
    });
  });

  it('passes effort only when the configuration sets one', async () => {
    const { providers, log } = fakeProviders();
    await collect(runTurn(input(), providers, config()));
    expect(log.requests[0]?.effort).toBe('medium');
  });

  it('sends only the most recent history', async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 ? ('assistant' as const) : ('user' as const),
      content: `turn ${i}`,
    }));
    const { providers, log } = fakeProviders();
    await collect(runTurn(input({ history }), providers, config({ maxHistory: 4 })));
    expect(log.requests[0]?.history.map((m) => m.content)).toEqual([
      'turn 6',
      'turn 7',
      'turn 8',
      'turn 9',
    ]);
  });

  it('forwards usage and reports stage timings from the injected clock', async () => {
    const { providers } = fakeProviders();
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'usage')[0]).toEqual({ ...USAGE });
    const [timings] = of(events, 'timings');
    const { retrievalDone, llmSend, firstToken, streamEnd, total } = timings as Required<
      typeof timings
    > & {};
    expect(retrievalDone).toBeGreaterThan(0);
    expect(llmSend).toBeGreaterThan(retrievalDone as number);
    expect(firstToken).toBeGreaterThan(llmSend as number);
    expect(streamEnd).toBeGreaterThan(firstToken as number);
    expect(total).toBeGreaterThan(streamEnd as number);
  });

  it('runs the prompt the university evaluation measured, unchanged', async () => {
    const { providers, log } = fakeProviders();
    await collect(runTurn(input(), providers, config({ prompt: promptV2 })));
    const request = log.requests[0] as GenerateRequest;
    expect(request.system.stable).toContain('call 111 at the START of your answer');
    expect(request.system.stable).toContain('You are Aria');
    expect(request.userText).toContain('[S1] sundowning-management — Alzheimers NZ');
    expect(request.userText).toContain('User question: How do I manage sundowning?');
  });
});

describe('runTurn: retrieval', () => {
  it('uses passages retrieved ahead of the turn and skips the search', async () => {
    const { providers, log } = fakeProviders({
      search: () => Promise.reject(new Error('must not search')),
    });
    const events = await collect(
      runTurn(input({ retrieved: [CHUNKS[1] as Chunk] }), providers, config())
    );
    expect(log.embed).toEqual([]);
    expect(of(events, 'retrieval')[0]).toMatchObject({
      mode: 'prefetched',
      chunks: [{ id: 'kb-2' }],
    });
    expect(log.requests[0]?.passages).toEqual([CHUNKS[1]]);
  });

  it('answers without passages when the search finds none', async () => {
    const { providers, log } = fakeProviders({
      search: async () => [],
      stream: [
        { type: 'text', text: 'From general knowledge.' },
        { type: 'stop', reason: 'end_turn' },
      ],
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'retrieval')[0]).toMatchObject({ mode: 'none', chunks: [] });
    expect(log.requests[0]?.userText).toBe('How do I manage sundowning?');
    expect(of(events, 'final')[0]).toMatchObject({ text: 'From general knowledge.', sources: [] });
  });

  it('still answers when retrieval fails, and says that it failed', async () => {
    const { providers, log } = fakeProviders({
      search: () => Promise.reject(new Error('database down')),
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'retrieval')[0]).toMatchObject({ mode: 'failed', chunks: [] });
    expect(log.requests[0]?.passages).toEqual([]);
    expect(of(events, 'done')[0]?.stopReason).toBe('end_turn');
  });

  it('rewrites a follow-up into a stand-alone question before searching', async () => {
    const history = [
      { role: 'user' as const, content: 'How do I manage sundowning?' },
      { role: 'assistant' as const, content: 'Keep afternoons calm.' },
    ];
    const { providers, log } = fakeProviders({
      rewrite: async (message, past) => `${past[0]?.content} — ${message}`,
    });
    const events = await collect(
      runTurn(input({ message: 'What about at night?', history }), providers, config())
    );
    expect(log.embed).toEqual(['How do I manage sundowning? — What about at night?']);
    expect(of(events, 'retrieval')[0]?.query).toBe(
      'How do I manage sundowning? — What about at night?'
    );
    // The model is still asked the person's own words.
    expect(log.requests[0]?.question).toBe('What about at night?');
  });

  it('does not rewrite the first message of a conversation', async () => {
    const rewrite = jest.fn(async () => 'rewritten');
    const { providers, log } = fakeProviders({ rewrite });
    await collect(runTurn(input(), providers, config()));
    expect(rewrite).not.toHaveBeenCalled();
    expect(log.embed).toEqual(['How do I manage sundowning?']);
  });

  it.each([
    ['fails', () => Promise.reject(new Error('rewrite down'))],
    ['returns nothing', async () => '   '],
  ])('searches the message as written when the rewrite %s', async (_name, rewrite) => {
    const history = [{ role: 'user' as const, content: 'Earlier question' }];
    const { providers, log } = fakeProviders({ rewrite });
    await collect(
      runTurn(input({ message: 'What about at night?', history }), providers, config())
    );
    expect(log.embed).toEqual(['What about at night?']);
  });
});

describe('runTurn: lead and detail', () => {
  it('marks the spoken lead and the detail, and joins them in the final answer', async () => {
    const { providers } = fakeProviders({
      stream: [
        { type: 'text', text: 'Keep afternoons calm [S1].\n\n---det' },
        { type: 'text', text: `ail---\n\n1. Close the curtains.\n2. Carers NZ can help [S2].` },
        { type: 'stop', reason: 'end_turn' },
      ],
    });
    const events = await collect(
      runTurn(input(), providers, config({ prompt: plainPrompt(true) }))
    );
    const tokens = of(events, 'token');
    const say = (section: 'lead' | 'detail') =>
      tokens
        .filter((t) => t.section === section)
        .map((t) => t.text)
        .join('');
    expect(say('lead')).toBe('Keep afternoons calm.');
    expect(say('detail')).toBe('1. Close the curtains.\n2. Carers NZ can help.');
    const [final] = of(events, 'final');
    expect(final?.lead).toBe('Keep afternoons calm.');
    expect(final?.text).toBe(
      'Keep afternoons calm [1].\n\n1. Close the curtains.\n2. Carers NZ can help [2].'
    );
    expect(final?.text).not.toContain(SECTION_DELIMITER);
    expect(final?.marked).toBe(
      'Keep afternoons calm [S1].\n\n1. Close the curtains.\n2. Carers NZ can help [S2].'
    );
  });

  it('treats an answer with no delimiter as all lead', async () => {
    const { providers } = fakeProviders();
    const events = await collect(
      runTurn(input(), providers, config({ prompt: plainPrompt(true) }))
    );
    expect(of(events, 'token').every((t) => t.section === 'lead')).toBe(true);
    expect(of(events, 'final')[0]?.lead).toBe('Keep afternoons calm.');
  });

  it('leaves the delimiter alone when the prompt does not use sections', async () => {
    const { providers } = fakeProviders({
      stream: [
        { type: 'text', text: `One.\n${SECTION_DELIMITER}\nTwo.` },
        { type: 'stop', reason: 'end_turn' },
      ],
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'final')[0]?.text).toBe(`One.\n${SECTION_DELIMITER}\nTwo.`);
  });
});

describe('runTurn: safety', () => {
  const emergency: TriageResult = { level: 'emergency', categories: ['stroke'] };

  it('uses the keyword floor when there is no triage provider', async () => {
    const { providers } = fakeProviders();
    const events = await collect(
      runTurn(input({ message: "She won't wake up" }), providers, config())
    );
    expect(of(events, 'safety')).toEqual([
      { type: 'safety', level: 'emergency', categories: ['unresponsive'], source: 'keywords' },
    ]);
  });

  it('sends the triage verdict as soon as it is known, before the answer starts', async () => {
    const triage = jest.fn(async () => emergency);
    const { providers } = fakeProviders({ triage });
    const events = await collect(
      runTurn(input({ message: 'His face looks odd' }), providers, config())
    );
    expect(triage).toHaveBeenCalledWith('His face looks odd', [], {
      signal: undefined,
      timeoutMs: 4000,
    });
    expect(of(events, 'safety')).toEqual([
      { type: 'safety', level: 'emergency', categories: ['stroke'], source: 'triage' },
    ]);
    expect(types(events).indexOf('safety')).toBeLessThan(types(events).indexOf('token'));
  });

  it('sends a verdict that arrives mid-answer between tokens, once', async () => {
    let release: (value: TriageResult) => void = () => {};
    const triage = () => new Promise<TriageResult>((resolve) => (release = resolve));
    const { providers } = fakeProviders({
      triage,
      stream: [
        { type: 'text', text: 'First. ' },
        { type: 'text', text: 'Second. ' },
        { type: 'text', text: 'Third.' },
        { type: 'stop', reason: 'end_turn' },
      ],
      between: async (index) => {
        if (index === 0) {
          release(emergency);
          await Promise.resolve(); // let the verdict land before the next token
        }
      },
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'safety')).toHaveLength(1);
    const order = types(events);
    expect(order.indexOf('safety')).toBeGreaterThan(order.indexOf('token'));
    expect(order.indexOf('safety')).toBeLessThan(order.lastIndexOf('token'));
  });

  it('waits for a slow verdict before finishing, so none is ever lost', async () => {
    let release: (value: TriageResult) => void = () => {};
    const triage = () => new Promise<TriageResult>((resolve) => (release = resolve));
    const { providers } = fakeProviders({
      triage,
      between: (index) => {
        if (index === 2) setTimeout(() => release(emergency), 0); // after the stream has ended
      },
    });
    const order = types(await collect(runTurn(input(), providers, config())));
    expect(order.slice(-3)).toEqual(['safety', 'timings', 'done']);
  });

  it('falls back to the keyword floor when triage fails', async () => {
    const { providers } = fakeProviders({
      triage: () => Promise.reject(new Error('triage timed out')),
    });
    const events = await collect(
      runTurn(input({ message: 'Dad is choking' }), providers, config())
    );
    expect(of(events, 'safety')).toEqual([
      { type: 'safety', level: 'emergency', categories: ['breathing'], source: 'keywords' },
    ]);
  });

  it('reports "none" too, so a client knows the check ran', async () => {
    const { providers } = fakeProviders({
      triage: async () => ({ level: 'none', categories: [] }),
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'safety')).toEqual([
      { type: 'safety', level: 'none', categories: [], source: 'triage' },
    ]);
  });
});

describe('runTurn: when things go wrong', () => {
  it('sends no final answer after a refusal, but still sends the safety verdict', async () => {
    const { providers } = fakeProviders({
      triage: async () => ({ level: 'emergency', categories: ['self_harm'] }),
      stream: [{ type: 'text', text: 'I ' }, USAGE, { type: 'stop', reason: 'refusal' }],
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'final')).toEqual([]);
    expect(of(events, 'safety')[0]).toMatchObject({ level: 'emergency' });
    expect(of(events, 'usage')).toHaveLength(1);
    expect(of(events, 'done')[0]).toEqual({ type: 'done', stopReason: 'refusal' });
  });

  it('keeps a truncated answer and says it hit the length limit', async () => {
    const { providers } = fakeProviders({
      stream: [
        { type: 'text', text: 'A long answer that stops mid' },
        { type: 'stop', reason: 'max_tokens' },
      ],
    });
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'final')[0]?.text).toBe('A long answer that stops mid');
    expect(of(events, 'done')[0]?.stopReason).toBe('max_tokens');
  });

  it('reports a generation failure as an error, after the safety verdict', async () => {
    // The verdict is still on its way when the model fails: it must not be lost.
    let release: (value: TriageResult) => void = () => {};
    const { providers } = fakeProviders({
      triage: () => new Promise<TriageResult>((resolve) => (release = resolve)),
      generateError: new Error('upstream 529'),
      stream: [
        { type: 'text', text: 'Partial' },
        { type: 'stop', reason: 'end_turn' },
      ],
      between: () => {
        setTimeout(() => release({ level: 'emergency', categories: ['breathing'] }), 0);
      },
    });
    const events = await collect(
      runTurn(input({ message: "He can't breathe" }), providers, config())
    );
    const order = types(events);
    expect(order.slice(-2)).toEqual(['safety', 'error']);
    expect(events[events.length - 1]).toEqual({
      type: 'error',
      code: 'generation_failed',
      message: 'upstream 529',
      retryable: true,
    });
    expect(of(events, 'final')).toEqual([]);
    expect(of(events, 'done')).toEqual([]);
  });

  it('describes a failure that is not an Error object', async () => {
    const { providers } = fakeProviders();
    providers.generate = async function* () {
      yield* [];
      throw 'socket closed';
    };
    const events = await collect(runTurn(input(), providers, config()));
    expect(of(events, 'error')[0]?.message).toBe('socket closed');
  });

  it('stops quietly when the caller aborts mid-answer', async () => {
    const controller = new AbortController();
    const { providers } = fakeProviders({
      stream: [
        { type: 'text', text: 'First. ' },
        { type: 'text', text: 'Second.' },
        { type: 'stop', reason: 'end_turn' },
      ],
      between: (index) => {
        if (index === 0) controller.abort();
      },
    });
    const events = await collect(
      runTurn(input({ signal: controller.signal }), providers, config())
    );
    expect(of(events, 'final')).toEqual([]);
    expect(of(events, 'error')).toEqual([]);
    expect(types(events).slice(-2)).toEqual(['timings', 'done']);
    expect(of(events, 'done')[0]).toEqual({ type: 'done', stopReason: 'aborted' });
  });

  it('treats a provider throwing because of the abort as an abort, not a failure', async () => {
    const controller = new AbortController();
    const { providers } = fakeProviders();
    providers.generate = async function* () {
      yield { type: 'text', text: 'First. ' } as GenerateEvent;
      controller.abort();
      throw new Error('The operation was aborted');
    };
    const events = await collect(
      runTurn(input({ signal: controller.signal }), providers, config())
    );
    expect(of(events, 'error')).toEqual([]);
    expect(of(events, 'done')[0]?.stopReason).toBe('aborted');
  });

  it('stops before generating when the caller aborted during retrieval', async () => {
    const controller = new AbortController();
    const { providers, log } = fakeProviders({
      search: async () => {
        controller.abort();
        throw new Error('aborted');
      },
    });
    const events = await collect(
      runTurn(input({ signal: controller.signal }), providers, config())
    );
    expect(log.requests).toEqual([]);
    expect(types(events)).toEqual(['meta', 'timings', 'done']);
    expect(of(events, 'done')[0]?.stopReason).toBe('aborted');
  });

  it('passes the abort signal to the model request', async () => {
    const controller = new AbortController();
    const { providers, log } = fakeProviders();
    await collect(runTurn(input({ signal: controller.signal }), providers, config()));
    expect(log.requests[0]?.signal).toBe(controller.signal);
  });
});
