import { defineConfig } from 'vitest/config';

// The handlers are plain ESM over Node's fetch/FormData/Blob. Nothing here
// needs a DOM, and the tests stub `fetch` and the Supabase admin module rather
// than reach the network.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['api/**'],
      reporter: ['json-summary', 'text-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
