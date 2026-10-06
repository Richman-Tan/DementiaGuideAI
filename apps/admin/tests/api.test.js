// Logic-level tests only (environment: node, no DOM) — matches apps/web's
// vitest convention. fileToBase64 (FileReader) is the one browser-only path
// and isn't covered here; everything else is plain functions.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { validate, buildRequestBody, submitResource, getStoredToken, setStoredToken, CATEGORIES } from '../src/lib/api.js';

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

describe('getStoredToken / setStoredToken', () => {
  beforeEach(() => {
    // jsdom-free (environment: node) — stub a minimal sessionStorage.
    const store = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('round-trips a token', () => {
    setStoredToken('abc123');
    expect(getStoredToken()).toBe('abc123');
  });
  it('clears on an empty token', () => {
    setStoredToken('abc123');
    setStoredToken('');
    expect(getStoredToken()).toBe('');
  });
  it('returns empty string if sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(getStoredToken()).toBe('');
  });
});

describe('submitResource', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('posts to /api/admin/ingest with the admin token header', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ document_id: 'admin-x', chunkCount: 1, chunks: [] }) });
    vi.stubGlobal('fetch', fetchStub);

    const data = await submitResource({ apiBaseUrl: 'https://api.example.com', token: 'tok', body: { a: 1 } });

    expect(fetchStub).toHaveBeenCalledWith('https://api.example.com/api/admin/ingest', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-admin-token': 'tok' }),
    }));
    expect(data.document_id).toBe('admin-x');
  });

  it('throws the server error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'category must be one of: …' }) }));
    await expect(submitResource({ apiBaseUrl: '', token: 'tok', body: {} })).rejects.toThrow(/category must be one of/);
  });
});
