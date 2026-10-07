// Onboarding wizard: one helper name throughout, and a voice preview that never fails silently.
// The e2e mocks refuse the Unity build, so the helper that resolves here is the fallback avatar;
// the assertions therefore check consistency with the resolved name, not a fixed name.
import { test } from '@playwright/test';
import { mockProviders, seedStorage, expect } from './support.js';

const fresh = { keys: false, settings: { onboarded: false } };

test.describe('onboarding wizard', () => {
  test('(a) the greeting, the disclaimer and the final button all name the same helper', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/1');
    const heading = page.getByRole('heading', { name: /^Kia ora — I'm / });
    await expect(heading).toBeVisible();
    // Let the Unity probe settle (it is refused here), then read the resolved name.
    await page.waitForTimeout(500);
    const name = (await heading.textContent()).replace("Kia ora — I'm ", '').trim();
    expect(name.length).toBeGreaterThan(0);

    await page.goto('/#/onboarding/11');
    await expect(page.getByText(`${name} gives general information, not medical advice.`)).toBeVisible();

    await page.goto('/#/onboarding/12');
    await expect(page.getByRole('button', { name: `Meet ${name} →` })).toBeVisible();
    await expect(page.getByText(/will help you, in the style you chose/)).toBeVisible();
  });

  test('(b) Back moves one step without an error, all the way to the start', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/5');
    for (let step = 5; step > 1; step--) {
      await page.getByRole('button', { name: '← Back' }).click();
      await expect(page).toHaveURL(new RegExp(`#/onboarding/${step - 1}$`));
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    }
  });

  test('(c) Preview voice without a key or code says why it cannot play', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/8');
    await page.getByRole('button', { name: /Preview voice/ }).click();
    await expect(page.getByRole('status')).toContainText('needs an access code or your own key');
  });

  test('(d) Preview voice whose speech request fails says so instead of animating silently', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: true, settings: { onboarded: false } });
    await page.route('https://api.openai.com/v1/audio/speech', (route) => route.fulfill({ status: 500, body: 'upstream error' }));
    await page.goto('/#/onboarding/8');
    await page.getByRole('button', { name: /Preview voice/ }).click();
    await expect(page.getByRole('status')).toContainText("The preview couldn't play");
  });
});
