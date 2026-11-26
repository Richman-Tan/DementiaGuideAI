// The lifelike (Unity) avatars, with a scripted stand-in for the WebGL build
// (installFakeUnity in support.js): the download and "preparing" progress, a
// failed load and its retry, speaking through the avatar, switching between
// Aaron and Ariana, the same character carrying on when no build is installed,
// and the build being requested only once an avatar view opens.
import { test, mockProviders, seedStorage, installFakeUnity, expect, slow } from './support.js';

const unityTypes = (page) => page.evaluate(() => window.__unity.messages.map((m) => m.type));

test.describe('Unity avatar loading', () => {
  test('the voice screen shows the download, then preparing, then Aaron, who speaks the answer', async ({
    page,
  }) => {
    const log = await mockProviders(page, {
      answer: 'Keep a calm routine in the evening [S1].',
      audioSeconds: 0.8,
    });
    await installFakeUnity(page);
    await seedStorage(page);
    await page.goto('/#/app/voice');

    await expect(page.getByText('Getting Aaron ready', { exact: true })).toBeVisible();
    await page.evaluate(() => window.__unity.progress(0.45));
    await expect(page.getByRole('progressbar', { name: 'Downloading Aaron' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    );
    await expect(
      page.getByText(
        'Downloading… 50% — Aaron is a large one-time download (about 230 MB), saved for your next visit.'
      )
    ).toBeVisible();
    await page.evaluate(() => window.__unity.progress(0.95));
    await expect(page.getByText('Almost there — preparing Aaron…')).toBeVisible();
    await expect(
      page.getByText('This only takes a few seconds. You can keep using the app.')
    ).toBeVisible();
    await page.evaluate(() => window.__unity.ready());
    await expect(page.getByText('Almost there — preparing Aaron…')).toHaveCount(0);
    await expect(page.locator('#unity-canvas')).toBeVisible();

    await page.getByLabel('Message Aaron').fill('How do I manage sundowning?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Aaron is speaking')).toBeVisible();
    await expect(page.getByText('Tap the mic or type below')).toBeVisible({
      timeout: slow(20_000),
    });
    // Aaron's own voice, and the mouth movements sent to the avatar.
    expect(log.speech.map((s) => s.voice)).toEqual(['onyx']);
    const types = await unityTypes(page);
    expect(types).toEqual(expect.arrayContaining(['setCharacter', 'setState', 'play', 'stop']));
    expect(
      await page.evaluate(() => window.__unity.messages.find((m) => m.type === 'setCharacter').id)
    ).toBe('aaron');
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

  test('with the build installed, Aaron and Ariana can both be picked in Settings, and the avatar follows', async ({
    page,
  }) => {
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
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__unity.messages.filter((m) => m.type === 'setCharacter').map((m) => m.id)
        )
      )
      .toContain('ariana');
    await expect(page.getByText('Ariana', { exact: true })).toBeVisible();
  });

  test('with the avatar switched off, the build is never downloaded and answers are still spoken', async ({
    page,
  }) => {
    const log = await mockProviders(page, {
      answer: 'Keep a calm routine [S1].',
      audioSeconds: 0.5,
    });
    await installFakeUnity(page, { auto: true });
    await seedStorage(page, { settings: { showAvatar: false } });
    await page.goto('/#/app/home');
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ })
    ).toBeVisible();
    await page.goto('/#/app/voice');
    await page.getByLabel('Message Aaron').fill('How do I manage sundowning?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Aaron is speaking')).toBeVisible();
    await expect(page.getByText('Tap the mic or type below')).toBeVisible({
      timeout: slow(20_000),
    });
    expect(log.speech.map((x) => x.voice)).toEqual(['onyx']);
    expect(await page.evaluate(() => window.__unity.calls)).toBe(0);
  });

  test('when no build is installed, Home keeps Aaron as a drawn figure with a plain note', async ({
    page,
  }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/home');
    await expect(
      page.getByText("The 3D view isn't available right now. Aaron can still talk with you.")
    ).toBeVisible();
    await expect(page.getByText('Aaron', { exact: true })).toBeVisible();
    await expect(page.getByText('Aria', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Unity build not installed')).toHaveCount(0);
    await expect(page.getByRole('main').locator('svg[viewBox="0 0 120 120"]')).toBeVisible();
  });
});

// The 244 MB build is requested only when an avatar view mounts. Requests are
// recorded at the page (before the mocks answer them), and matched on the
// public build path: in dev the app's own source modules also live under an
// `avatar/unity/` directory, which is not a download.
test.describe('the build is fetched on first use, not on page load', () => {
  const recordBuildRequests = (page) => {
    const urls = [];
    page.on('request', (r) => {
      const { pathname } = new URL(r.url());
      if (pathname.startsWith('/unity/')) urls.push(pathname);
    });
    return urls;
  };

  test('the landing page and onboarding never request it; reaching Home does', async ({ page }) => {
    await mockProviders(page);
    await installFakeUnity(page, { auto: true });
    await seedStorage(page, { keys: false, settings: { onboarded: false } });
    const urls = recordBuildRequests(page);

    await page.goto('/#/');
    await expect(
      page.getByRole('heading', { name: 'Dementia care answers you can actually talk to.' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Open the app' }).first().click();
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
    for (let step = 1; step < 3; step += 1) {
      await page.evaluate((n) => {
        location.hash = `#/onboarding/${n}`;
      }, step + 1);
      await expect(page).toHaveURL(new RegExp(`#/onboarding/${step + 1}$`));
    }
    await page.waitForTimeout(500);
    expect(urls).toEqual([]);

    await page.getByRole('button', { name: 'I understand — meet Aaron' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(page.locator('#unity-canvas')).toBeVisible();
    expect(urls.some((u) => u.startsWith('/unity/Build/'))).toBe(true);
  });

  test('Library, an article, Settings, Privacy and the Disclaimer never request it', async ({
    page,
  }) => {
    await mockProviders(page);
    await installFakeUnity(page, { auto: true });
    await seedStorage(page, { keys: false });
    const urls = recordBuildRequests(page);
    const screens = [
      ['#/app/library', page.getByLabel('Search the library')],
      [
        '#/app/library/diagnosis',
        page.getByRole('heading', { name: 'Understanding a Dementia Diagnosis', level: 1 }),
      ],
      ['#/app/settings', page.getByRole('heading', { name: 'Settings' })],
      ['#/privacy', page.getByRole('heading', { name: 'Privacy Policy' })],
      ['#/disclaimer', page.getByRole('heading', { name: 'Medical Disclaimer' })],
    ];
    for (const [hash, marker] of screens) {
      await page.goto(`/${hash}`);
      await expect(marker).toBeVisible();
      await page.waitForTimeout(300);
    }
    expect(urls).toEqual([]);
    expect(await page.evaluate(() => window.__unity.calls)).toBe(0);
  });

  test('with the avatar switched off, Home and Voice never request it', async ({ page }) => {
    await mockProviders(page);
    await installFakeUnity(page, { auto: true });
    await seedStorage(page, { settings: { showAvatar: false } });
    const urls = recordBuildRequests(page);
    await page.goto('/#/app/home');
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ })
    ).toBeVisible();
    await page.goto('/#/app/voice');
    await expect(page.getByText('Tap the mic or type below')).toBeVisible();
    await page.waitForTimeout(400);
    expect(urls).toEqual([]);
  });
});
