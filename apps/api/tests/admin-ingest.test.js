// Knowledge-base admin intake: auth (a verified Supabase session, checked
// against an email allowlist) and validation must reject before any
// OpenAI/DB call happens, and a valid submission must land as
// review_status='pending' with the shape the migration expects.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load, ADMIN_EMAIL } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Two hand-built minimal PDFs (no fixture files needed): one with a real text
// run, one with a page but zero text objects — pdf-parse succeeds on both
// (it only throws on a genuinely malformed structure), which is what makes
// them useful for exercising the "extracted nothing usable" branch without
// mocking pdf-parse (not possible here — it's required by pipeline.js via
// Node's own `require`, outside Vite's module graph, so vi.mock can't see it).
const TEXT_PDF_B64 =
  'JVBERi0xLjEKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNSAwIFI+Pj4+L01lZGlhQm94WzAgMCA0MDAgMjAwXS9Db250ZW50cyA0IDAgUj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNzk+PnN0cmVhbQpCVCAvRjEgMTggVGYgMjAgMTAwIFRkIChTdW5kb3duaW5nIGNhdXNlcyBldmVuaW5nIGNvbmZ1c2lvbiBpbiBkZW1lbnRpYS4pIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4K';
const EMPTY_PDF_B64 =
  'JVBERi0xLjEKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+L01lZGlhQm94WzAgMCAyMDAgMjAwXT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4K';

function adminReq(body, { token = 'valid-session-token', method = 'POST', headers = {} } = {}) {
  return makeReq({
    body,
    method,
    code: null, // this endpoint doesn't use the study access code at all
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
}

const ARTICLE_HTML =
  '<!doctype html><title>Sundowning</title><article>' +
  'Sundowning causes evening confusion and agitation in people with dementia. '.repeat(10) +
  '</article>';

/**
 * Routes fetch by URL + request body: /auth/v1/user for the Supabase login
 * check, /chat/completions and /embeddings for autoTag/simplifyTitle/embedBatch,
 * and the article URL itself for the sourceType='url' path (real jsdom +
 * Readability run against whatever HTML this returns).
 */
function stubBackends({ authEmail = ADMIN_EMAIL, authStatus = 200, authThrows = false } = {}) {
  const fn = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      if (authThrows) throw new Error('network down');
      return jsonOk(
        authStatus === 200 ? { email: authEmail } : { error: 'invalid token' },
        authStatus
      );
    }
    if (u.includes('example.com/article')) {
      return new Response(ARTICLE_HTML, { status: 200 });
    }
    const body = init?.body ? JSON.parse(init.body) : {};
    if (u.includes('/chat/completions')) {
      const content =
        body.max_tokens === 60
          ? '["sundowning", "evening agitation"]'
          : 'Evening confusion and agitation';
      return jsonOk({ choices: [{ message: { content } }] });
    }
    if (u.includes('/embeddings')) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      return jsonOk({
        data: inputs.map((_, i) => ({ index: i, embedding: new Array(8).fill(0.01) })),
      });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonOk(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function post(body, { token, method, admin, env, authEmail, authStatus, authThrows } = {}) {
  stubBackends({ authEmail, authStatus, authThrows });
  const { mod, admin: a } = await load('../api/admin/ingest.js', { env, admin });
  const res = makeRes();
  await mod.default(adminReq(body, { token, method }), res);
  return { res, admin: a };
}

describe('auth and validation reject before any OpenAI/DB call', () => {
  it('401s with no Authorization header, and never calls fetch at all', async () => {
    const { res } = await post(textBody(), { token: null });
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('401s when the Supabase session token is rejected (expired/invalid)', async () => {
    const { res } = await post(textBody(), { authStatus: 401 });
    expect(res.statusCode).toBe(401);
  });

  it('401s for a valid session whose email is not on the allowlist', async () => {
    const { res, admin } = await post(textBody(), { authEmail: 'stranger@example.com' });
    expect(res.statusCode).toBe(401);
    expect(admin.insertManyReturning).not.toHaveBeenCalled();
  });

  it('401s (not 500) when the Supabase auth check itself fails to even respond', async () => {
    const { res } = await post(textBody(), { authThrows: true });
    expect(res.statusCode).toBe(401);
  });

  it('405s a non-POST method', async () => {
    const { res } = await post(textBody(), { method: 'GET' });
    expect(res.statusCode).toBe(405);
  });

  it('answers an OPTIONS preflight without reaching auth at all', async () => {
    const { res } = await post(textBody(), { method: 'OPTIONS' });
    expect(res.statusCode).toBe(204);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('503s when Supabase admin credentials are not configured', async () => {
    // supabaseAdmin.js is mocked wholesale (helpers.js's load()), so env vars
    // don't reach its real adminConfigured check — override the mock directly.
    const { res } = await post(textBody(), { admin: { adminConfigured: false } });
    expect(res.statusCode).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('503s when OPENAI_API_KEY is not configured', async () => {
    const { res } = await post(textBody(), { env: { OPENAI_API_KEY: '' } });
    expect(res.statusCode).toBe(503);
  });

  it('400s on a missing payload', async () => {
    const { res } = await post({ ...textBody(), payload: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('400s on an unknown category', async () => {
    const { res } = await post({ ...textBody(), category: 'not-a-real-category' });
    expect(res.statusCode).toBe(400);
  });

  it('400s on a missing title', async () => {
    const { res } = await post({ ...textBody(), title: '' });
    expect(res.statusCode).toBe(400);
  });

  it('400s on an invalid sourceType', async () => {
    const { res } = await post({ ...textBody(), sourceType: 'carrier-pigeon' });
    expect(res.statusCode).toBe(400);
  });

  it('413s a PDF payload over the size cap without attempting to parse it', async () => {
    const { res } = await post({
      ...textBody(),
      sourceType: 'pdf',
      payload: 'A'.repeat(5_000_000),
    });
    expect(res.statusCode).toBe(413);
    // Auth still had to run (it's checked first), but no chat/completions or embeddings call.
    const calledUrls = global.fetch.mock.calls.map(([url]) => String(url));
    expect(calledUrls.every((u) => u.includes('/auth/v1/user'))).toBe(true);
  });
});

describe('extraction failures', () => {
  it('422s when the PDF cannot be parsed at all', async () => {
    const { res } = await post({
      ...textBody(),
      sourceType: 'pdf',
      payload: Buffer.from('not a pdf, just garbage bytes').toString('base64'),
    });
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toMatch(/could not read/i);
  });

  it('422s when extraction succeeds but finds no usable text', async () => {
    const { res } = await post({ ...textBody(), sourceType: 'pdf', payload: EMPTY_PDF_B64 });
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toMatch(/no usable text/i);
  });

  it('422s when a URL cannot be fetched', async () => {
    const fn = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return jsonOk({ email: ADMIN_EMAIL });
      if (u.includes('example.com/missing')) return new Response('', { status: 404 });
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fn);
    const { mod } = await load('../api/admin/ingest.js', {});
    const res = makeRes();
    await mod.default(
      adminReq({ ...textBody(), sourceType: 'url', payload: 'https://example.com/missing' }),
      res
    );
    expect(res.statusCode).toBe(422);
  });
});

describe('happy path (pasted text)', () => {
  it('tags, titles, embeds, and writes rows as review_status=pending', async () => {
    const { res, admin } = await post(textBody());

    expect(res.statusCode).toBe(200);
    expect(res.body.document_id).toMatch(/^admin-/);
    expect(res.body.chunkCount).toBeGreaterThan(0);

    expect(admin.insertManyReturning).toHaveBeenCalledTimes(1);
    const [table, rows] = admin.insertManyReturning.mock.calls[0];
    expect(table).toBe('knowledge_chunks');
    expect(rows.length).toBe(res.body.chunkCount);
    for (const row of rows) {
      expect(row.review_status).toBe('pending');
      expect(row.category).toBe('caregiving');
      expect(row.embedding).toEqual(new Array(8).fill(0.01));
      expect(row.document_id).toBe(res.body.document_id);
      expect(row.tags).toEqual(['sundowning', 'evening agitation']);
    }
  });

  it('uses the submitted sourceUrl/sourceOrg/licence/country verbatim', async () => {
    const { admin } = await post({
      ...textBody(),
      sourceUrl: 'https://alzheimers.org.nz/sundowning',
      sourceOrg: 'Alzheimers NZ',
      licence: 'internal',
      country: 'NZ',
    });
    const [, rows] = admin.insertManyReturning.mock.calls[0];
    expect(rows[0].source_url).toBe('https://alzheimers.org.nz/sundowning');
    expect(rows[0].source_org).toBe('Alzheimers NZ');
    expect(rows[0].licence).toBe('internal');
    expect(rows[0].country).toBe('NZ');
  });

  it('502s with no leaked detail when the DB write fails partway through', async () => {
    const { res } = await post(textBody(), {
      admin: { insertManyReturning: vi.fn().mockRejectedValue(new Error('connection reset')) },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).not.toContain('connection reset');
    expect(res.body.error).toMatch(/document_id 'admin-[a-z0-9-]+'/);
  });
});

describe('happy path (PDF)', () => {
  it('extracts real text from the PDF and writes it', async () => {
    const { res, admin } = await post({ ...textBody(), sourceType: 'pdf', payload: TEXT_PDF_B64 });
    expect(res.statusCode).toBe(200);
    expect(res.body.chunkCount).toBe(1);
    const [, rows] = admin.insertManyReturning.mock.calls[0];
    expect(rows[0].content).toMatch(/Sundowning causes evening confusion/);
  });
});

describe('happy path (URL)', () => {
  it('fetches the page, extracts the article, and defaults source_url to the submitted URL', async () => {
    const { res, admin } = await post({
      ...textBody(),
      sourceType: 'url',
      payload: 'https://example.com/article',
    });
    expect(res.statusCode).toBe(200);
    const [, rows] = admin.insertManyReturning.mock.calls[0];
    expect(rows[0].source_url).toBe('https://example.com/article');
    expect(rows[0].content).toMatch(/Sundowning causes evening confusion/);
  });
});

function textBody() {
  return {
    sourceType: 'text',
    payload:
      'Sundowning is a pattern of increased confusion and agitation in the evening hours. '.repeat(
        5
      ),
    title: 'Evening confusion in dementia',
    category: 'caregiving',
  };
}
