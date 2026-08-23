import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoCore = path.resolve(__dirname, '../../packages/core');

// The six deliberately-CommonJS shared libs (see core/rag/ragConfig.js header).
// They are all `const X = …; module.exports = { shorthand list };` with at most
// a destructured require — convertible to ESM with two regexes. One transform
// used by BOTH dev serve and the Rollup build, so the pipelines can't diverge.
// A new CJS lib in packages/core has to be added here too, or the web build
// ships raw `module.exports`; apps/web/tests/interop.test.js is the canary.
const CJS_LIBS = ['rag/ragConfig.js', 'rag/prompt.js', 'rag/retrieval.js', 'rag/citations.js', 'voice/voiceConfig.js', 'brand/mark.js'].map(
  (p) => path.join(repoCore, p)
);

function cjsLibsToEsm() {
  return {
    name: 'dg-cjs-libs-to-esm',
    enforce: 'pre',
    transform(code, id) {
      if (!CJS_LIBS.includes(id)) return null;
      const out = code
        .replace(/const\s*\{([^}]+)\}\s*=\s*require\((['"][^'"]+['"])\);?/g, 'import {$1} from $2;')
        .replace(/module\.exports\s*=\s*\{/, 'export {');
      if (out.includes('module.exports') || out.includes('require(')) {
        throw new Error(`dg-cjs-libs-to-esm: unconverted CJS remains in ${id}`);
      }
      return { code: out, map: null };
    },
  };
}

// Unity's WebGL build ships brotli-compressed `.unityweb` files. Despite the
// opaque extension they are REAL brotli streams — the leading "UnityWeb
// Compressed Content (brotli)" text is a skippable brotli metadata block — so
// serving them with `Content-Encoding: br` lets the browser decompress them
// natively, off the main thread.
//
// This is not a micro-optimisation. Without the header the loader falls back to
// decompressing in JavaScript on the main thread: 245MB → 310MB took over
// twenty minutes and pinned the tab. Native decode of the same file is ~4s.
// The wasm also needs `Content-Type: application/wasm` or the browser refuses
// to stream-compile it (we send `X-Content-Type-Options: nosniff`).
//
// Production sends these from vercel.json; this plugin keeps dev and `vite
// preview` identical, and serves the bytes itself because vite's static
// middleware would otherwise stamp its own Content-Type over ours.
const UNITY_COMPRESSED_TYPES = {
  '.data.unityweb': 'application/octet-stream',
  '.framework.js.unityweb': 'text/javascript',
  '.wasm.unityweb': 'application/wasm',
};

function unityBrotliHeaders() {
  const publicDir = path.resolve(__dirname, 'public');
  const middleware = (req, res, next) => {
    const urlPath = (req.url || '').split('?')[0];
    if (!urlPath.startsWith('/unity/')) return next();
    const suffix = Object.keys(UNITY_COMPRESSED_TYPES).find((s) => urlPath.endsWith(s));
    if (!suffix) return next();

    const file = path.resolve(publicDir, '.' + decodeURIComponent(urlPath));
    if (!file.startsWith(publicDir + path.sep)) return next();
    let size;
    try {
      size = statSync(file).size;
    } catch {
      return next(); // no build synced — let the 404/probe path handle it
    }

    res.setHeader('Content-Encoding', 'br');
    res.setHeader('Content-Type', UNITY_COMPRESSED_TYPES[suffix]);
    res.setHeader('Content-Length', size); // compressed length, as the wire needs
    createReadStream(file).pipe(res);
  };
  // Block bodies on purpose: vite treats a value RETURNED from these hooks as a
  // post-hook to invoke later, and `middlewares.use()` returns the connect app
  // — which vite then calls with no arguments, crashing dev/preview/vitest.
  return {
    name: 'dg-unity-brotli-headers',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

// The backend is a separate service (apps/api, see the root vercel.json).
// `vercel dev` runs both together and is the faithful local setup — but it needs
// the CLI and a linked project, so this keeps plain `npm run web` self-sufficient
// by mounting apps/api's handlers as middleware.
//
// Same (req, res) contract Vercel gives them: a parsed JSON body (unless the
// route opts out via `config.api.bodyParser === false`) plus res.status() and
// res.json(). Dev only — `apply: 'serve'` keeps it out of the build entirely.
function studyApiDevServer() {
  // apps/api/api — the handlers sit in the `api/` directory Vercel serves
  // functions from, so the service root stays free for package.json and docs.
  const API_DIR = path.resolve(__dirname, '../api/api');
  return {
    name: 'dg-study-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const route = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '');
        // Route names come off the URL, so refuse anything that could climb out
        // of api/ before it reaches the filesystem.
        if (!/^[a-zA-Z0-9/_-]+$/.test(route) || route.includes('..')) {
          res.statusCode = 400;
          return res.end('bad route');
        }

        let mod;
        try {
          // Re-imported per request with a cache-buster so edits to a route are
          // picked up without restarting the dev server.
          mod = await server.ssrLoadModule(path.resolve(API_DIR, `${route}.js`));
        } catch (err) {
          if (err?.code === 'ERR_MODULE_NOT_FOUND' || /Failed to load url/.test(String(err?.message))) {
            return next();
          }
          server.config.logger.error(`[api] ${route}: ${err?.message ?? err}`);
          res.statusCode = 500;
          return res.end('api route failed to load');
        }

        const handler = mod.default;
        if (typeof handler !== 'function') return next();

        if (mod.config?.api?.bodyParser !== false) {
          req.body = await readJsonBody(req);
        }
        decorate(res);
        try {
          await handler(req, res);
        } catch (err) {
          server.config.logger.error(`[api] ${route}: ${err?.stack ?? err}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'handler threw' }));
          }
        }
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
    req.on('error', () => resolve(undefined));
  });
}

// The two response helpers Vercel adds; everything else is stock http.
function decorate(res) {
  // A double-send raises an unhandled 'error' on the response, which would take
  // the whole dev server down over one buggy route. On Vercel each invocation
  // is isolated, so this only ever bites locally — but it bites hard.
  res.on('error', () => {});
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (res.writableEnded) return res;
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  const send = res.send;
  if (!send) {
    res.send = (body) => {
      if (res.writableEnded) return res;
      res.end(Buffer.isBuffer(body) ? body : String(body));
      return res;
    };
  }
}

export default defineConfig(({ mode }) => {
  // Env resolution, least→most specific: apps/web/.env (local dev; git-ignored so
  // `vercel build` doesn't stage it) → .vercel/.env.<mode>.local (written by
  // `vercel pull`/`vercel build` from project settings) → real process env (CI).
  const env = {
    ...loadEnv(mode, __dirname, ''),
    ...loadEnv(mode, path.join(__dirname, '.vercel'), ''),
    ...process.env,
  };
  return {
    plugins: [cjsLibsToEsm(), unityBrotliHeaders(), studyApiDevServer(), react()],
    resolve: {
      alias: {
        // The web app resolves nothing out of the mobile tree — everything it
        // shares with mobile lives in packages/core. (The one remaining link is
        // scripts/extract-renderer.mjs, which *generates* three/renderer.js from
        // the mobile WebView source at build time; that reads the file with fs.)
        '@core': repoCore,
        '@web': path.resolve(__dirname, 'src'),
        // Shared 3D models live at the workspace root because both apps load
        // them. Aliased so neither app counts ../ levels to reach them.
        '@assets': path.resolve(__dirname, '../../assets'),
      },
    },
    define: {
      // supabaseService.ts reads the Expo-style env vars; map them to VITE_ ones
      // so the file is reused byte-for-byte.
      'process.env.EXPO_PUBLIC_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
    },
    assetsInclude: ['**/*.glb'],
    server: {
      fs: { allow: [path.resolve(__dirname, '../..')] },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
    },
  };
});
