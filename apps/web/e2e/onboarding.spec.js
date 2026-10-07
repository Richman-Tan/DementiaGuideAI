// Onboarding wizard: one helper name throughout, and a voice preview that never fails silently.
// The e2e mocks refuse the Unity build, so the helper that resolves here is the fallback avatar;
// the assertions therefore check consistency with the resolved name, not a fixed name.
import { test, mockProviders, seedStorage, expect } from './support.js';

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

test.describe('onboarding: the whole wizard', () => {
  test('every step, answered, adds up to the summary; Change goes back to a step; finishing opens Home', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false, avatarId: 'aria', darkMode: false } });
    await page.goto('/#/onboarding/1');
    await page.getByRole('button', { name: "Let's begin" }).click();

    const pick = async (title, option) => {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await page.getByRole('button', { name: option }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
    };
    await pick('Who is setting up this app today?', "I work in care professionally");
    await pick('How comfortable are you with using apps like this?', /I'd like extra guidance/);
    await pick('What kind of helper feels right for you?', 'Calm & steady');
    await pick('When you ask a question, how much detail would you like?', 'Short and simple');
    await pick('When medical words come up, what would you prefer?', 'Medical terms are fine');
    await pick('How would you like to talk with Aria?', /^Type my questions/);
    await pick('How fast would you like Aria to speak?', 'Faster');

    await expect(page.getByRole('heading', { name: 'How would you like the text to appear?' })).toBeVisible();
    await page.getByRole('button', { name: /Large/ }).click();
    await expect(page.locator('html')).toHaveCSS('font-size', '21.25px');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'A few display choices' })).toBeVisible();
    for (const label of ['Dark mode', 'High contrast', 'Subtitles during voice replies', 'Show Aria on screen']) {
      const sw = page.getByRole('switch', { name: label });
      const was = await sw.getAttribute('aria-checked');
      await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
    }
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'One important thing to know' })).toBeVisible();
    await page.getByRole('button', { name: 'I understand' }).click();

    await expect(page.getByRole('heading', { name: "Here's how you've set things up" })).toBeVisible();
    for (const value of ['I work in care professionally', 'Extra guidance please', 'Calm & steady', 'Short and simple',
      'Medical terms are fine', 'Type my questions', 'Faster', 'Large', 'Dark · high contrast']) {
      await expect(page.getByText(value, { exact: true })).toBeVisible();
    }
    // "Short and simple" also turns on the concise style.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_settings')).concise)).toBe(true);

    // Change → the step → Continue walks forward again.
    await page.getByRole('button', { name: 'Change' }).nth(3).click();
    await expect(page).toHaveURL(/#\/onboarding\/5$/);
    await page.getByRole('button', { name: 'Balanced' }).click();
    await page.goto('/#/onboarding/12');
    await expect(page.getByText('Balanced', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Meet Aria →' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(page.getByRole('status')).toHaveText("You're all set — welcome");
  });

  test('"Skip setup" on the first step and "Skip for now" later both go straight to Home', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false } });
    await page.goto('/#/onboarding/1');
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(page.getByRole('status')).toHaveText('Setup skipped — you can redo it in Settings');

    await page.goto('/#/onboarding/3');
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
  });

  test('an out-of-range step address shows the nearest real step', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false } });
    await page.goto('/#/onboarding/99');
    await expect(page.getByRole('heading', { name: "Here's how you've set things up" })).toBeVisible();
    await page.goto('/#/onboarding/zero');
    await expect(page.getByRole('heading', { name: /^Kia ora — I'm / })).toBeVisible();
  });

  test('Preview voice with a key plays the chosen voice, then settles', async ({ page }) => {
    const log = await mockProviders(page, { audioSeconds: 1.5 });
    await seedStorage(page, { keys: true, settings: { onboarded: false, avatarId: 'aria', voiceSpeed: 'slower' } });
    await page.goto('/#/onboarding/8');
    await page.getByRole('button', { name: /Preview voice/ }).click();
    await expect(page.getByText("“Kia ora — I'm Aria. This is about how I'll sound.”")).toBeVisible();
    expect(log.speech[0]).toMatchObject({ voice: 'nova', input: "Kia ora — I'm Aria. This is about how I'll sound." });
    // When the clip ends the preview returns to its button.
    await expect(page.getByText("“Kia ora — I'm Aria. This is about how I'll sound.”")).toHaveCount(0, { timeout: 15_000 });
  });
});
