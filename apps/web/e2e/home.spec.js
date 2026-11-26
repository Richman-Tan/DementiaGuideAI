// Home: the ask box, quick questions, the navigation cards, featured
// resources and the avatar tile — and the app shell around it at desktop,
// tablet and phone widths. No key is stored, so questions asked from Home are
// answered by the built-in example replies (mock mode).
import { test, mockProviders, seedStorage, installFakeUnity, expect } from './support.js';

const GREETING = /^Good (morning|afternoon|evening)$/;

async function openHome(page, settings = {}, { fakeUnity = false } = {}) {
  await mockProviders(page);
  if (fakeUnity) await installFakeUnity(page, { auto: true });
  await seedStorage(page, { keys: false, settings: { showAvatar: false, ...settings } });
  await page.goto('/#/app/home');
  await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();
}

test.describe('home', () => {
  test('the avatar tile shows the 3D helper with a name tag', async ({ page }) => {
    await openHome(page, { showAvatar: true }, { fakeUnity: true });
    await expect(page.locator('#unity-canvas')).toBeVisible();
    await expect(page.getByText('Aaron', { exact: true })).toBeVisible();
  });

  test('a question typed on Home is asked in Chat, and an empty one goes nowhere', async ({
    page,
  }) => {
    await openHome(page);
    // Nothing typed: Send does nothing.
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);

    const box = page.getByLabel('What would you like to know?');
    await box.fill('What about bathing and hygiene?');
    await box.press('Enter');
    await expect(page).toHaveURL(/#\/app\/chat$/);
    await expect(page.getByText('What about bathing and hygiene?')).toBeVisible();
    // The example reply streams in, with its sources underneath.
    await expect(page.getByText(/Bathing is one of the most common flashpoints/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Personal Hygiene and Bathing Assistance' })
    ).toBeVisible();

    // The send button works too.
    await page.goto('/#/app/home');
    await box.fill('How do I respond to repeated questions?');
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(
      page.getByText(/Repeated questions happen because the brain isn't storing the answer/)
    ).toBeVisible();
  });

  test('a quick question is asked straight away', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'How can I help with wandering?' }).click();
    await expect(page).toHaveURL(/#\/app\/chat$/);
    await expect(page.getByText(/Wandering usually has a reason behind it/)).toBeVisible();
  });

  test('the navigation cards and a featured resource open their screens', async ({ page }) => {
    await openHome(page);
    const main = page.getByRole('main');
    for (const [card, url, heading] of [
      [/^Chat\s*Ask questions$/, /#\/app\/chat$/, 'Chat with Aaron'],
      [/^Library\s*49 curated articles$/, /#\/app\/library$/, 'Library'],
      [/^Settings\s*Make it yours$/, /#\/app\/settings$/, 'Settings'],
    ]) {
      await main.getByRole('link', { name: card }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.goto('/#/app/home');
    }
    await main.getByRole('link', { name: /^Voice\s*Talk with Aaron$/ }).click();
    await expect(page).toHaveURL(/#\/app\/voice$/);
    await expect(page.getByText('Set up voice conversations')).toBeVisible();

    await page.goto('/#/app/home');
    // The page has an outline: the greeting, then each group of things under it.
    await expect(main.getByRole('heading', { level: 2 })).toHaveText([
      'Quick questions',
      'Featured resources',
    ]);
    // The count on the Library card is the library's, not a number typed in.
    await expect(main.getByRole('link', { name: /^Library/ })).toContainText('49 curated articles');
    // Beside the question box, the way to ask by voice goes somewhere, so it is a link.
    await expect(main.getByRole('link', { name: 'Ask Aaron by voice' })).toHaveAttribute(
      'href',
      '#/app/voice'
    );
    await main.getByRole('link', { name: /Understanding the Stages of Dementia/ }).click();
    await expect(page).toHaveURL(/#\/app\/library\/stages$/);
    await expect(
      page.getByRole('heading', { name: 'Understanding the Stages of Dementia' })
    ).toBeVisible();
  });

  test('the desktop sidebar navigates, opens voice, and switches the theme', async ({ page }) => {
    await openHome(page, { darkMode: false });
    const sidebar = page.getByRole('complementary').first();
    const nav = sidebar.getByRole('navigation', { name: 'Main' });
    // The destinations are links, and the one you are on says so.
    await expect(nav.getByRole('link')).toHaveText([
      'Home',
      'Chat',
      'Library',
      'Settings',
      'Talk to Aaron',
    ]);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
    await nav.getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL(/#\/app\/library$/);
    await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
    // An article is still part of the library.
    await page.goto('/#/app/library/managing-sundowning');
    await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    // A page that is none of the four marks none of them.
    await page.goto('/#/privacy');
    await expect(nav.locator('[aria-current]')).toHaveCount(0);
    await nav.getByRole('link', { name: 'Talk to Aaron' }).click();
    await expect(page).toHaveURL(/#\/app\/voice$/);
    await page.goto('/#/app/home');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await sidebar.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await sidebar.getByRole('button', { name: 'Light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('home when the window changes size', () => {
  test('narrowing the window swaps the sidebar for the phone tab bar, and back', async ({
    page,
  }) => {
    await openHome(page);
    // There is one navigation at every width; what changes is where it is.
    const nav = page.getByRole('navigation', { name: 'Main' });
    const sidebar = page.getByRole('complementary');
    await expect(nav).toHaveCount(1);
    await expect(sidebar).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(nav).toHaveCount(1);
    await expect(sidebar).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar.getByRole('link', { name: 'Talk to Aaron' })).toBeVisible();
  });
});

test.describe('home on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1000 } });

  test('the icon rail replaces the sidebar and still reaches every screen', async ({ page }) => {
    await openHome(page);
    const rail = page.getByRole('complementary').first().getByRole('navigation', { name: 'Main' });
    // Icons alone, so each one carries its name.
    await expect(rail.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await rail.getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/#\/app\/chat$/);
    await expect(rail.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    await rail.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/#\/app\/settings$/);
    await expect(rail.locator('[aria-current]')).toHaveCount(1);
    await rail.getByRole('link', { name: 'Talk to Aaron' }).click();
    await expect(page).toHaveURL(/#\/app\/voice$/);
  });
});

test.describe('home on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a bottom tab bar replaces the sidebar, and the quick questions scroll sideways', async ({
    page,
  }) => {
    await openHome(page);
    // No subtitle line under the greeting on a phone.
    await expect(page.getByText('Ask a question, explore resources')).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await tabs.getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL(/#\/app\/library$/);
    await expect(tabs.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await tabs.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(tabs.locator('[aria-current]')).toHaveCount(1);
    await tabs.getByRole('link', { name: 'Talk to Aaron' }).click();
    await expect(page).toHaveURL(/#\/app\/voice$/);
    await page.goto('/#/app/home');
    await page.getByRole('button', { name: 'What respite care options are available?' }).click();
    await expect(page.getByText(/Respite gives you a proper break/)).toBeVisible();
  });
});
