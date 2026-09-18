// Fake req/res and module loading for the handler tests.
//
// The handlers are invoked directly with objects shaped like the platform's
// req/res. Modules that read env at load time (supabaseAdmin's adminConfigured,
// guard's DAILY_LIMIT) are re-imported through `load()` after the env stubs so
// each test sees the configuration it asked for.
import { vi } from 'vitest';
import { Readable } from 'node:stream';

export const CODE = 'study-code-0123456789abcdef'; // 28 chars, above the 16 minimum
export const ORIGIN = 'https://dementiaguide-web.vercel.app';

export function makeReq({
  method = 'POST', headers = {}, body, chunks = null, code = CODE, origin = ORIGIN,
} = {}) {
  const req = chunks ? Readable.from(chunks) : new Readable({ read() { this.push(null); } });
  req.method = method;
  req.headers = {
    ...(origin ? { origin } : {}),
    ...(code ? { 'x-study-code': code } : {}),
    ...headers,
  };
  req.body = body;
  return req;
}

export function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    chunks: [],
    ended: false,
    destroyed: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; this.ended = true; return this; },
    send(b) { this.body = b; this.ended = true; return this; },
    end() { this.ended = true; return this; },
    write(c) { this.chunks.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf8')); return true; },
    writeHead(c, h = {}) { this.statusCode = c; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); return this; },
    on() { return this; },
  };
  return res;
}

export const baseEnv = {
  STUDY_ACCESS_CODES: CODE,
  ALLOWED_ORIGINS: ORIGIN,
  OPENAI_API_KEY: 'sk-test',
  ELEVENLABS_API_KEY: 'el-test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
};

/**
 * Re-import a module under a given env, with the Supabase admin module replaced
 * by `admin` (default: configured, rpc allows everything).
 */
export async function load(modulePath, { env = {}, admin } = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...baseEnv, ...env })) {
    if (v === undefined) vi.stubEnv(k, ''); else vi.stubEnv(k, v);
  }
  const adminMock = {
    adminConfigured: true,
    rpc: vi.fn(async () => true),
    insertIgnoringConflicts: vi.fn(async (t, rows) => rows.length),
    selectOne: vi.fn(async () => null),
    insertReturning: vi.fn(async () => null),
    updateWhere: vi.fn(async () => ({})),
    ...admin,
  };
  vi.doMock('../api/_lib/supabaseAdmin.js', () => adminMock);
  const mod = await import(modulePath);
  return { mod, admin: adminMock };
}

/** A fetch stub returning one canned Response. */
export function stubFetch(response) {
  const fn = vi.fn(async () => (typeof response === 'function' ? response() : response));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
