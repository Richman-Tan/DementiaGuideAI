// Logic-level tests only (environment: node, no DOM) — matches apps/web's
// vitest convention. fileToBase64 (FileReader) is the one browser-only path
// and isn't covered here; everything else is plain functions.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validate, buildRequestBody, submitResource, CATEGORIES } from '../src/lib/api.js';

const baseFields = { sourceType: 'url', title: 'Evening confusion', category: CATEGORIES[0], url: 'https://example.com/a' };

describe('validate', () => {
  it('passes a well-formed url submission', () => {
    expect(validate(baseFields)).toBeNull();
  });
  it('rejects a missing title', () => {
    expect(validate({ ...baseFields, title: '  ' })).toMatch(/title/i);
  });
  it('rejects an unknown category', () => {
    expect(validate({ ...baseFields, category: 'not-real' })).toMatch(/category/i);
  });
  it('rejects a url submission with no url', () => {
    expect(validate({ ...baseFields, url: '' })).toMatch(/url/i);
  });
  it('rejects a pdf submission with no file', () => {
    expect(validate({ ...baseFields, sourceType: 'pdf', file: null })).toMatch(/file/i);
  });
  it('rejects a text submission with no text', () => {
    expect(validate({ ...baseFields, sourceType: 'text', text: '' })).toMatch(/text/i);
  });
});

describe('buildRequestBody', () => {
  it('trims strings and nulls out blank optional fields', () => {
    const body = buildRequestBody({ ...baseFields, sourceOrg: '  ', sourceUrl: '', licence: undefined, country: undefined }, 'payload-value');
    expect(body).toEqual({
      sourceType: 'url',
      payload: 'payload-value',
      title: 'Evening confusion',
      sourceOrg: null,
      sourceUrl: null,
      licence: null,
      category: CATEGORIES[0],
      country: null,
    });
  });

  it('keeps provided optional fields', () => {
    const body = buildRequestBody({ ...baseFields, sourceOrg: 'Alzheimers NZ', country: 'NZ' }, 'p');
    expect(body.sourceOrg).toBe('Alzheimers NZ');
    expect(body.country).toBe('NZ');
  });
});

describe('submitResource', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('posts to /api/admin/ingest with the Supabase access token as a Bearer header', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ document_id: 'admin-x', chunkCount: 1, chunks: [] }) });
    vi.stubGlobal('fetch', fetchStub);

    const data = await submitResource({ apiBaseUrl: 'https://api.example.com', accessToken: 'jwt-value', body: { a: 1 } });

    expect(fetchStub).toHaveBeenCalledWith('https://api.example.com/api/admin/ingest', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer jwt-value' }),
    }));
    expect(data.document_id).toBe('admin-x');
  });

  it('throws the server error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'category must be one of: …' }) }));
    await expect(submitResource({ apiBaseUrl: '', accessToken: 'jwt-value', body: {} })).rejects.toThrow(/category must be one of/);
  });
});
