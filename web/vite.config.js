import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
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
    plugins: [cjsLibsToEsm(), react()],
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
