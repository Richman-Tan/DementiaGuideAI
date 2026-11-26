// The client for the server's pipeline (services/turnClient.js): what it sends
// to POST /api/turn, how it turns the event stream into the chat's streaming
// callbacks and final result, and how each way a turn can fail surfaces.
// Supabase's session and the network are stubbed; the stream parsing is real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  serverGenerate,
  serverPipelineEnabled,
  turnOptions,
  DECLINED_TEXT,
} from '../src/services/turnClient.js';
import { supabase } from '../src/services/supabase.js';

vi.mock('../src/services/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

const frame = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const SOURCE = {
  num: 1,
  id: 'kb-1',
  title: 'Managing evening restlessness',
  org: 'Alzheimers NZ',
  url: 'https://example.org/sundowning',
  excerpt: 'Keep late afternoons calm.',
};

const ANSWER = [
  { type: 'meta', pipelineVersion: 'v3@abc', promptVersion: 'v3', model: 'm', modality: 'text' },
  { type: 'retrieval', mode: 'fresh', query: 'q', chunks: [], ms: 40 },
  { type: 'safety', level: 'none', categories: [], source: 'triage' },
  { type: 'token', text: 'Keep afternoons', section: 'lead' },
  { type: 'token', text: ' calm. ', section: 'lead' },
  { type: 'token', text: 'Close the curtains.', section: 'detail' },
  {
    type: 'final',
    text: 'Keep afternoons calm [1].\n\nClose the curtains.',
    marked: 'Keep afternoons calm [S1].\n\nClose the curtains.',
    lead: 'Keep afternoons calm.',
    sources: [SOURCE],
  },
  {
    type: 'usage',
    model: 'm',
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  { type: 'timings', total: 900 },
  { type: 'done', stopReason: 'end_turn' },
];

/** Answers the next request with these events, as an event stream. */
function reply(events, { status = 200 } = {}) {
  const fetchFn = vi.fn(
    async () =>
      new Response(typeof events === 'string' ? events : events.map(frame).join(''), {
        status,
        headers: { 'Content-Type': status === 200 ? 'text/event-stream' : 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

const sent = (fetchFn) => JSON.parse(fetchFn.mock.calls[0][1].body);

beforeEach(() => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'session-token' } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('serverPipelineEnabled', () => {
  it('is on only when VITE_TURN_ENDPOINT is exactly "on"', () => {
    vi.stubEnv('VITE_TURN_ENDPOINT', '');
    expect(serverPipelineEnabled()).toBe(false);
    vi.stubEnv('VITE_TURN_ENDPOINT', 'true');
    expect(serverPipelineEnabled()).toBe(false);
    vi.stubEnv('VITE_TURN_ENDPOINT', 'on');
    expect(serverPipelineEnabled()).toBe(true);
  });
});

describe('turnOptions', () => {
  it('puts the app settings in the words the endpoint accepts', () => {
    expect(
      turnOptions({
        avatarId: 'ariana',
        ariaStyle: 'practical',
        responseStyle: 'thorough',
        jargon: 'fine',
        concise: true,
        setupType: 'exploring',
      })
    ).toEqual({
      avatar: 'ariana',
      settings: {
        responseStyle: 'detailed',
        jargonMode: 'ok',
        personality: 'practical',
        conciseMode: true,
        isCaregiverSetup: false,
      },
    });
  });

  it('falls back to the defaults for anything the endpoint would refuse', () => {
    const defaults = {
      avatar: 'aaron',
      settings: {
        responseStyle: 'balanced',
        jargonMode: 'explain',
        personality: 'warm',
        conciseMode: false,
        isCaregiverSetup: true,
      },
    };
    expect(turnOptions()).toEqual(defaults);
    expect(
      turnOptions({ avatarId: 'zhenja', ariaStyle: 'sarcastic', responseStyle: 'epic' })
    ).toEqual(defaults);
  });
});

describe('serverGenerate', () => {
  it('sends the turn to the endpoint with the session token', async () => {
    const fetchFn = reply(ANSWER);
    const signal = new AbortController().signal;
    await serverGenerate({
      question: 'What about at night?',
      settings: { avatarId: 'ariana', ariaStyle: 'calm' },
      history: [
        { role: 'user', text: 'How do I manage sundowning?' },
        { role: 'aria', text: 'Keep afternoons calm.' },
        { role: 'aria', text: 'half an ans', streaming: true },
        { role: 'aria', text: '' },
        { role: 'user', text: 'What about at night?' },
      ],
      signal,
      onToken: vi.fn(),
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/turn');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer session-token',
    });
    expect(init.signal).toBe(signal);
    expect(sent(fetchFn)).toEqual({
      message: 'What about at night?',
      // Finished turns only, in the endpoint's roles, without the question being asked.
      history: [
        { role: 'user', content: 'How do I manage sundowning?' },
        { role: 'assistant', content: 'Keep afternoons calm.' },
      ],
      modality: 'text',
      avatar: 'ariana',
      settings: {
        responseStyle: 'balanced',
        jargonMode: 'explain',
        personality: 'calm',
        conciseMode: false,
        isCaregiverSetup: true,
      },
    });
  });

  it('keeps an earlier question that only resembles the new one, and sends no history when there is none', async () => {
    let fetchFn = reply(ANSWER);
    await serverGenerate({
      question: 'And in the morning?',
      history: [{ role: 'user', text: 'What about at night?' }],
      onToken: vi.fn(),
    });
    expect(sent(fetchFn).history).toEqual([{ role: 'user', content: 'What about at night?' }]);

    fetchFn = reply(ANSWER);
    await serverGenerate({ question: 'Hello', onToken: vi.fn(), modality: 'voice' });
    expect(sent(fetchFn)).toMatchObject({ history: [], modality: 'voice', avatar: 'aaron' });
  });

  it('streams the answer as it grows: the lead, then the lead and the detail as two paragraphs', async () => {
    reply(ANSWER);
    const onToken = vi.fn();
    await serverGenerate({ question: 'q', onToken });
    expect(onToken.mock.calls.map(([text]) => text)).toEqual([
      'Keep afternoons',
      'Keep afternoons calm. ',
      'Keep afternoons calm.\n\nClose the curtains.',
    ]);
  });

  it('hands over the part to be spoken piece by piece, and none of the detail', async () => {
    reply(ANSWER);
    const onLeadToken = vi.fn();
    await serverGenerate({ question: 'q', onToken: vi.fn(), onLeadToken });
    expect(onLeadToken.mock.calls.map(([piece]) => piece)).toEqual(['Keep afternoons', ' calm. ']);
  });

  it('says when the part to be spoken is complete: as the detail begins, and once', async () => {
    reply(ANSWER);
    const order = [];
    await serverGenerate({
      question: 'q',
      onToken: (text) => order.push(`shown: ${text.length}`),
      onLeadToken: (piece) => order.push(`lead: ${piece}`),
      onLeadEnd: () => order.push('lead ended'),
    });
    expect(order).toEqual([
      'lead: Keep afternoons',
      'shown: 15',
      'lead:  calm. ',
      'shown: 22',
      'lead ended', // before the first of the detail is shown
      'shown: 42',
    ]);
  });

  it('says so at the end of an answer that has no detail', async () => {
    reply(ANSWER.filter((e) => !(e.type === 'token' && e.section === 'detail')));
    const onLeadEnd = vi.fn();
    await serverGenerate({ question: 'q', onToken: vi.fn(), onLeadEnd });
    expect(onLeadEnd).toHaveBeenCalledTimes(1);
  });

  it('marks the stage boundaries for the latency timer, in order', async () => {
    reply(ANSWER);
    const onStage = vi.fn();
    await serverGenerate({ question: 'q', onToken: vi.fn(), onStage });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
      'ragDone',
      'llmSend',
      'firstToken',
      'firstToken',
      'firstToken',
    ]);
  });

  it('resolves with the finished answer, its citations and no safety flag', async () => {
    reply(ANSWER);
    expect(await serverGenerate({ question: 'q', onToken: vi.fn() })).toEqual({
      text: 'Keep afternoons calm [1].\n\nClose the curtains.',
      lead: 'Keep afternoons calm.',
      citations: [
        {
          num: 1,
          title: 'Managing evening restlessness',
          org: 'Alzheimers NZ',
          url: 'https://example.org/sundowning',
          excerpt: 'Keep late afternoons calm.',
          // The source matches a library article, so the drawer can link to it.
          articleId: 'managing-sundowning',
          cat: 'caregiving',
        },
      ],
      sources: [SOURCE],
      safety: false,
      safetyLevel: 'none',
    });
  });

  it.each(['emergency', 'caution'])(
    'raises the help callout on the server’s verdict (%s), wherever it arrives in the stream',
    async (level) => {
      const verdict = { type: 'safety', level, categories: ['unresponsive'], source: 'triage' };
      // After the answer's text, as happens when triage is slower than the model.
      reply([...ANSWER.filter((e) => e.type !== 'safety').slice(0, -1), verdict, ANSWER.at(-1)]);
      expect(await serverGenerate({ question: 'q', onToken: vi.fn() })).toMatchObject({
        safety: true,
        safetyLevel: level,
      });
    }
  );

  it('shows a plain line when the model declines, and keeps the safety verdict', async () => {
    reply([
      { type: 'retrieval', mode: 'none', query: 'q', chunks: [], ms: 5 },
      { type: 'token', text: 'I ca', section: 'lead' },
      { type: 'safety', level: 'emergency', categories: ['self_harm'], source: 'keywords' },
      { type: 'timings', total: 300 },
      { type: 'done', stopReason: 'refusal' },
    ]);
    expect(await serverGenerate({ question: 'q', onToken: vi.fn() })).toEqual({
      text: DECLINED_TEXT,
      lead: '',
      citations: [],
      sources: [],
      safety: true,
      safetyLevel: 'emergency',
    });
  });

  it('throws when the answer fails part-way, with the server’s reason code', async () => {
    reply([
      ANSWER[1],
      {
        type: 'error',
        code: 'generation_failed',
        message: 'The assistant could not answer just now.',
        retryable: true,
      },
    ]);
    await expect(serverGenerate({ question: 'q', onToken: vi.fn() })).rejects.toMatchObject({
      name: 'TurnRequestError',
      code: 'generation_failed',
      message: 'The assistant could not answer just now.',
    });
  });

  it('passes on the server’s refusal of the request, such as the daily limit', async () => {
    reply(JSON.stringify({ error: 'limit', code: 'demo_limit' }), { status: 429 });
    await expect(serverGenerate({ question: 'q', onToken: vi.fn() })).rejects.toMatchObject({
      name: 'TurnRequestError',
      status: 429,
      code: 'demo_limit',
    });
  });

  it.each([
    ['there is no session', { data: { session: null } }],
    ['the session has no token', { data: { session: {} } }],
    ['Supabase returns nothing', {}],
  ])('asks for nothing when %s', async (_name, result) => {
    const fetchFn = reply(ANSWER);
    supabase.auth.getSession.mockResolvedValue(result);
    await expect(serverGenerate({ question: 'q', onToken: vi.fn() })).rejects.toMatchObject({
      name: 'TurnRequestError',
      status: 401,
      code: 'no_session',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a message longer than the endpoint accepts, before asking for anything', async () => {
    const fetchFn = reply(ANSWER);
    await expect(
      serverGenerate({ question: 'a'.repeat(2001), onToken: vi.fn() })
    ).rejects.toMatchObject({ status: 400, code: 'message_too_long' });
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
