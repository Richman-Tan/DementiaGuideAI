// Setup, in three steps: meet your guide, say how answers should be written,
// read the one thing everyone has to know. One name throughout, every choice
// stored, and every step passable without choosing anything.
import { test, mockProviders, seedStorage, expect } from './support.js';

const fresh = { keys: false, settings: { onboarded: false, darkMode: false } };
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dg_settings')));
const step = (page) => page.getByRole('progressbar', { name: 'Setup progress' });

test.describe('setup', () => {
  test.beforeEach(async ({ page }) => {
    await mockProviders(page);
  });

  test('the guide you choose is the one who greets you, warns you and meets you', async ({
    page,
  }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/1');
    await expect(page.getByRole('heading', { name: "Kia ora — I'm Aaron" })).toBeVisible();
    await expect(step(page)).toHaveAttribute('aria-valuetext', 'Step 1 of 3');

    const guides = page.getByRole('radiogroup', { name: 'Who would you like to talk with?' });
    await expect(guides.getByRole('radio', { name: 'Aaron' })).toBeChecked();
    await expect(guides).toHaveAccessibleDescription('A man’s voice, warm and steady.');

    // Choosing the other guide changes who is speaking, there and then.
    await guides.getByRole('radio', { name: 'Ariana' }).click();
    await expect(page.getByRole('heading', { name: "Kia ora — I'm Ariana" })).toBeVisible();
    await expect(guides).toHaveAccessibleDescription('A woman’s voice, warm and clear.');

    await page.getByRole('button', { name: "Let's begin" }).click();
    await expect(page).toHaveURL(/#\/onboarding\/2$/);
    await expect(page.getByRole('heading', { name: 'How should Ariana answer?' })).toBeVisible();
    await expect(
      page.getByText('Ariana speaks to you as a carer or support worker.')
    ).toBeVisible();
    await expect(step(page)).toHaveAttribute('aria-valuetext', 'Step 2 of 3');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/#\/onboarding\/3$/);
    await expect(page.getByRole('heading', { name: 'One important thing to know' })).toBeVisible();
    await expect(
      page.getByText('Ariana gives general information, not medical advice.')
    ).toBeVisible();
    await expect(page.getByText('In an emergency, call 111.')).toBeVisible();
    await expect(page.getByText('Healthline on 0800 611 116')).toBeVisible();

    await page.getByRole('button', { name: 'I understand — meet Ariana' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(page.getByRole('status')).toHaveText("You're all set — welcome");
    expect(await stored(page)).toMatchObject({ onboarded: true, avatarId: 'ariana' });
  });

  test('each choice is stored, and says what it does', async ({ page }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/2');

    const asking = page.getByRole('radiogroup', { name: 'Who are you asking for?' });
    await expect(asking.getByRole('radio', { name: 'Someone I care for' })).toBeChecked();
    await asking.getByRole('radio', { name: 'Myself' }).click();
    await expect(asking.getByRole('radio', { name: 'Myself' })).toBeChecked();
    await expect(asking).toHaveAccessibleDescription('Aaron speaks to you directly.');

    const detail = page.getByRole('radiogroup', { name: 'How much detail?' });
    await expect(detail.getByRole('radio', { name: 'Balanced' })).toBeChecked();
    await detail.getByRole('radio', { name: 'Short' }).click();
    await expect(detail).toHaveAccessibleDescription('A few sentences, straight to the point.');

    const words = page.getByRole('radiogroup', { name: 'Medical words' });
    await expect(words.getByRole('radio', { name: 'Avoid them' })).toBeChecked();
    await words.getByRole('radio', { name: 'Explain them' }).click();
    await expect(words).toHaveAccessibleDescription(
      'Medical terms are explained in plain language as they come up.'
    );

    // "Short" also turns on the concise style; any other length turns it off.
    expect(await stored(page)).toMatchObject({
      setupType: 'exploring',
      responseStyle: 'short',
      concise: true,
      jargon: 'explained',
    });
    await detail.getByRole('radio', { name: 'Thorough' }).click();
    expect(await stored(page)).toMatchObject({ responseStyle: 'thorough', concise: false });
  });

  test('every step can be passed without choosing anything, and the defaults stand', async ({
    page,
  }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/1');
    await page.getByRole('button', { name: "Let's begin" }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'I understand — meet Aaron' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    expect(await stored(page)).toMatchObject({
      onboarded: true,
      avatarId: 'aaron',
      setupType: 'caring',
      responseStyle: 'balanced',
      jargon: 'plain',
      concise: false,
    });
  });

  test('the arrow keys move between options, as in any radio group', async ({ page }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/2');
    const detail = page.getByRole('radiogroup', { name: 'How much detail?' });
    // The key is held for a moment, as a finger holds it. The group chooses the
    // option it moves to only while an arrow key is down, and a key released
    // within the same instant (which only a script can do) moves without choosing.
    const arrow = (key) => page.keyboard.press(key, { delay: 100 });
    await detail.getByRole('radio', { name: 'Balanced' }).focus();
    await arrow('ArrowRight');
    await expect(detail.getByRole('radio', { name: 'Thorough' })).toBeFocused();
    await expect(detail.getByRole('radio', { name: 'Thorough' })).toBeChecked();
    await arrow('ArrowLeft');
    await expect(detail.getByRole('radio', { name: 'Balanced' })).toBeChecked();
    await arrow('ArrowLeft');
    await expect(detail.getByRole('radio', { name: 'Short' })).toBeChecked();
    // One stop for the whole group: Tab leaves it rather than visiting each option.
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('radiogroup', { name: 'Medical words' }).getByRole('radio', { checked: true })
    ).toBeFocused();
  });

  test('the chosen option is marked with a tick, not by colour alone', async ({ page }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/2');
    const detail = page.getByRole('radiogroup', { name: 'How much detail?' });
    await expect(detail.getByRole('radio', { name: 'Balanced' })).toContainText('✓');
    await expect(detail.getByRole('radio', { name: 'Short' })).not.toContainText('✓');
    await detail.getByRole('radio', { name: 'Short' }).click();
    await expect(detail.getByRole('radio', { name: 'Short' })).toContainText('✓');
    await expect(detail.getByRole('radio', { name: 'Balanced' })).not.toContainText('✓');
  });

  test('Back moves one step at a time, to the start', async ({ page }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/3');
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page).toHaveURL(/#\/onboarding\/2$/);
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
    await expect(page.getByRole('button', { name: '← Back' })).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  test('"Skip setup" on the first step and "Skip for now" on the second go straight to Home', async ({
    page,
  }) => {
    await seedStorage(page, fresh);
    await page.goto('/#/onboarding/1');
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    await expect(page.getByRole('status')).toHaveText(
      'Setup skipped — you can redo it in Settings'
    );

    await page.goto('/#/onboarding/2');
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);

    // The last step is the one thing that is not skipped past.
    await page.goto('/#/onboarding/3');
    await expect(page.getByRole('button', { name: /Skip/ })).toHaveCount(0);
  });

  test('an address for a step that does not exist shows the nearest one that does', async ({
    page,
  }) => {
    await seedStorage(page, fresh);
    // The setup used to have twelve steps; an old link to a later one still lands.
    await page.goto('/#/onboarding/12');
    await expect(page.getByRole('heading', { name: 'One important thing to know' })).toBeVisible();
    await expect(step(page)).toHaveAttribute('aria-valuetext', 'Step 3 of 3');
    await page.goto('/#/onboarding/zero');
    await expect(page.getByRole('heading', { name: /^Kia ora — I'm / })).toBeVisible();
  });

  test('settings saved by the longer setup still show which choice is in force', async ({
    page,
  }) => {
    // "I work in care professionally" is no longer offered; it was always
    // treated as a carer. "Get to the Point" overrides the stored length.
    await seedStorage(page, {
      keys: false,
      settings: {
        onboarded: false,
        setupType: 'professional',
        responseStyle: 'thorough',
        concise: true,
        jargon: 'fine',
      },
    });
    await page.goto('/#/onboarding/2');
    await expect(page.getByRole('radio', { name: 'Someone I care for' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Short' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Leave them' })).toBeChecked();
  });
});

test.describe('setup on a phone, at the largest text size', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('nothing runs off the side of the screen on any step', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false, textScale: 1.25 } });
    for (const n of [1, 2, 3]) {
      await page.goto(`/#/onboarding/${n}`);
      await expect(step(page)).toHaveAttribute('aria-valuetext', `Step ${n} of 3`);
      const overflow = await page.evaluate(() => {
        // Measured against the page's own box, not the window: where a
        // scrollbar's space is reserved (Linux, Windows) the page is narrower
        // than the window, and that is not overflow.
        const root = document.documentElement;
        const edge = root.getBoundingClientRect().right;
        const wide = [...document.querySelectorAll('button, h1, p')].filter(
          (el) => el.getBoundingClientRect().right > edge + 0.5
        );
        return {
          sideways: Math.max(0, root.scrollWidth - Math.ceil(edge)),
          wide: wide.length,
        };
      });
      expect(overflow, `step ${n}`).toEqual({ sideways: 0, wide: 0 });
    }
  });
});
