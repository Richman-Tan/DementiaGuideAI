// Shared fixtures for the e2e suite: provider mocks and localStorage seeding.
//
// Everything the app talks to is answered here, in the browser, before a
// request leaves the page:
//   - OpenAI embeddings and chat completions (BYO-key mode hits api.openai.com;
//     study mode hits the same-origin /api/embed and /api/chat proxies)
//   - Supabase `match_chunks` (the retrieval RPC, called directly by the client)
//   - the study API (/api/study/session|progress|event|complete)
//   - the Unity WebGL build, refused so the download never starts
//
// The chat completion is an SSE body carrying inline [S#] markers, so the real
// citation extractor, the marker stripper and the source drawer all run.
import { expect } from '@playwright/test';

export const OPENAI_KEY = 'sk-e2e-not-a-real-key';
export const STUDY_ACCESS_CODE = 'e2e-study-access-code-0001';
export const SESSION_ID = '11111111-2222-4333-8444-555555555555';

/** Five retrieval rows in the shape `match_chunks` returns (see citations.js). */
export const CHUNKS = [
  {
    id: 'caregiving_001', document_id: 'caregiving_001', title: 'Managing sundowning in the evening',
    source_org: 'Alzheimers New Zealand', source_url: 'https://alzheimers.org.nz/sundowning',
    content: 'Sundowning is restlessness and confusion in the late afternoon and evening. Keep a calm routine, close the curtains before dusk and reduce noise.',
    similarity: 0.82,
  },
  {
    id: 'isupport_nz_c078', document_id: 'isupport_nz_c078', title: 'A calm routine at the end of the day',
    source_org: 'iSupport NZ', source_url: 'https://isupport.example.nz/c078',
    content: 'A predictable evening routine, low lighting and a quiet activity can reduce agitation.',
    similarity: 0.79,
  },
  {
    id: 'homesafety_003', document_id: 'homesafety_003', title: 'When to call for help',
    source_org: 'Healthline', source_url: 'https://healthline.example.nz/help',
    content: 'If someone collapses, stops breathing or cannot be woken, call 111 immediately.',
    similarity: 0.74,
  },
  {
    id: 'wellbeing_010', document_id: 'wellbeing_010', title: 'Looking after yourself as a carer',
    source_org: 'Alzheimers New Zealand', source_url: 'https://alzheimers.org.nz/carers',
    content: 'Carers need breaks. Respite and support groups are available through Alzheimers NZ.',
    similarity: 0.61,
  },
  {
    id: 'clinical_004', document_id: 'clinical_004', title: 'Talking to the GP',
    source_org: 'Health New Zealand', source_url: 'https://health.example.nz/gp',
    content: 'Your GP can review medicines and refer to specialist services.',
    similarity: 0.55,
  },
];

const EMBEDDING = Array.from({ length: 1536 }, (_, i) => ((i * 37) % 101) / 1000);

/** A caregiver answer with two inline markers that resolve to CHUNKS[0..1]. */
export const ANSWER_ROUTINE =
  'Evenings are often the hardest part of the day. A calm, predictable routine helps: '
  + 'close the curtains before dusk and keep noise down [S1]. Low lighting and a quiet activity '
  + 'such as music can settle things [S2]. If it keeps getting worse, talk to the GP.';

/** An emergency answer: escalates first, and cites the escalation passage. */
export const ANSWER_EMERGENCY =
  'Call 111 now and ask for an ambulance. If she is not breathing, the call handler will talk you '
  + 'through what to do until help arrives [S3]. Do not leave her alone.';

/** Build an OpenAI-shaped SSE stream for a piece of text, a few words per frame. */
export function sseFor(text) {
  const words = text.split(' ');
  const frames = [];
  for (let i = 0; i < words.length; i += 3) {
    const piece = (i === 0 ? '' : ' ') + words.slice(i, i + 3).join(' ');
    frames.push(`data: ${JSON.stringify({ id: 'chatcmpl-e2e', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
  }
  frames.push(`data: ${JSON.stringify({ id: 'chatcmpl-e2e', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2400, completion_tokens: 60, total_tokens: 2460 } })}\n\n`);
  frames.push('data: [DONE]\n\n');
  return frames.join('');
}

/** Pick the canned answer from the user's question. */
export function answerFor(body) {
  const user = [...(body?.messages || [])].reverse().find((m) => m.role === 'user');
  const content = String(user?.content || '');
  // buildUserContent() puts the retrieved passages first and the question last
  // on a "User question:" line; only the question decides the canned answer,
  // or a passage that mentions 111 would turn every reply into the emergency one.
  const q = content.includes('User question:') ? content.split('User question:').pop() : content;
  return /breath|collaps|emergency|111/i.test(q) ? ANSWER_EMERGENCY : ANSWER_ROUTINE;
}

/**
 * Install every provider mock on a page. Returns the captured request log so
 * a test can assert on what the app sent (max_tokens, study events, …).
 */
export async function mockProviders(page) {
  // `warm` collects the study proxy's warm-up calls (a one-token chat and a
  // 'warm-up' embedding fired at session start and task start) so the per-turn
  // counts in `chat`/`embed` stay exact.
  const log = { chat: [], embed: [], warm: [], rpc: [], study: { session: [], progress: [], event: [], complete: [] } };

  // Unity: refuse the loader probe, manifest and build files so nothing large
  // is fetched. Only the public build path — the app's own source modules also
  // live under an `avatar/unity/` directory in dev and must keep loading.
  await page.route(/\/unity\/(Build|manifest\.json)/, (route) => route.abort('blockedbyclient'));

  const chatHandler = async (route) => {
    const body = route.request().postDataJSON();
    (body?.max_tokens === 1 ? log.warm : log.chat).push(body);
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: sseFor(answerFor(body)),
    });
  };
  const embedHandler = async (route) => {
    const body = route.request().postDataJSON();
    (body?.input === 'warm-up' ? log.warm : log.embed).push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 0, embedding: EMBEDDING }], model: 'text-embedding-3-small', usage: { prompt_tokens: 12, total_tokens: 12 } }),
    });
  };

  // BYO-key mode.
  await page.route('https://api.openai.com/v1/chat/completions', chatHandler);
  await page.route('https://api.openai.com/v1/embeddings', embedHandler);
  // Study (proxied) mode — same-origin.
  await page.route('**/api/chat', chatHandler);
  await page.route('**/api/embed', embedHandler);
  await page.route('**/api/transcribe', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no audio"}' }));
  await page.route('**/api/speech', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no input"}' }));

  // Retrieval: the RPC is called by the client directly (any host).
  await page.route('**/rest/v1/rpc/match_chunks', async (route) => {
    log.rpc.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHUNKS) });
  });

  // Study API.
  await page.route('**/api/study/session', async (route) => {
    const body = route.request().postDataJSON();
    log.study.session.push({ headers: route.request().headers(), body });
    // Participant number 2 → Latin-square cell 2 → arm order BA, set order 12:
    // the text arm comes first, which is what the Arm B flows need.
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: SESSION_ID, participantCode: 'P02', participantNumber: 2,
        group: body?.group || 'caregiver', armOrder: 'BA', setOrder: '12',
        resumed: false, completed: false, studyVersion: 'e2e',
      }),
    });
  });
  await page.route('**/api/study/progress', async (route) => {
    log.study.progress.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/study/event', async (route) => {
    const req = route.request();
    // sendBeacon posts text/plain; fetch posts JSON. Parse both.
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch { body = null; }
    log.study.event.push({ headers: req.headers(), body });
    const n = body?.events?.length ?? 0;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ received: n, inserted: n }) });
  });
  await page.route('**/api/study/complete', async (route) => {
    log.study.complete.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  return log;
}

/** All study events flushed so far, flattened. */
export function studyEvents(log) {
  return log.study.event.flatMap((e) => e.body?.events || []);
}

/**
 * Seed localStorage before the app boots. `keys` puts a BYO OpenAI key in
 * place (so chat runs the real RAG path rather than mock mode); `settings`
 * is merged over the defaults with onboarding marked complete.
 */
export async function seedStorage(page, { keys = true, settings = {} } = {}) {
  await page.addInitScript(({ keys, settings, OPENAI_KEY }) => {
    if (keys) localStorage.setItem('dg_keys', JSON.stringify({ openai: OPENAI_KEY, eleven: '', azure: '' }));
    localStorage.setItem('dg_settings', JSON.stringify({ onboarded: true, ...settings }));
  }, { keys, settings, OPENAI_KEY });
}

/** Type a question in the chat screen and wait for the reply bubble to finish. */
export async function ask(page, question) {
  await page.getByLabel('Type your question').fill(question);
  await page.getByRole('button', { name: 'Send' }).click();
}

export { expect };
