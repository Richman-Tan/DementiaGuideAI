// Shared fixtures for the e2e suite: provider mocks and localStorage seeding.
//
// Everything the app talks to is answered here, in the browser, before a
// request leaves the page:
//   - OpenAI embeddings and chat completions (BYO-key mode hits api.openai.com;
//     study mode hits the same-origin /api/embed and /api/chat proxies)
//   - Supabase `match_chunks` (the retrieval RPC, called directly by the client)
//   - the study API (/api/study/session|progress|event|complete)
//   - speech: OpenAI TTS and Whisper (direct and proxied), ElevenLabs REST
//     with-timestamps (direct and proxied) and the ElevenLabs stream-input
//     WebSocket, all answering with a short generated WAV / PCM clip
//   - the avatar models: every .glb is answered with a one-triangle model, so
//     the Three.js avatar loads in milliseconds instead of rendering a 26 MB
//     character in software WebGL (which starved later tests of frames)
//   - the Unity WebGL build, refused so the download never starts (or, with
//     installFakeUnity, a scripted stand-in for its loader)
//
// Browser APIs a headless run has no hardware for — the microphone, speech
// recognition and MediaRecorder — are replaced by scripted fakes in
// installFakeMedia(). An in-memory Supabase backend (auth + conversations) is
// in mockSupabase(), for the project that runs with Supabase configured.
//
// The chat completion is an SSE body carrying inline [S#] markers, so the real
// citation extractor, the marker stripper and the source drawer all run.
import { test as base, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Coverage (E2E_COVERAGE=1) ───────────────────────────────────────────────
// The dev server is instrumented by vite-plugin-istanbul (vite.config.js), so
// each loaded document keeps its counters in `window.__coverage__`. A full
// navigation starts a fresh document and loses them, so they are saved before
// every page.goto / page.reload and at the end of the test. Specs import
// `test` from here rather than from '@playwright/test' to get this.
const COVERAGE_DIR = process.env.E2E_COVERAGE === '1'
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.coverage-e2e')
  : null;

export const test = base.extend({
  page: async ({ page }, runTest, testInfo) => {
    if (!COVERAGE_DIR) {
      await runTest(page);
      return;
    }
    const snapshots = [];
    const save = async () => {
      try {
        const cov = await page.evaluate(() => window.__coverage__ || null);
        if (cov) snapshots.push(cov);
      } catch { /* page closed or not yet loaded — nothing to save */ }
    };
    for (const method of ['goto', 'reload']) {
      const original = page[method].bind(page);
      page[method] = async (...args) => { await save(); return original(...args); };
    }
    await runTest(page);
    await save();
    if (snapshots.length) {
      mkdirSync(COVERAGE_DIR, { recursive: true });
      const name = `${testInfo.testId}-${testInfo.retry}-${Date.now()}.json`;
      writeFileSync(path.join(COVERAGE_DIR, name), JSON.stringify(snapshots));
    }
  },
});

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

export const ELEVEN_KEY = 'el-e2e-not-a-real-key';

function safeJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/** A short mono 16-bit WAV with a quiet tone — real audio the browser decodes and plays. */
export function wav(seconds = 0.25, rate = 16000) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 6) * 1500), 44 + i * 2);
  return buf;
}

/** Raw 16-bit PCM at the stream's 22.05 kHz, base64 — one stream-input audio chunk. */
export function pcmBase64(seconds = 0.08, rate = 22050) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 5) * 1200), i * 2);
  return buf.toString('base64');
}

/** The ElevenLabs REST /with-timestamps body: audio plus per-character alignment. */
export function elevenRestBody(text = '', seconds = 0.25) {
  const characters = [...String(text)];
  return {
    audio_base64: wav(seconds).toString('base64'),
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * 0.02),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.02),
    },
  };
}

/** A valid one-triangle binary glTF, served in place of every avatar model. */
const TINY_GLB = (() => {
  const bin = Buffer.from(new Float32Array([0, 0, 0, 0.3, 0, 0, 0, 0.3, 0]).buffer);
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'e2e_triangle' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [0.3, 0.3, 0] }],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(bin, 0x004e4942)]);
})();

/**
 * Scripted stand-ins for the browser's audio-input stack, installed before the
 * app boots. A headless browser has no microphone and no speech service, so:
 *
 *   mic       'ok' → getUserMedia returns a real (silent) MediaStream from Web Audio;
 *             'denied' → rejects with NotAllowedError; 'missing' → NotFoundError
 *   live      true → a fake SpeechRecognition the test drives through
 *             window.__stt.say(text) / .fail(code); false → none (Whisper path)
 *   liveStartThrows  the recognizer refuses to start (the sticky Whisper degrade)
 *   recorderBytes    size of the clip a fake MediaRecorder hands back on stop
 *   recorder         false → no MediaRecorder at all (very old browsers)
 *   recorderTypes    the audio formats the fake recorder claims to support
 * window.__stt.micReleased() says whether every microphone stream was stopped.
 */
export async function installFakeMedia(page, {
  mic = 'ok', live = true, liveStartThrows = false, recorderBytes = 6000,
  recorder = true, recorderTypes = ['audio/webm;codecs=opus'],
} = {}) {
  await page.addInitScript(({ mic, live, liveStartThrows, recorderBytes, recorder, recorderTypes }) => {
    const stt = { instances: [], active: null, starts: 0, streams: [] };
    window.__stt = stt;
    stt.say = (text) => stt.active?.onresult?.({ results: [[{ transcript: text }]] });
    stt.fail = (code) => stt.active?.onerror?.({ error: code });

    navigator.mediaDevices.getUserMedia = async () => {
      if (mic === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
      if (mic === 'missing') throw new DOMException('Requested device not found', 'NotFoundError');
      const ctx = new AudioContext();
      const stream = ctx.createMediaStreamDestination().stream;
      stt.streams.push(stream);
      return stream;
    };
    // True once every microphone stream the app opened has been stopped.
    stt.micReleased = () => stt.streams.every((st) => st.getTracks().every((t) => t.readyState === 'ended'));

    class FakeMediaRecorder {
      static isTypeSupported(m) { return recorderTypes.includes(m); }
      constructor(stream, opts = {}) { this.stream = stream; this.mimeType = opts.mimeType || ''; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        const data = new Blob([new Uint8Array(recorderBytes)], { type: this.mimeType || 'audio/webm' });
        setTimeout(() => { this.ondataavailable?.({ data }); this.onstop?.(); }, 10);
      }
    }
    window.MediaRecorder = recorder ? FakeMediaRecorder : undefined;

    class FakeRecognition {
      constructor() { stt.instances.push(this); }
      start() {
        if (liveStartThrows) throw new Error('recognizer unavailable');
        stt.starts += 1;
        stt.active = this;
      }
      stop() { setTimeout(() => this.onend?.(), 20); }
      abort() { if (stt.active === this) stt.active = null; setTimeout(() => this.onend?.(), 0); }
    }
    window.SpeechRecognition = live ? FakeRecognition : undefined;
    window.webkitSpeechRecognition = live ? FakeRecognition : undefined;
  }, { mic, live, liveStartThrows, recorderBytes, recorder, recorderTypes });
}

/**
 * A scripted Unity WebGL build. The probe and the loader script are answered;
 * the loader's createUnityInstance reports progress and resolves only when the
 * test says so — window.__unity.progress(p), .ready(), .fail() — or at once with
 * `auto: true`. Every SendMessage payload lands in window.__unity.messages.
 */
export async function installFakeUnity(page, { auto = false } = {}) {
  await page.addInitScript(({ auto }) => {
    window.__unity = { auto, calls: 0, messages: [] };
  }, { auto });
  const loader = `
    window.createUnityInstance = function (canvas, config, onProgress) {
      var u = window.__unity;
      u.calls += 1;
      var instance = {
        SendMessage: function (obj, method, json) { u.messages.push(JSON.parse(json)); },
        Quit: function () {},
      };
      return new Promise(function (resolve, reject) {
        u.progress = onProgress;
        u.ready = function () { onProgress(1); resolve(instance); };
        u.fail = function (m) { reject(new Error(m || 'Unity build failed to start')); };
        if (u.auto) { onProgress(0.5); setTimeout(u.ready, 30); }
      });
    };`;
  await page.route(/\/unity\/Build\/unity\.loader\.js/, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: loader }));
  await page.route(/\/unity\/(Build\/(?!unity\.loader)|manifest\.json)/, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '' }));
}

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
export async function mockProviders(page, {
  answer = null, transcript = 'How do I manage sundowning in the evening?', audioSeconds = 0.25, streamChunkSeconds = 0.08,
} = {}) {
  // `warm` collects the study proxy's warm-up calls (a one-token chat and a
  // 'warm-up' embedding fired at session start and task start) so the per-turn
  // counts in `chat`/`embed` stay exact.
  const log = {
    chat: [], embed: [], warm: [], rpc: [],
    speech: [], eleven: [], transcribe: [], stream: [],
    study: { session: [], progress: [], event: [], complete: [] },
  };

  // Avatar models: a one-triangle GLB for every .glb (character and backdrop).
  // Matched on the URL's end so Vite's `model.glb?import` module stays real.
  await page.route(/\.glb$/, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: TINY_GLB }));

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
      body: sseFor(typeof answer === 'function' ? answer(body) : answer ?? answerFor(body)),
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
  // The proxy's audio routes double as the access-code check: an empty body
  // (the validation probe and the warm-up) gets the 400 an accepted code gets
  // from the real guard; a real request gets audio or a transcript.
  await page.route('**/api/transcribe', async (route) => {
    const multipart = /multipart\/form-data/.test(route.request().headers()['content-type'] || '');
    if (!multipart) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no audio"}' });
    log.transcribe.push({ proxied: true });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: transcript }) });
  });
  await page.route('**/api/speech', async (route) => {
    const body = safeJson(route.request().postData());
    if (!body?.input) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no input"}' });
    log.speech.push({ proxied: true, ...body });
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: wav(audioSeconds) });
  });
  await page.route('**/api/eleven-tts', async (route) => {
    const body = route.request().postDataJSON();
    log.eleven.push({ proxied: true, ...body });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(elevenRestBody(body.text, audioSeconds)) });
  });
  // Direct (personal key) speech.
  await page.route('https://api.openai.com/v1/audio/speech', async (route) => {
    log.speech.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: wav(audioSeconds) });
  });
  await page.route('https://api.openai.com/v1/audio/transcriptions', async (route) => {
    log.transcribe.push({ proxied: false });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: transcript }) });
  });
  await page.route(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/[^/]+\/with-timestamps/, async (route) => {
    const body = route.request().postDataJSON();
    log.eleven.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(elevenRestBody(body.text, audioSeconds)) });
  });
  // ElevenLabs stream-input: one PCM chunk with alignment per text message,
  // and isFinal on end-of-stream — the shape the streaming client consumes.
  await page.routeWebSocket(/^wss:\/\/api\.elevenlabs\.io\//, (ws) => {
    const session = { url: ws.url(), messages: [] };
    log.stream.push(session);
    ws.onMessage((raw) => {
      const msg = safeJson(raw) || {};
      session.messages.push(msg);
      if (msg.text === '') { ws.send(JSON.stringify({ isFinal: true })); return; }
      if (!msg.text || !msg.text.trim() || msg.xi_api_key) return;
      // Alignment stops at the last letter, as the service's does, so a word
      // can straddle two chunks.
      const chars = [...msg.text.trimEnd()];
      ws.send(JSON.stringify({
        audio: pcmBase64(streamChunkSeconds),
        alignment: { chars, charStartTimesMs: chars.map((_, i) => i * 20), charDurationsMs: chars.map(() => 20) },
      }));
    });
  });

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
    // the text arm comes first, which is what the Arm B flows need. A feedback
    // session has no arms, as the real endpoint answers.
    const feedback = body?.protocol === 'feedback';
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: SESSION_ID,
        participantCode: feedback ? 'P31' : 'P02',
        participantNumber: feedback ? 31 : 2,
        group: body?.group || 'caregiver',
        armOrder: feedback ? null : 'BA',
        setOrder: feedback ? null : '12',
        resumed: false, completed: false, studyVersion: 'e2e',
        protocol: feedback ? 'feedback' : 'tasks',
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

// ─── Supabase (the `supabase` project in playwright.config.js) ───────────────
// That project's server is built with this URL, so anonymous sign-in, the
// conversations tables and the account upgrade all run. Nothing leaves the
// browser: every call is answered by the in-memory backend below.
export const SUPABASE_URL = 'https://e2e-supabase.invalid';
export const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SUPABASE_STORAGE_KEY = 'sb-e2e-supabase-auth-token';

function sessionFor({ anonymous = true, email = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'e2e-access-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user: {
      id: USER_ID, aud: 'authenticated', role: 'authenticated', email: email || '', is_anonymous: anonymous,
      app_metadata: {}, user_metadata: {}, identities: [], created_at: new Date().toISOString(),
    },
  };
}

/**
 * An in-memory Supabase: anonymous sign-in, `conversations` and `messages`
 * (PostgREST), and updateUser for the account upgrade. `signedIn: 'email'`
 * restores a permanent (non-anonymous) session from storage instead of signing
 * in. Set `db.fail[name] = true` to make one kind of call fail:
 * signIn, lookup, createConversation, loadMessages, appendMessage, touch,
 * deleteAll, updateUser; each refusal is logged in `db.refused`.
 */
export async function mockSupabase(page, { signedIn = null, conversations = [], messages = [], fail = {} } = {}) {
  const db = { conversations: conversations.map((c) => ({ ...c })), messages: messages.map((m) => ({ ...m })), calls: [], refused: [], fail: { ...fail }, nextId: 1 };
  if (signedIn === 'email') {
    await page.addInitScript(({ key, session }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
    }, { key: SUPABASE_STORAGE_KEY, session: sessionFor({ anonymous: false, email: 'carer@example.nz' }) });
  }

  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
  const refuse = (route, name) => {
    db.refused.push(name);
    return json(route, 500, { message: `e2e: ${name} refused`, code: 'XX000' });
  };
  const params = (url) => Object.fromEntries(new URL(url).searchParams.entries());
  const eqVal = (v) => (v || '').replace(/^eq\./, '');

  await page.route(`${SUPABASE_URL}/auth/v1/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    db.calls.push(`${req.method()} ${url.pathname}`);
    if (url.pathname.endsWith('/signup')) {
      if (db.fail.signIn) db.refused.push('signIn');
      if (db.fail.signIn) return json(route, 422, { code: 422, error_code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' });
      return json(route, 200, sessionFor({ anonymous: true }));
    }
    if (url.pathname.endsWith('/user') && req.method() === 'PUT') {
      if (db.fail.updateUser) db.refused.push('updateUser');
      if (db.fail.updateUser) return json(route, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      const body = req.postDataJSON();
      db.linkedEmail = body.email;
      return json(route, 200, { ...sessionFor({ anonymous: true }).user, new_email: body.email });
    }
    if (url.pathname.endsWith('/user')) return json(route, 200, sessionFor({ anonymous: signedIn !== 'email' }).user);
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    return json(route, 200, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/conversations**`, async (route) => {
    const req = route.request();
    const q = params(req.url());
    const method = req.method();
    db.calls.push(`${method} conversations`);
    if (method === 'GET') {
      if (db.fail.lookup) return refuse(route, 'lookup');
      let rows = db.conversations.filter((c) => c.user_id === eqVal(q.user_id));
      if (q.study_arm === 'is.null') rows = rows.filter((c) => !c.study_arm);
      else if (q.study_arm) rows = rows.filter((c) => c.study_arm === eqVal(q.study_arm));
      rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      return json(route, 200, rows.slice(0, Number(q.limit || rows.length)).map((c) => ({ id: c.id })));
    }
    if (method === 'POST') {
      if (db.fail.createConversation) return refuse(route, 'createConversation');
      const body = req.postDataJSON();
      const row = { id: `conv-${db.nextId++}`, updated_at: new Date().toISOString(), ...body };
      db.conversations.push(row);
      return json(route, 201, { id: row.id });
    }
    if (method === 'PATCH') {
      if (db.fail.touch) return refuse(route, 'touch');
      return route.fulfill({ status: 204, body: '' });
    }
    if (method === 'DELETE') {
      if (db.fail.deleteAll) return refuse(route, 'deleteAll');
      const uid = eqVal(q.user_id);
      const gone = new Set(db.conversations.filter((c) => c.user_id === uid).map((c) => c.id));
      db.conversations = db.conversations.filter((c) => !gone.has(c.id));
      db.messages = db.messages.filter((m) => !gone.has(m.conversation_id));
      return route.fulfill({ status: 204, body: '' });
    }
    return json(route, 405, { message: 'e2e: unsupported' });
  });

  await page.route(`${SUPABASE_URL}/rest/v1/messages**`, async (route) => {
    const req = route.request();
    const q = params(req.url());
    db.calls.push(`${req.method()} messages`);
    if (req.method() === 'GET') {
      if (db.fail.loadMessages) return refuse(route, 'loadMessages');
      const rows = db.messages.filter((m) => m.conversation_id === eqVal(q.conversation_id));
      return json(route, 200, rows.map(({ role, content, citations, created_at }) => ({ role, content, citations, created_at })));
    }
    if (db.fail.appendMessage) return refuse(route, 'appendMessage');
    const body = req.postDataJSON();
    for (const row of Array.isArray(body) ? body : [body]) db.messages.push({ created_at: new Date().toISOString(), ...row });
    return route.fulfill({ status: 201, body: '' });
  });

  return db;
}

/** All study events flushed so far, flattened. */
export function studyEvents(log) {
  return log.study.event.flatMap((e) => e.body?.events || []);
}

/**
 * Seed localStorage before the app boots. `keys` puts a BYO OpenAI key in
 * place (so chat runs the real RAG path rather than mock mode) — `true` for the
 * OpenAI key alone, or an object such as `{ eleven: ELEVEN_KEY }` to add others;
 * `settings` is merged over the defaults with onboarding marked complete.
 * `history` seeds the chat cache, `study` a study session, `access` a guest
 * code. Seeding happens once per tab, so a test's page.reload() sees what the
 * app itself stored rather than the seed again.
 */
export async function seedStorage(page, { keys = true, settings = {}, history = null, study = null, access = null } = {}) {
  const keyBlob = keys ? { openai: OPENAI_KEY, eleven: '', azure: '', ...(keys === true ? {} : keys) } : null;
  await page.addInitScript(({ keyBlob, settings, history, study, access }) => {
    if (sessionStorage.getItem('dg_e2e_seeded')) return;
    sessionStorage.setItem('dg_e2e_seeded', '1');
    if (keyBlob) localStorage.setItem('dg_keys', JSON.stringify(keyBlob));
    localStorage.setItem('dg_settings', JSON.stringify({ onboarded: true, ...settings }));
    if (history) localStorage.setItem('dg_history', JSON.stringify(history));
    if (study) localStorage.setItem('dg_study', JSON.stringify(study));
    if (access) localStorage.setItem('dg_access', JSON.stringify(access));
  }, { keyBlob, settings, history, study, access });
}

/** Type a question in the chat screen and wait for the reply bubble to finish. */
export async function ask(page, question) {
  await page.getByLabel('Type your question').fill(question);
  await page.getByRole('button', { name: 'Send' }).click();
}

export { expect };
