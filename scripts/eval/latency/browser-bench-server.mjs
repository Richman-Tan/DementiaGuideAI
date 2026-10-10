// E4-B (docs/eval/evaluation-plan.md §18.4) harness server, used in-process by
// scripts/eval/latency/bench-browser.mjs. localhost only.
//
//  - Serves a production build of apps/web (SPA fallback) and the git-ignored
//    Unity WebGL build with the vercel.json cache / Content-Encoding headers.
//  - Mounts the UNCHANGED apps/api/api handlers on the same origin, with the
//    same (req, res) contract as studyApiDevServer in apps/web/vite.config.js:
//    a parsed JSON body unless the route opts out, plus res.status/res.json.
//  - Points the handlers' Supabase admin client at a local stub: the guard's
//    usage meter (bump_study_usage → study_usage rows) is answered `true`
//    locally, and ANY other admin call is refused and flagged — so nothing is
//    written to the production database. The real service-role key is never
//    loaded (the caller passes a dummy).
//  - TTS policy (§18.4 "TTS beyond the first sentence"): within a turn, the
//    first /api/eleven-tts request goes to the unchanged handler; later ones
//    are held until the first has been answered, then get a short silent
//    placeholder in the same JSON shape.
//  - Taps responses passively for spend: chat usage frames, embedding usage,
//    TTS characters, transcribe bytes and text.
import http from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.bin': 'application/octet-stream', '.data': 'application/octet-stream',
};
const UNITY_BR = {
  '.data.unityweb': 'application/octet-stream',
  '.framework.js.unityweb': 'text/javascript',
  '.wasm.unityweb': 'application/wasm',
};
const ROUTES = new Set(['chat', 'embed', 'transcribe', 'eleven-tts', 'speech']);

function readJsonBody(req) {
  return new Promise((done) => {
    if (req.method === 'GET' || req.method === 'HEAD') return done(undefined);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { if (!raw) return done(undefined); try { done(JSON.parse(raw)); } catch { done(undefined); } });
    req.on('error', () => done(undefined));
  });
}

// The two helpers Vercel adds (copied from apps/web/vite.config.js decorate()).
function decorate(res) {
  res.on('error', () => {});
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (res.writableEnded) return res;
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  if (!res.send) {
    res.send = (body) => { if (res.writableEnded) return res; res.end(Buffer.isBuffer(body) ? body : String(body)); return res; };
  }
}

function sendFile(res, file, headers = {}) {
  let size;
  try { size = statSync(file).size; } catch { res.statusCode = 404; return res.end('not found'); }
  res.writeHead(200, { 'Content-Length': size, ...headers });
  createReadStream(file).pipe(res);
}

/**
 * startHarnessServer({ distDir, unityDir, apiDir, placeholderMp3Base64, onViolation })
 * The caller sets OPENAI_API_KEY, ELEVENLABS_API_KEY and STUDY_ACCESS_CODES in
 * process.env before the first request; this function sets SUPABASE_URL and a
 * dummy SUPABASE_SERVICE_ROLE_KEY itself, before any handler is imported.
 */
export async function startHarnessServer({ distDir, unityDir, apiDir, placeholderMp3Base64, placeholderSec, onViolation }) {
  const stats = { turn: null, totals: { chatPrompt: 0, chatCompletion: 0, embedTokens: 0, elevenChars: 0, elevenRequests: 0, heldTts: 0, speechChars: 0, transcribeBytes: 0, adminCalls: 0, statuses: {} } };
  const newTurn = (id) => {
    let resolveFirst;
    const firstDone = new Promise((r) => { resolveFirst = r; });
    stats.turn = { id, requests: [], eleven: 0, elevenFirstChars: 0, held: 0, firstDone, resolveFirst, chat: null, embedTokens: 0, transcribe: null, speech: 0, errors: [] };
    return stats.turn;
  };

  // ── Supabase admin stub ────────────────────────────────────────────────────
  const stub = http.createServer((req, res) => {
    stats.totals.adminCalls++;
    const path = (req.url || '').split('?')[0];
    if (req.method === 'POST' && path === '/rest/v1/rpc/bump_study_usage') {
      req.resume();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('true');
    }
    onViolation?.(`admin stub refused ${req.method} ${path}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end('{"message":"E4-B stub: refused"}');
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const stubUrl = `http://127.0.0.1:${stub.address().port}`;
  // The handlers' admin client reads these at import (apps/api/api/_lib/supabaseAdmin.js),
  // and no handler has been imported yet: it can only ever reach the stub.
  process.env.SUPABASE_URL = stubUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'e4b-local-stub-not-a-key';
  delete process.env.VITE_SUPABASE_URL;

  const handlers = {};
  const loadHandler = async (route) => {
    if (!handlers[route]) handlers[route] = await import(pathToFileURL(resolve(apiDir, `${route}.js`)).href);
    return handlers[route];
  };

  const placeholder = (text) => {
    const chars = [...String(text || ' ')];
    const step = placeholderSec / Math.max(chars.length, 1);
    return {
      audio_base64: placeholderMp3Base64,
      alignment: {
        characters: chars,
        character_start_times_seconds: chars.map((_, i) => +(i * step).toFixed(4)),
        character_end_times_seconds: chars.map((_, i) => +((i + 1) * step).toFixed(4)),
      },
      normalized_alignment: null,
    };
  };

  async function api(req, res, route) {
    const turn = stats.turn;
    const t0 = Date.now();
    const rec = { route, t0, status: null, ms: null };
    turn?.requests.push(rec);
    let mod;
    try { mod = await loadHandler(route); } catch (err) {
      res.statusCode = 500; res.end('api route failed to load'); rec.status = 500; onViolation?.(`route ${route} failed to load: ${err.message}`); return;
    }
    if (mod.config?.api?.bodyParser !== false) req.body = await readJsonBody(req);
    decorate(res);
    res.on('finish', () => {
      rec.status = res.statusCode; rec.ms = Date.now() - t0;
      stats.totals.statuses[`${route}:${res.statusCode}`] = (stats.totals.statuses[`${route}:${res.statusCode}`] ?? 0) + 1;
      if (res.statusCode >= 400) turn?.errors.push(`${route} ${res.statusCode}`);
    });

    if (route === 'eleven-tts' && turn) {
      turn.eleven++;
      if (turn.eleven > 1) {
        // Hold, then answer locally: later sentences never reach ElevenLabs.
        turn.held++; stats.totals.heldTts++;
        await Promise.race([turn.firstDone, new Promise((r) => setTimeout(r, 8000))]);
        rec.placeholder = true;
        return res.status(200).json(placeholder(req.body?.text));
      }
      const chars = typeof req.body?.text === 'string' ? Math.min(req.body.text.length, 4000) : 0;
      turn.elevenFirstChars = chars; stats.totals.elevenChars += chars; stats.totals.elevenRequests++;
      res.on('finish', () => turn.resolveFirst());
      res.on('close', () => turn.resolveFirst());
    }
    if (route === 'speech') {
      const n = typeof req.body?.input === 'string' ? req.body.input.length : 0;
      stats.totals.speechChars += n; if (turn) turn.speech += n;
    }
    if (route === 'chat') {
      // Passive tap of the SSE stream for the usage frame (spend only).
      const w = res.write.bind(res);
      let tail = '';
      res.write = (chunk, ...a) => {
        tail = (tail + Buffer.from(chunk).toString('utf8')).slice(-4000);
        return w(chunk, ...a);
      };
      res.on('finish', () => {
        for (const line of tail.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          try {
            const u = JSON.parse(t.slice(5).trim())?.usage;
            if (u) {
              stats.totals.chatPrompt += u.prompt_tokens ?? 0; stats.totals.chatCompletion += u.completion_tokens ?? 0;
              if (turn) turn.chat = { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0, model: req.body?.model };
            }
          } catch { /* partial frame */ }
        }
      });
    }
    if (route === 'embed' || route === 'transcribe') {
      const j = res.json;
      res.json = (body) => {
        if (route === 'embed' && body?.usage) { stats.totals.embedTokens += body.usage.total_tokens ?? 0; if (turn) turn.embedTokens += body.usage.total_tokens ?? 0; }
        if (route === 'transcribe' && typeof body?.text === 'string' && turn) turn.transcribe = { text: body.text, bytes: Number(req.headers['content-length']) || null };
        return j(body);
      };
      if (route === 'transcribe') stats.totals.transcribeBytes += Number(req.headers['content-length']) || 0;
    }
    try { await mod.default(req, res); } catch (err) {
      onViolation?.(`handler ${route} threw: ${err?.message ?? err}`);
      if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"handler threw"}'); }
    }
  }

  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.startsWith('/api/')) {
      const route = urlPath.replace(/^\/api\//, '').replace(/\/+$/, '');
      if (!ROUTES.has(route)) { res.statusCode = 404; return res.end('not mounted in E4-B'); }
      return api(req, res, route);
    }
    if (urlPath.startsWith('/unity/')) {
      const file = resolve(unityDir, '.' + urlPath.slice('/unity'.length));
      if (!file.startsWith(resolve(unityDir) + sep) || !existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
      const suffix = Object.keys(UNITY_BR).find((s) => urlPath.endsWith(s));
      const cache = urlPath.endsWith('/manifest.json') ? 'no-cache' : 'public, max-age=86400';
      if (suffix) return sendFile(res, file, { 'Content-Encoding': 'br', 'Content-Type': UNITY_BR[suffix], 'Cache-Control': cache });
      return sendFile(res, file, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
    }
    let file = resolve(distDir, '.' + urlPath);
    if (!file.startsWith(resolve(distDir)) || !existsSync(file) || statSync(file).isDirectory()) file = resolve(distDir, 'index.html');
    const immutable = urlPath.startsWith('/assets/') || urlPath.startsWith('/draco/');
    return sendFile(res, file, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  });
  server.keepAliveTimeout = 30000;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    stubUrl,
    stats,
    beginTurn: newTurn,
    endTurn: () => { const t = stats.turn; stats.turn = null; return t; },
    close: async () => { await new Promise((r) => server.close(r)); await new Promise((r) => stub.close(r)); },
  };
}
