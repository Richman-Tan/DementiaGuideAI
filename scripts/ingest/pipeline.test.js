// Shared ingestion pipeline, extracted from ingest.mjs so apps/api's admin
// intake endpoint can reuse it. pdf-parse, jsdom and @mozilla/readability are
// all mocked: these tests are for this module's own orchestration (fetch
// headers/retry/error handling, how the parsed result is wired into
// textToChunks), not for the third-party parsers themselves — jsdom in
// particular ships a transitive ESM dependency the mobile Jest config's
// transform can't parse, which real Node (ingest.mjs's own CLI run) doesn't
// hit at all.
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({
      // Same shape as chunking.test.js's stripPdfBoilerplate fixture: a
      // running header repeated on every "page", unique body per page.
      text: Array.from({ length: 4 }, (_, i) =>
        `-- ${i + 1} of 4 --\niSupport Manual\nUnique body paragraph number ${i} with real content here.`,
      ).join('\n'),
    }),
  })),
}));

jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html) => ({ window: { document: { __html: html } } })),
}));

jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation((doc) => ({
    parse: jest.fn(() => {
      if (doc.__html.includes('NO_ARTICLE')) return null;
      const title = /<title>(.*?)<\/title>/.exec(doc.__html)?.[1] ?? null;
      const body = /<article>([\s\S]*?)<\/article>/.exec(doc.__html)?.[1] ?? '';
      return { title, textContent: body.replace(/<[^>]+>/g, '').trim() };
    }),
  })),
}));

const { pdfBufferToText, fetchUrlToArticle, textToChunks, makeOpenAIClient, withRetry } = require('./pipeline.js');

describe('pdfBufferToText', () => {
  it('strips the repeated running header and keeps unique body text', async () => {
    const text = await pdfBufferToText(Buffer.from('fake pdf bytes'));
    expect(text).not.toContain('iSupport Manual');
    expect(text).toContain('Unique body paragraph number 2');
  });
});

describe('fetchUrlToArticle', () => {
  const html = `<!doctype html><title>Managing sundowning</title><article>${'Sundowning causes evening confusion and agitation. '.repeat(20)}</article>`;

  afterEach(() => { jest.restoreAllMocks(); });

  it('extracts the article text and title via the DOM/Readability pipeline', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html });
    const article = await fetchUrlToArticle('https://example.com/sundowning');
    expect(article.text).toContain('Sundowning causes evening confusion');
    expect(article.title).toBe('Managing sundowning');
  });

  it('throws with the HTTP status on a failed fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchUrlToArticle('https://example.com/missing')).rejects.toThrow(/404/);
  });

  it('throws when the page has no extractable article', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'NO_ARTICLE' });
    await expect(fetchUrlToArticle('https://example.com/empty')).rejects.toThrow(/could not parse/);
  });
});

describe('textToChunks', () => {
  it('delegates to chunkDocument and returns id/title/content per chunk', () => {
    const chunks = textToChunks('A short paragraph about dementia care.', {
      idBase: 'admin_test_doc',
      sourceTitle: 'Test Source',
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('id');
    expect(chunks[0]).toHaveProperty('contentHash');
    expect(chunks[0].id.startsWith('admin_test_doc')).toBe(true);
  });
});

describe('makeOpenAIClient', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  function stubOpenAI() {
    global.fetch = jest.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      if (String(url).includes('/chat/completions')) {
        const content = body.max_tokens === 60 ? '["sundowning"]' : 'Evening confusion';
        return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
      }
      if (String(url).includes('/embeddings')) {
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        return { ok: true, json: async () => ({ data: inputs.map((_, i) => ({ index: i, embedding: [i] })) }) };
      }
      throw new Error(`unhandled fetch: ${url}`);
    });
  }

  it('autoTag parses the JSON array the model returns', async () => {
    stubOpenAI();
    const client = makeOpenAIClient('sk-test', { embeddingModel: 'text-embedding-3-small' });
    const tags = await client.autoTag({ id: 'c1', title: 't', content: 'content' });
    expect(tags).toEqual(['sundowning']);
  });

  it('simplifyTitleUnique retries with avoid once it collides, then records the winner', async () => {
    let call = 0;
    global.fetch = jest.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      call += 1;
      // First call returns a title that's already "used"; second call (with
      // the avoid clause injected) returns a distinct one.
      const content = body.messages[1].content.includes('already uses the title') ? 'Distinct Title' : 'Evening confusion';
      return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
    });
    const client = makeOpenAIClient('sk-test', { embeddingModel: 'text-embedding-3-small' });
    const used = new Set(['Evening confusion']);
    const title = await client.simplifyTitleUnique({ id: 'c1', title: 't', content: 'content' }, used);
    expect(title).toBe('Distinct Title');
    expect(call).toBe(2);
    expect(used.has('Distinct Title')).toBe(true);
  });

  it('embedBatch returns vectors sorted back into request order', async () => {
    stubOpenAI();
    const client = makeOpenAIClient('sk-test', { embeddingModel: 'text-embedding-3-small' });
    const vectors = await client.embedBatch(['a', 'b', 'c']);
    expect(vectors).toEqual([[0], [1], [2]]);
  });

  it('requires an embeddingModel', () => {
    expect(() => makeOpenAIClient('sk-test')).toThrow(/embeddingModel/);
  });
});

describe('withRetry', () => {
  it('retries a retryable failure and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry('test', async () => {
      attempts += 1;
      if (attempts < 2) throw new Error('503 upstream');
      return 'ok';
    }, 3, 1);
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry a non-retryable failure', async () => {
    let attempts = 0;
    await expect(withRetry('test', async () => { attempts += 1; throw new Error('bad input'); }, 3, 1))
      .rejects.toThrow('bad input');
    expect(attempts).toBe(1);
  });
});
