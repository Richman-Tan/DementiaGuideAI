// Guest access code: an invited carer enters a code once and uses the whole app
// through the proxy. Providers mocked (see support.js);
// /api/speech answers 400 to the empty validation body, which means "accepted".
import { test, mockProviders, seedStorage, ask, expect } from './support.js';

const CODE = 'e2e-guest-access-code-0001';

async function recordProxyCalls(page) {
  const seen = { chatCodes: [] };
  await page.route('**/api/chat', async (route) => {
    seen.chatCodes.push(route.request().headers()['x-study-code'] ?? null);
    await route.fallback();
  });
  return seen;
}

test.describe('guest access code (mocked providers)', () => {
  test('(a) a code entered in Settings turns on live answers through the proxy', async ({ page }) => {
    await mockProviders(page);
    const seen = await recordProxyCalls(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/settings');
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toContainText('Code accepted');

    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'My mum gets restless and upset every evening. What can I try?');
    await expect(page.getByText(/close the curtains before dusk/).last()).toBeVisible();
    expect(seen.chatCodes.filter(Boolean)).toContain(CODE);
  });

  test('(b) the keyless voice setup card accepts a code and gives way to the conversation', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/voice');
    await expect(page.getByText('Set up voice conversations')).toBeVisible();
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByText('Set up voice conversations')).toHaveCount(0);
  });

  test('(c) a refused code is not stored and says so', async ({ page }) => {
    await mockProviders(page);
    await page.route('**/api/speech', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid or missing study access code"}' }));
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/settings');
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toContainText('was not accepted');
    expect(await page.evaluate(() => localStorage.getItem('dg_access'))).toBeNull();
  });

  test('(d) the daily cap gets its own message, not a generic failure', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.addInitScript((code) => localStorage.setItem('dg_access', JSON.stringify({ code, status: 'ok' })), CODE);
    await page.route('**/api/chat', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"study request limit reached for today"}' }));
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'Where can I find respite care?');
    await expect(page.getByText(/limit for this access code has been reached/)).toBeVisible();
  });
});
