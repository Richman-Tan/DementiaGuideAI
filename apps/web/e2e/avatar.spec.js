// The lifelike (Unity) avatars, with a scripted stand-in for the WebGL build
// (installFakeUnity in support.js): the download and "preparing" progress, a
// failed load and its retry, speaking through the avatar, switching between
// Aaron and Ariana, and falling back to Aria when no build is installed.
import { test, mockProviders, seedStorage, installFakeUnity, expect } from './support.js';

const unityTypes = (page) => page.evaluate(() => window.__unity.messages.map((m) => m.type));

test.describe('Unity avatar loading', () => {
  test('the voice screen shows the download, then preparing, then Aaron, who speaks the answer', async ({ page }) => {
    const log = await mockProviders(page, { answer: 'Keep a calm routine in the evening [S1].', audioSeconds: 0.8 });
    await installFakeUnity(page);
    await seedStorage(page);
    await page.goto('/#/app/voice');

    await expect(page.getByText('Getting Aaron ready', { exact: true })).toBeVisible();
    await page.evaluate(() => window.__unity.progress(0.45));
    await expect(page.getByRole('progressbar', { name: 'Downloading Aaron' })).toHaveAttribute('aria-valuenow', '50');
    await expect(page.getByText('Downloading… 50% — Aaron is a large one-time download (about 230 MB), saved for your next visit.')).toBeVisible();
    await page.evaluate(() => window.__unity.progress(0.95));
    await expect(page.getByText('Almost there — preparing Aaron…')).toBeVisible();
    await expect(page.getByText('This only takes a few seconds. You can keep using the app.')).toBeVisible();
    await page.evaluate(() => window.__unity.ready());
    await expect(page.getByText('Almost there — preparing Aaron…')).toHaveCount(0);
    await expect(page.locator('#unity-canvas')).toBeVisible();

    await page.getByLabel('Message Aaron').fill('How do I manage sundowning?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Aaron is speaking')).toBeVisible();
    await expect(page.getByText('Tap the mic or type below')).toBeVisible({ timeout: 20_000 });
    // Aaron's own voice, and the mouth movements sent to the avatar.
    expect(log.speech.map((s) => s.voice)).toEqual(['onyx']);
    const types = await unityTypes(page);
    expect(types).toEqual(expect.arrayContaining(['setCharacter', 'setState', 'play', 'stop']));
    expect(await page.evaluate(() => window.__unity.messages.find((m) => m.type === 'setCharacter').id)).toBe('aaron');
  });

  test('on Home, a failed download offers Try again, which loads the avatar', async ({ page }) => {
    await mockProviders(page);
    await installFakeUnity(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/home');

    await expect(page.getByText('Getting Aaron ready… 0%')).toBeVisible();
    await expect(page.getByText('One-time download')).toBeVisible();
    // The bridge retries once by itself before admitting failure.
    await page.evaluate(() => window.__unity.fail());
    await expect.poll(() => page.evaluate(() => window.__unity.calls)).toBe(2);
    await page.evaluate(() => window.__unity.fail());
    await expect(page.getByText("We couldn't finish loading Aaron.")).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => page.evaluate(() => window.__unity.calls)).toBe(3);
    await page.evaluate(() => window.__unity.progress(0.95));
    await expect(page.getByText('Almost there — preparing Aaron…')).toBeVisible();
    await page.evaluate(() => window.__unity.ready());
    await expect(page.getByText("We couldn't finish loading Aaron.")).toHaveCount(0);
    await expect(page.locator('#unity-canvas')).toBeVisible();
  });

  test('with the build installed, Aaron and Ariana can both be picked in Settings, and the avatar follows', async ({ page }) => {
    await mockProviders(page);
    await installFakeUnity(page, { auto: true });
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/settings');
    const picker = page.getByRole('group', { name: 'Avatar' });
    await expect(picker.getByRole('button', { name: 'Ariana' })).toBeEnabled();
    await picker.getByRole('button', { name: 'Ariana' }).click();
    await expect(page.getByText("Display Ariana's visual avatar interface")).toBeVisible();

    await page.goto('/#/app/home');
    await expect(page.locator('#unity-canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__unity.messages.filter((m) => m.type === 'setCharacter').map((m) => m.id))).toContain('ariana');
    await expect(page.getByText('Ariana', { exact: true })).toBeVisible();
  });

  test('with the avatar switched off, the build is never downloaded', async ({ page }) => {
    await mockProviders(page);
    await installFakeUnity(page, { auto: true });
    await seedStorage(page, { keys: false, settings: { showAvatar: false } });
    await page.goto('/#/app/home');
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
    await page.goto('/#/app/voice');
    await expect(page.getByText('Set up voice conversations')).toBeVisible();
    expect(await page.evaluate(() => window.__unity.calls)).toBe(0);
  });

  test('when no build is installed, the tile switches from Aaron to Aria once that is known', async ({ page }) => {
    await mockProviders(page);
    // A slow "not found" for the build probe: Aaron is shown until it answers.
    await page.route(/\/unity\/Build/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html>' });
    });
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/home');
    await expect(page.getByText('Aaron', { exact: true })).toBeVisible();
    await expect(page.getByText('Aria', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Aaron', { exact: true })).toHaveCount(0);
  });
});

test.describe('the 3D (Three.js) avatar', () => {
  const bust = (page) => page.getByRole('main').locator('svg[viewBox="0 0 120 120"]');

  test('if the graphics context is lost, the 3D helper gives way to the drawn figure', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria' } });
    await page.goto('/#/app/home');
    const canvas = page.getByRole('main').locator('canvas');
    // Loaded: the drawn placeholder is gone and the canvas is shown.
    await expect(bust(page)).toHaveCount(0);
    await expect(canvas).toBeVisible();
    await page.evaluate(() => {
      const c = document.querySelector('main canvas');
      (c.getContext('webgl2') || c.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext();
    });
    await expect(bust(page)).toBeVisible();
  });

  test('a model that fails to download leaves the drawn figure in place', async ({ page }) => {
    await mockProviders(page);
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.route(/characters\/zhenja\/zhenja\.glb$/, (route) => route.fulfill({ status: 404, body: 'missing' }));
    await seedStorage(page, { keys: false, settings: { avatarId: 'zhenja' } });
    await page.goto('/#/app/home');
    await expect.poll(() => warnings.some((w) => w.startsWith('[avatar] renderer error:'))).toBe(true);
    await expect(bust(page)).toBeVisible();
    await expect(page.getByText('Zhenja', { exact: true })).toBeVisible();
  });
});
