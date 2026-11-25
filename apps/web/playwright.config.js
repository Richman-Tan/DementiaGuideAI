// End-to-end tests of the assembled web app with every provider mocked at the
// network layer (see e2e/support.js). No keys, no network: OpenAI, ElevenLabs and
// Supabase are answered by page.route() fixtures, and the Unity build is
// refused so the ~240 MB download never starts.
//
// The dev server (`vite`) is used rather than a production preview: the
// apiDevServer middleware and the CJS→ESM transform are the same code the
// preview uses, the routes are intercepted in the browser before they reach
// any server, and skipping the build keeps a local run under a minute.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);
// An instrumented dev server (E2E_COVERAGE=1) transforms and runs every module
// several times slower; the same flows need more headroom there, not different
// assertions.
const SLOW = process.env.E2E_COVERAGE === '1' ? 3 : 1;
// Specs for the production-like build (the `shipped` project below).
const SHIPPED = /account\.spec\.js/;
// Specs for the app on the server's pipeline (the `server` project below): the
// chat, and the spoken conversation.
const SERVER = /(server|conversation)\.spec\.js/;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js/,
  timeout: 60_000 * SLOW,
  expect: { timeout: 10_000 * SLOW },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Pin a plain Chrome UA so a future Playwright bump changing the headless
    // UA string cannot change what the app sees.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: [SHIPPED, SERVER], use: { ...devices['Desktop Chrome'] } },
    // The app as production builds it: Supabase configured, so anonymous
    // sign-in, the server-side conversation threads and the account upgrade
    // run. The Supabase URL
    // points at a host that does not exist; mockSupabase() in e2e/support.js
    // answers every call in the browser.
    {
      name: 'shipped',
      testMatch: SHIPPED,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT + 1}` },
    },
    // The app with VITE_TURN_ENDPOINT on: a chat turn is one request to
    // POST /api/turn, which the specs answer in the browser. Supabase is
    // configured here too, because the request carries the visitor's session.
    {
      name: 'server',
      testMatch: SERVER,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT + 2}` },
    },
  ],
  webServer: [
    server(PORT, {
      // Force the unconfigured Supabase path regardless of a developer's .env:
      // auth reports 'unavailable' (no anonymous sign-in call), conversation
      // persistence is skipped, and retrieval goes to a host the tests mock.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    }),
    server(PORT + 1, {
      VITE_SUPABASE_URL: 'https://e2e-supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
    }),
    server(PORT + 2, {
      VITE_SUPABASE_URL: 'https://e2e-supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_TURN_ENDPOINT: 'on',
    }),
  ],
});

function server(port, appEnv) {
  return {
    command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/`,
    // Never reuse a server for a coverage run: a plain one left running locally
    // would silently record nothing.
    reuseExistingServer: !process.env.CI && process.env.E2E_COVERAGE !== '1',
    timeout: 120_000,
    env: {
      // Off unless a server asks for it, whatever a developer's .env says.
      VITE_TURN_ENDPOINT: '',
      ...appEnv,
      VITE_API_BASE_URL: '',
      VITE_FORCE_MOCK: '',
      // `E2E_COVERAGE=1` instruments the dev server (vite.config.js) and makes
      // the page fixture in e2e/support.js save each test's coverage.
      E2E_COVERAGE: process.env.E2E_COVERAGE || '',
    },
  };
}
