// The landing page and the static pages: Privacy, Medical Disclaimer, the 404,
// the onboarding guard on /app routes, the error boundary's way home, and what
// the app does with saved data it cannot read or that an older build wrote.
import { test, mockProviders, seedStorage, installFakeUnity, expect } from './support.js';

test.describe('landing page', () => {
  test('a first-time visitor is taken to setup from either button', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dementia care answers you can actually talk to.' })).toBeVisible();
    // The helper named is the one that resolved (no Unity build here → Aria).
    await expect(page.getByText('Aria is a caring AI guide who answers your questions with trusted, cited information — by text or voice.')).toBeVisible();
    await expect(page.getByText('avatar stage · Aria (3D, lip-synced)')).toBeVisible();
    await expect(page.getByText('DementiaGuide AI provides general information, not medical advice.')).toBeVisible();

    await page.getByRole('button', { name: 'Browse the library' }).click();
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Open the app' }).first().click();
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
  });

  test('a returning visitor opens the app or the library directly', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/');
    await page.getByRole('button', { name: 'Browse the library' }).click();
    await expect(page).toHaveURL(/#\/app\/library$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Open the app' }).last().click();
    await expect(page).toHaveURL(/#\/app\/home$/);
  });

  test('the footer links open the privacy policy and the medical disclaimer', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/');
    await page.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText(/Your conversations with Aria are saved to an account/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deleting them' })).toBeVisible();

    await page.goto('/#/');
    await page.getByRole('link', { name: 'Medical Disclaimer' }).click();
    await expect(page.getByRole('heading', { name: 'Medical Disclaimer' })).toBeVisible();
    await expect(page.getByText('In an emergency, call 111.')).toBeVisible();
    await expect(page.getByText(/Aria is not a doctor, nurse, or health professional/)).toBeVisible();
  });
});

test.describe('routing', () => {
  test('an /app page before setup is finished sends the visitor to setup', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false } });
    await page.goto('/#/app/home');
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
    await expect(page.getByRole('heading', { name: /^Kia ora — I'm / })).toBeVisible();
  });

  test('an unknown address shows the 404 page, with ways back to Home and the Library', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/nowhere');
    await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Library' }).click();
    await expect(page).toHaveURL(/#\/app\/library$/);

    await page.goto('/#/somewhere/else');
    await page.getByRole('main').getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
  });

  test('a screen that fails to render shows a calm error with a way home', async ({ page }) => {
    await mockProviders(page);
    // A chat cache written by an older build: a message whose citations is not
    // a list. The chat screen cannot render it.
    await seedStorage(page, { keys: false, history: [{ role: 'aria', text: 'Old answer', citations: 'not-a-list', time: '9:00 am' }] });
    await page.goto('/#/app/chat');
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect(page.getByText('Your conversations and settings are safe.')).toBeVisible();
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
  });
});

test.describe('stored data from older or damaged builds', () => {
  test('unreadable saved data falls back to defaults instead of breaking the app', async ({ page }) => {
    await mockProviders(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('dg_e2e_garbled')) return;
      sessionStorage.setItem('dg_e2e_garbled', '1');
      for (const key of ['dg_settings', 'dg_keys', 'dg_history', 'dg_study', 'dg_access', 'dg_study_queue']) localStorage.setItem(key, '{not json');
    });
    await page.goto('/');
    // Defaults: not onboarded, so the app opens on setup; no key, so chat is in example mode.
    await expect(page.getByRole('heading', { name: 'Dementia care answers you can actually talk to.' })).toBeVisible();
    await page.getByRole('button', { name: 'Open the app' }).first().click();
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await page.goto('/#/app/chat');
    await expect(page.getByText('Some evenings he lashes out at me and I get scared. What should I do?')).toBeVisible();
    await page.goto('/#/study');
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
  });

  test('a settings blob from before Unity became the default moves to Aaron once', async ({ page }) => {
    await mockProviders(page);
    await installFakeUnity(page, { auto: true });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('dg_e2e_legacy')) return;
      sessionStorage.setItem('dg_e2e_legacy', '1');
      localStorage.setItem('dg_settings', JSON.stringify({ onboarded: true, avatarId: 'aria' }));
    });
    await page.goto('/#/app/home');
    await expect(page.getByText('Aaron', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_settings')))).toMatchObject({ avatarId: 'aaron', avatarMigratedToUnity: true });
    // A deliberate pick of Aria afterwards sticks.
    await page.goto('/#/app/settings');
    await page.getByRole('group', { name: 'Avatar' }).getByRole('button', { name: 'Aria', exact: true }).click();
    await page.reload();
    await expect(page.getByText("Display Aria's visual avatar interface")).toBeVisible();
  });
});
