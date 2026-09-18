// End-to-end tests of the assembled web app with every provider mocked at the
// network layer (see e2e/support.js). No keys, no network: OpenAI, Supabase and
// the study API are answered by page.route() fixtures, and the Unity build is
// refused so the ~240 MB download never starts.
//
// The dev server (`vite`) is used rather than a production preview: the
// studyApiDevServer middleware and the CJS→ESM transform are the same code the
// preview uses, the routes are intercepted in the browser before they reach
// any server, and skipping the build keeps a local run under a minute.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The study's browser gate reads the UA family; headless Chromium's UA
    // still says Chrome/, but pin a plain Chrome UA so the gate is not what a
    // future Playwright bump breaks.
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Force the unconfigured Supabase path regardless of a developer's .env:
      // auth reports 'unavailable' (no anonymous sign-in call), conversation
      // persistence is skipped, and retrieval goes to a host the tests mock.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_API_BASE_URL: '',
      VITE_FORCE_MOCK: '',
    },
  },
});
