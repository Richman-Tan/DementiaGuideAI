import type Anthropic from '@anthropic-ai/sdk';
import {
  createClaudeGenerate,
  createClaudeRewrite,
  createClaudeTriage,
  HELPER_MODEL,
  parseTriage,
  TRIAGE_CATEGORIES,
} from './claude.ts';
import type { GenerateEvent, GenerateRequest, HistoryMessage } from '../pipeline/types.ts';

// ─── A stand-in for the SDK client ───────────────────────────────────────────

interface FakeOptions {
  /** Events the answer stream yields. */
  events?: unknown[];
  /** What finalMessage() resolves to. */
  final?: Record<string, unknown>;
  /** What messages.create() resolves to. */
  reply?: Record<string, unknown>;
}

const TOP_LEVEL_USAGE = {
  input_tokens: 900,
  output_tokens: 120,
  cache_read_input_tokens: 600,
  cache_creation_input_tokens: null,
};

function fakeClient(options: FakeOptions = {}) {
  const calls: { stream: unknown[][]; create: unknown[][] } = { stream: [], create: [] };
  const events = options.events ?? [
    { type: 'message_start' },
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hm' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Keep afternoons ' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'calm [S1].' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  ];
  const final = options.final ?? {
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    usage: TOP_LEVEL_USAGE,
  };
  const client = {
    beta: {
      messages: {
        stream: (...args: unknown[]) => {
          calls.stream.push(args);
          return {
            async *[Symbol.asyncIterator]() {
              yield* events;
            },
            finalMessage: async () => final,
          };
        },
      },
    },
    messages: {
      create: async (...args: unknown[]) => {
        calls.create.push(args);
        return (
          options.reply ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }
        );
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const REQUEST: GenerateRequest = {
  model: 'claude-opus-5-5',
  maxTokens: 8000,
  effort: 'medium',
  system: { stable: 'You are Aaron. Safety rules…', perTurn: 'Answer briefly.' },
  history: [
    { role: 'user', content: 'How do I manage sundowning?' },
    { role: 'assistant', content: 'Keep afternoons calm.' },
  ],
  question: 'What about at night?',
  userText: '[S1] Night lights help.\n\nWhat about at night?',
  passages: [],
};

async function collect(events: AsyncIterable<GenerateEvent>) {
  const out: GenerateEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

// ─── generate ────────────────────────────────────────────────────────────────

describe('createClaudeGenerate', () => {
  it('sends the stable instructions first with the cache breakpoint, then the per-turn ones', async () => {
    const { client, calls } = fakeClient();
    await collect(createClaudeGenerate(client)(REQUEST));
    const [params, options] = calls.stream[0] as [Record<string, unknown>, unknown];
    expect(params).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      system: [
        {
          type: 'text',
          text: 'You are Aaron. Safety rules…',
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: 'Answer briefly.' },
      ],
      messages: [
        { role: 'user', content: 'How do I manage sundowning?' },
        { role: 'assistant', content: 'Keep afternoons calm.' },
        { role: 'user', content: '[S1] Night lights help.\n\nWhat about at night?' },
      ],
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(options).toBeUndefined();
  });

  it('never sends sampling parameters, which current models reject', async () => {
    const { client, calls } = fakeClient();
    await collect(createClaudeGenerate(client)(REQUEST));
    const params = (calls.stream[0] as [Record<string, unknown>])[0];
    expect(Object.keys(params)).not.toEqual(
      expect.arrayContaining(['temperature', 'top_p', 'top_k'])
    );
  });

  it('leaves out what the request does not set', async () => {
    const { client, calls } = fakeClient();
    const { effort: _effort, ...withoutEffort } = REQUEST;
    await collect(
      createClaudeGenerate(client)({ ...withoutEffort, system: { stable: 'Stable.', perTurn: '' } })
    );
    const params = (calls.stream[0] as [Record<string, unknown>])[0];
    expect(params.system).toEqual([
      { type: 'text', text: 'Stable.', cache_control: { type: 'ephemeral' } },
    ]);
    expect('output_config' in params).toBe(false);
  });

  it('asks for a server-side refusal fallback only on models that offer one', async () => {
    const { client, calls } = fakeClient();
    await collect(createClaudeGenerate(client)({ ...REQUEST, model: 'claude-haiku-5-5' }));
    const params = (calls.stream[0] as [Record<string, unknown>])[0];
    expect('fallbacks' in params).toBe(false);
    expect('betas' in params).toBe(false);
  });

  it('passes the abort signal as a request option', async () => {
    const { client, calls } = fakeClient();
    const signal = new AbortController().signal;
    await collect(createClaudeGenerate(client)({ ...REQUEST, signal }));
    expect((calls.stream[0] as unknown[])[1]).toEqual({ signal });
  });

  it('yields the answer text as it arrives, then usage, then why it stopped', async () => {
    const { client } = fakeClient();
    expect(await collect(createClaudeGenerate(client)(REQUEST))).toEqual([
      { type: 'text', text: 'Keep afternoons ' },
      { type: 'text', text: 'calm [S1].' },
      {
        type: 'usage',
        model: 'claude-opus-5-5',
        inputTokens: 900,
        outputTokens: 120,
        cacheReadTokens: 600,
        cacheWriteTokens: 0,
      },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('adds up every attempt after a fallback, and names the model that answered', async () => {
    const { client } = fakeClient({
      final: {
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        usage: {
          ...TOP_LEVEL_USAGE,
          iterations: [
            {
              type: 'message',
              input_tokens: 900,
              output_tokens: 10,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 700,
            },
            {
              type: 'fallback_message',
              input_tokens: 900,
              output_tokens: 120,
              cache_read_input_tokens: 600,
              cache_creation_input_tokens: 0,
            },
          ],
        },
      },
    });
    const events = await collect(createClaudeGenerate(client)(REQUEST));
    expect(events.find((e) => e.type === 'usage')).toEqual({
      type: 'usage',
      model: 'claude-opus-5',
      inputTokens: 1800,
      outputTokens: 130,
      cacheReadTokens: 600,
      cacheWriteTokens: 700,
    });
  });

  it.each([
    ['end_turn', 'end_turn'],
    ['max_tokens', 'max_tokens'],
    ['model_context_window_exceeded', 'max_tokens'],
    ['refusal', 'refusal'],
    ['stop_sequence', 'end_turn'],
    [null, 'end_turn'],
  ])('reports stop reason %j as %s', async (stopReason, expected) => {
    const { client } = fakeClient({
      final: { model: 'claude-opus-5-5', stop_reason: stopReason, usage: TOP_LEVEL_USAGE },
    });
    const events = await collect(createClaudeGenerate(client)(REQUEST));
    expect(events[events.length - 1]).toEqual({ type: 'stop', reason: expected });
  });
});

// ─── triage ──────────────────────────────────────────────────────────────────

const triageReply = (json: unknown) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
});

describe('createClaudeTriage', () => {
  it('asks the helper model for a verdict in a fixed JSON shape, once, within the time allowed', async () => {
    const { client, calls } = fakeClient({
      reply: triageReply({ level: 'emergency', categories: ['stroke'] }),
    });
    const signal = new AbortController().signal;

    const verdict = await createClaudeTriage(client)('His face is drooping', [], {
      signal,
      timeoutMs: 4000,
    });

    expect(verdict).toEqual({ level: 'emergency', categories: ['stroke'] });
    const [params, options] = calls.create[0] as [Record<string, any>, unknown];
    expect(params.model).toBe(HELPER_MODEL);
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema).toMatchObject({
      required: ['level', 'categories'],
      additionalProperties: false,
      properties: { level: { enum: ['none', 'caution', 'emergency'] } },
    });
    expect(params.output_config.format.schema.properties.categories.items.enum).toEqual([
      ...TRIAGE_CATEGORIES,
    ]);
    expect(params.messages).toEqual([
      { role: 'user', content: '<latest_message>\nHis face is drooping\n</latest_message>' },
    ]);
    expect(options).toEqual({ timeout: 4000, maxRetries: 0, signal });
  });

  it('tells the model to judge the situation, and to prefer the higher level when unsure', async () => {
    const { client, calls } = fakeClient({ reply: triageReply({ level: 'none', categories: [] }) });
    await createClaudeTriage(client)('hello', [], { timeoutMs: 1000 });
    const system = (calls.create[0] as [Record<string, string>])[0].system as string;
    expect(system).toContain('Judge what is happening, not which words appear');
    expect(system).toContain('choose the higher level');
    expect(system).toContain('hypotheticals');
    for (const category of TRIAGE_CATEGORIES) expect(system).toContain(category);
  });

  it('gives the model the recent conversation, shortened, as context', async () => {
    const history: HistoryMessage[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ role: 'user' as const, content: `old ${i}` })),
      { role: 'user', content: 'Dad seemed off at lunch' },
      { role: 'assistant', content: 'x'.repeat(700) },
      { role: 'user', content: 'He ate a little' },
      { role: 'assistant', content: 'Good.' },
    ];
    const { client, calls } = fakeClient({
      reply: triageReply({ level: 'caution', categories: ['other'] }),
    });
    await createClaudeTriage(client)('Now he will not wake up', history, { timeoutMs: 1000 });
    const content = (calls.create[0] as [Record<string, any>])[0].messages[0].content as string;
    expect(content).not.toContain('old 0');
    expect(content).not.toContain('old 1');
    expect(content).toContain('Carer: old 2\nCarer: old 3\nCarer: Dad seemed off at lunch');
    expect(content).toContain(`Assistant: ${'x'.repeat(600)}…\n`);
    expect(content).toContain('Assistant: Good.\n</conversation>');
    expect(content.endsWith('<latest_message>\nNow he will not wake up\n</latest_message>')).toBe(
      true
    );
  });

  it('does not ask a model that cannot switch thinking off to do so', async () => {
    const { client, calls } = fakeClient({ reply: triageReply({ level: 'none', categories: [] }) });
    await createClaudeTriage(client, { model: 'claude-sonnet-5-5' })('hi', [], { timeoutMs: 1000 });
    const params = (calls.create[0] as [Record<string, unknown>])[0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect('thinking' in params).toBe(false);
    expect((calls.create[0] as unknown[])[1]).toEqual({ timeout: 1000, maxRetries: 0 });
  });

  it.each([
    [
      'the model declined',
      { stop_reason: 'refusal', content: [] },
      'the model declined the request',
    ],
    ['the reply is not JSON', triageReply('not json'), 'JSON'],
    ['the level is unknown', triageReply({ level: 'severe', categories: [] }), 'expected shape'],
    [
      'the categories are not a list',
      triageReply({ level: 'none', categories: 'stroke' }),
      'expected shape',
    ],
    ['the reply is null', triageReply('null'), 'expected shape'],
    [
      'there is no text at all',
      { stop_reason: 'end_turn', content: [{ type: 'thinking' }] },
      'JSON',
    ],
  ])('fails, so the keyword floor takes over, when %s', async (_n, reply, message) => {
    const { client } = fakeClient({ reply });
    await expect(createClaudeTriage(client)('x', [], { timeoutMs: 1000 })).rejects.toThrow(message);
  });
});

describe('parseTriage', () => {
  it('drops categories outside the known list rather than passing them on', () => {
    expect(parseTriage('{"level":"caution","categories":["violence","made_up",7]}')).toEqual({
      level: 'caution',
      categories: ['violence'],
    });
  });
});

// ─── rewrite ─────────────────────────────────────────────────────────────────

describe('createClaudeRewrite', () => {
  const history: HistoryMessage[] = [
    { role: 'user', content: 'How do I manage sundowning?' },
    { role: 'assistant', content: 'Keep afternoons calm.' },
  ];

  it('returns the stand-alone question, trimmed', async () => {
    const { client, calls } = fakeClient({
      reply: {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '  How do I manage sundowning at night?\n' }],
      },
    });
    const signal = new AbortController().signal;

    const out = await createClaudeRewrite(client)('What about at night?', history, { signal });

    expect(out).toBe('How do I manage sundowning at night?');
    const [params, options] = calls.create[0] as [Record<string, any>, unknown];
    expect(params.model).toBe(HELPER_MODEL);
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.system).toContain('stand-alone question');
    expect(params.system).toContain('Reply with the question only');
    expect(params.messages[0].content).toBe(
      '<conversation>\nCarer: How do I manage sundowning?\nAssistant: Keep afternoons calm.\n</conversation>\n\n<latest_message>\nWhat about at night?\n</latest_message>'
    );
    expect(options).toEqual({ timeout: 4000, maxRetries: 0, signal });
  });

  it('can use another model, and sends no signal when there is none', async () => {
    const { client, calls } = fakeClient({
      reply: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'q' }] },
    });
    await createClaudeRewrite(client, { model: 'claude-opus-5-5' })('x', history, {});
    const [params, options] = calls.create[0] as [Record<string, unknown>, unknown];
    expect(params.model).toBe('claude-opus-5-5');
    expect('thinking' in params).toBe(false);
    expect(options).toEqual({ timeout: 4000, maxRetries: 0 });
  });

  it('fails when the model declines, so the message is searched as written', async () => {
    const { client } = fakeClient({ reply: { stop_reason: 'refusal', content: [] } });
    await expect(createClaudeRewrite(client)('x', history, {})).rejects.toThrow('declined');
  });

  it('returns an empty string when the reply has no text, which the pipeline treats as no rewrite', async () => {
    const { client } = fakeClient({ reply: { stop_reason: 'end_turn', content: [] } });
    expect(await createClaudeRewrite(client)('x', history, {})).toBe('');
  });
});
