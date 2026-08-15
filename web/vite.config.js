import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoSrc = path.resolve(__dirname, '../src');

// The five deliberately-CommonJS mobile libs (see rag/ragConfig.js header).
// They are all `const X = …; module.exports = { shorthand list };` with at most
// a destructured require — convertible to ESM with two regexes. One transform
// used by BOTH dev serve and the Rollup build, so the pipelines can't diverge.
const CJS_LIBS = [
  'lib/rag/ragConfig.js',
  'lib/rag/prompt.js',
  'lib/rag/retrieval.js',
  'lib/rag/citations.js',
  'lib/voice/voiceConfig.js',
].map((p) => path.join(repoSrc, p));

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

export default defineConfig(({ mode }) => {
  // Env resolution, least→most specific: web/.env (local dev; git-ignored so
  // `vercel build` doesn't stage it) → .vercel/.env.<mode>.local (written by
  // `vercel pull`/`vercel build` from project settings) → real process env (CI).
  const env = {
    ...loadEnv(mode, __dirname, ''),
    ...loadEnv(mode, path.join(__dirname, '.vercel'), ''),
    ...process.env,
  };
  return {
    plugins: [cjsLibsToEsm(), unityBrotliHeaders(), react()],
    resolve: {
      alias: {
        '@': repoSrc,
        '@web': path.resolve(__dirname, 'src'),
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
      fs: { allow: [path.resolve(__dirname, '..')] },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
    },
  };
});
