import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// No packages/core dependency and no dev-time apps/api middleware (contrast
// apps/web/vite.config.js): this app always talks to a real apps/api origin
// over fetch, even in dev — point VITE_API_BASE_URL at a `vercel dev`
// instance or the deployed API. It's a one-page internal tool; that's a
// fair trade for not duplicating apps/web's ~60-line dev-middleware shim.
// Vite exposes VITE_-prefixed vars on import.meta.env natively — no custom
// `define` needed (contrast apps/web, which only adds one for an
// Expo-style process.env shim a shared file reads; this app has no such file).
export default defineConfig(({ mode }) => {
  return {
    envDir: __dirname,
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
      coverage: {
        provider: 'v8',
        include: ['src/**'],
        exclude: ['tests/**', '**/*.test.*'],
        reporter: ['json-summary', 'text-summary'],
        reportsDirectory: 'coverage',
      },
    },
  };
});
