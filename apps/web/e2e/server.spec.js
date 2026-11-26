// The chat on the server's pipeline (the `server` project in
// playwright.config.js, built with VITE_TURN_ENDPOINT=on).
//
// A visitor with no key and no access code asks a question. The browser makes
// one request, to POST /api/turn, with the anonymous session the app gave them;
// the answer, its sources and the safety verdict all come back on that stream.
// The endpoint is answered here in the browser, in the format the real one
// writes (apps/api/src/sse.ts). Supabase is the in-memory one in support.js.
import { test, mockProviders, mockSupabase, seedStorage, ask, expect } from './support.js';

const SOURCE = {
  num: 1,
  id: 'kb-1',
  title: 'Managing evening restlessness',
  org: 'Alzheimers NZ',
  url: 'https://alzheimers.org.nz/sundowning',
  excerpt: 'Keep late afternoons calm and well lit.',
};

/** The events of one answered turn. */
function answered({ safety = 'none' } = {}) {
  return [
    {
      type: 'meta',
      pipelineVersion: 'v3-claude-nz@e2e',
      promptVersion: 'v3-claude-nz',
      model: 'claude-opus-5-5',
      modality: 'text',
    },
    {
      type: 'retrieval',
      mode: 'fresh',
      query: 'managing sundowning in the evening',
      ms: 412,
      chunks: [
        { id: 'kb-1', title: SOURCE.title, org: SOURCE.org, url: SOURCE.url, similarity: 0.71 },
        { id: 'kb-2', title: 'Carer support', org: 'Carers NZ', url: null, similarity: 0.42 },
      ],
    },
    { type: 'token', text: 'Keep the late afternoon calm and well lit.', section: 'lead' },
    {
      type: 'token',
      text: '1. Close the curtains at dusk.\n2. Keep a familiar routine.',
      section: 'detail',
    },
    {
      type: 'safety',
      level: safety,
      categories: safety === 'none' ? [] : ['unresponsive'],
      source: 'triage',
    },
    {
      type: 'final',
      text: 'Keep the late afternoon calm and well lit [1].\n\n1. Close the curtains at dusk.\n2. Keep a familiar routine.',
      marked:
        'Keep the late afternoon calm and well lit [S1].\n\n1. Close the curtains at dusk.\n2. Keep a familiar routine.',
      lead: 'Keep the late afternoon calm and well lit.',
      sources: [SOURCE],
    },
    {
      type: 'usage',
      model: 'claude-opus-5-5',
      inputTokens: 900,
      outputTokens: 120,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    { type: 'timings', retrievalDone: 430, firstToken: 1180, streamEnd: 3900, total: 3912 },
    { type: 'done', stopReason: 'end_turn' },
  ];
}

const DECLINED = [
  { type: 'retrieval', mode: 'none', query: 'q', chunks: [], ms: 5 },
  { type: 'safety', level: 'emergency', categories: ['self_harm'], source: 'keywords' },
  { type: 'timings', total: 300 },
  { type: 'done', stopReason: 'refusal' },
];

const stream = (events) => ({
  status: 200,
  headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
  body: events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
});

const refusal = (status, body) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Opens the chat as a visitor with nothing stored but their settings.
 * `respond(body, n)` answers the nth turn request; every request is recorded.
 */
async function open(page, respond, { settings = {} } = {}) {
  const providers = await mockProviders(page);
  await mockSupabase(page);
  const turns = [];
  await page.route('**/api/turn', async (route) => {
    const request = route.request();
    turns.push({ authorization: request.headers().authorization, body: request.postDataJSON() });
    await route.fulfill(respond(request.postDataJSON(), turns.length));
  });
  // A short conversation in place of the demo thread, which has callouts and
  // source chips of its own.
  await seedStorage(page, {
    keys: false,
    settings,
    history: [
      { role: 'user', text: 'Hello', time: '9:00 am' },
      { role: 'aria', text: 'Kia ora. How can I help?', time: '9:00 am' },
    ],
  });
  await page.goto('/#/app/chat');
  return { turns, providers };
}

const callout = (page) => page.getByText('If you need help now:');

test.describe('chat on the server pipeline, with no key and no access code', () => {
  test('a question is answered from one request to the server, with its source', async ({
    page,
  }) => {
    const { turns, providers } = await open(page, () => stream(answered()), {
      settings: { avatarId: 'ariana', ariaStyle: 'practical', concise: true },
    });

    await ask(page, 'How do I manage sundowning?');

    await expect(page.getByText('Keep the late afternoon calm and well lit')).toBeVisible();
    await expect(page.getByText('Close the curtains at dusk.')).toBeVisible();
    await expect(page.getByText('[S1]')).toHaveCount(0);

    // One request, carrying the anonymous session and the visitor's choices.
    expect(turns).toHaveLength(1);
    expect(turns[0].authorization).toBe('Bearer e2e-access-token');
    expect(turns[0].body).toEqual({
      message: 'How do I manage sundowning?',
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Kia ora. How can I help?' },
      ],
      modality: 'text',
      avatar: 'ariana',
      settings: {
        responseStyle: 'balanced',
        jargonMode: 'avoid',
        personality: 'practical',
        conciseMode: true,
        isCaregiverSetup: true,
      },
    });
    // Nothing was retrieved, embedded or generated from the browser.
    expect(providers.chat).toHaveLength(0);
    expect(providers.embed).toHaveLength(0);
    expect(providers.rpc).toHaveLength(0);

    // The citation opens the source the server sent.
    await page.getByRole('button', { name: 'Open source 1' }).last().click();
    const drawer = page.getByRole('dialog', { name: 'Source preview' });
    await expect(drawer.getByRole('heading', { name: SOURCE.title })).toBeVisible();
    await expect(drawer.getByText(SOURCE.org).first()).toBeVisible();

    // No help callout: the server judged the message, and found nothing.
    await expect(callout(page)).toHaveCount(0);
  });

  test('"How this answer was made" shows the search, the check, the time and the cost behind an answer', async ({
    page,
  }) => {
    await open(page, () => stream(answered()));
    await ask(page, 'How do I manage sundowning?');
    await expect(page.getByText('Close the curtains at dusk.')).toBeVisible();

    // Only the answer the server wrote has one, and it is closed until asked for.
    const panel = page.locator('details').filter({ hasText: 'How this answer was made' });
    await expect(panel).toHaveCount(1);
    await expect(panel.getByText('Searched for')).toBeHidden();
    await panel.getByText('How this answer was made').click();

    await expect(panel.getByText('“managing sundowning in the evening” (412 ms)')).toBeVisible();
    // Both passages found, with their scores, and which one the answer used.
    await expect(panel.getByText(`${SOURCE.title} (${SOURCE.org}), match 0.71`)).toBeVisible();
    await expect(panel.getByText(', cited as [1]')).toBeVisible();
    await expect(panel.getByText('Carer support (Carers NZ), match 0.42')).toBeVisible();
    await expect(panel.getByText('No emergency found, judged by a model')).toBeVisible();
    await expect(panel.getByText('search 430 ms, first words 1.2 s, finished 3.9 s')).toBeVisible();
    await expect(panel.getByText('900 in, 120 out')).toBeVisible();
    // 900 x 4 + 120 x 20 per million, at Opus 5.5's list price.
    await expect(
      panel.getByText('About US$0.0060 at list prices, for writing the answer alone.')
    ).toBeVisible();
    await expect(panel.getByText('claude-opus-5-5')).toBeVisible();
    await expect(panel.getByText('v3-claude-nz@e2e')).toBeVisible();
  });

  test('a follow-up carries the conversation so far', async ({ page }) => {
    const { turns } = await open(page, () => stream(answered()));
    await ask(page, 'How do I manage sundowning?');
    await expect(page.getByText('Close the curtains at dusk.')).toBeVisible();
    await ask(page, 'What about at night?');
    await expect.poll(() => turns.length).toBe(2);
    expect(turns[1].body.message).toBe('What about at night?');
    expect(turns[1].body.history.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(turns[1].body.history[2].content).toBe('How do I manage sundowning?');
    expect(turns[1].body.history[3].content).toContain(
      'Keep the late afternoon calm and well lit [1].'
    );
  });

  test('the help callout follows the server’s verdict, not the words in the question', async ({
    page,
  }) => {
    // "white" contains "hit": the old in-browser check raised the callout on it.
    const { turns } = await open(page, (body) =>
      stream(answered({ safety: /cannot rouse/.test(body.message) ? 'emergency' : 'none' }))
    );
    await ask(page, 'She keeps asking for her white cardigan');
    await expect(page.getByText('Close the curtains at dusk.')).toBeVisible();
    await expect(callout(page)).toHaveCount(0);

    // No trigger word at all, and the server calls it an emergency.
    await ask(page, 'He is very sleepy and I cannot rouse him');
    await expect.poll(() => turns.length).toBe(2);
    await expect(callout(page)).toHaveCount(1);
  });

  test('a declined answer leaves a plain line and still shows the help callout', async ({
    page,
  }) => {
    await open(page, () => stream(DECLINED));
    await ask(page, 'A question the model declines');
    await expect(
      page.getByText('I was not able to answer that. You could try asking it in a different way.')
    ).toBeVisible();
    await expect(callout(page)).toHaveCount(1);
  });

  test('over the daily limit says so, and Retry answers once there is room', async ({ page }) => {
    const { turns } = await open(page, (_body, n) =>
      n === 1
        ? refusal(429, { error: "The live demo has reached today's limit.", code: 'demo_limit' })
        : stream(answered())
    );
    await ask(page, 'How do I manage sundowning?');
    await expect(
      page.getByText('The live demo has reached today’s limit. It resets around midday NZ time.')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Close the curtains at dusk.')).toBeVisible();
    expect(turns).toHaveLength(2);
    expect(turns[1].body.message).toBe('How do I manage sundowning?');
  });

  test('an answer that fails part-way is reported, not left half-written', async ({ page }) => {
    await open(page, () =>
      stream([
        { type: 'retrieval', mode: 'fresh', query: 'q', chunks: [], ms: 40 },
        { type: 'token', text: 'Keep the late', section: 'lead' },
        {
          type: 'error',
          code: 'generation_failed',
          message: 'The assistant could not answer just now.',
          retryable: true,
        },
      ])
    );
    await ask(page, 'How do I manage sundowning?');
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toBeVisible();
    await expect(page.getByText('Keep the late')).toHaveCount(0);
  });
});
