// Knowledge-base admin intake: auth/validation must reject before any
// OpenAI/DB call happens, and a valid submission must land as
// review_status='pending' with the shape the migration expects.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load, ADMIN_TOKEN } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function adminReq(body, { token = ADMIN_TOKEN, headers = {} } = {}) {
  return makeReq({
    body,
    code: null, // this endpoint doesn't use the study access code at all
    headers: { ...(token ? { 'x-admin-token': token } : {}), ...headers },
  });
}

/** Routes fetch by URL + request body, since autoTag/simplifyTitle/embedBatch all hit chat/completions or embeddings. */
function stubOpenAI() {
  const fn = vi.fn(async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (String(url).includes('/chat/completions')) {
      const content = body.max_tokens === 60 ? '["sundowning", "evening agitation"]' : 'Evening confusion and agitation';
      return jsonOk({ choices: [{ message: { content } }] });
    }
    if (String(url).includes('/embeddings')) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      return jsonOk({ data: inputs.map((_, i) => ({ index: i, embedding: new Array(8).fill(0.01) })) });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonOk(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function post(body, { token, admin } = {}) {
  const { mod, admin: a } = await load('../api/admin/ingest.js', { admin });
  const res = makeRes();
  await mod.default(adminReq(body, { token }), res);
  return { res, admin: a };
}

describe('auth and validation reject before any OpenAI/DB call', () => {
  it('401s with no admin token, and touches neither fetch nor the DB', async () => {
    const fetchStub = stubOpenAI();
    const { res, admin } = await post(textBody(), { token: null });
    expect(res.statusCode).toBe(401);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(admin.insertManyReturning).not.toHaveBeenCalled();
  });

  it('401s with a wrong admin token', async () => {
    const { res } = await post(textBody(), { token: 'wrong-token-but-long-enough' });
    expect(res.statusCode).toBe(401);
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
    const fetchStub = stubOpenAI();
    const { res } = await post({ ...textBody(), sourceType: 'pdf', payload: 'A'.repeat(5_000_000) });
    expect(res.statusCode).toBe(413);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('happy path (pasted text)', () => {
  it('tags, titles, embeds, and writes rows as review_status=pending', async () => {
    stubOpenAI();
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
    stubOpenAI();
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
});

function textBody() {
  return {
    sourceType: 'text',
    payload: 'Sundowning is a pattern of increased confusion and agitation in the evening hours. '.repeat(5),
    title: 'Evening confusion in dementia',
    category: 'caregiving',
  };
}
