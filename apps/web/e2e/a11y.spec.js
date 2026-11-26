// Automated accessibility checks: every screen, in the light and the dark
// theme, and the main states a screen can be in (a dialog open, an answer on
// screen, a conversation under way). axe-core's WCAG 2.0, 2.1 and 2.2 level A
// and AA rules; any violation fails.
//
// This catches what a machine can see: contrast, names and roles, focus order
// markers, form labels. It cannot judge whether a screen reader user can follow
// a conversation, so it is a floor, not a pass.
import { AxeBuilder } from '@axe-core/playwright';
import { test, mockProviders, seedStorage, installFakeMedia, ask, expect } from './support.js';

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The violations on the page, as short lines a failure message can show. */
async function violations(page) {
  const result = await new AxeBuilder({ page }).withTags(RULES).analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((node) => `${v.id}: ${node.target.join(' ')} — ${v.help}`)
  );
}

async function open(page, hash, { dark, onboarded = true, settings = {} } = {}) {
  await mockProviders(page);
  await installFakeMedia(page);
  await seedStorage(page, {
    settings: {
      onboarded,
      showAvatar: false,
      ...(dark ? { theme: 'dark', darkMode: true } : {}),
      ...settings,
    },
  });
  await page.goto(`/${hash}`);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(dark ? 'dark' : 'light');
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light';

  test.describe(`accessibility, ${theme} theme`, () => {
    for (const [name, hash, heading] of [
      ['landing', '#/', /Dementia care answers/],
      ['home', '#/app/home', /Good (morning|afternoon|evening)/],
      ['chat', '#/app/chat', 'Chat with Aaron'],
      ['library', '#/app/library', /Library/],
      ['settings', '#/app/settings', /Settings/],
      ['privacy', '#/privacy', /Privacy/],
      ['disclaimer', '#/disclaimer', /Disclaimer/],
      ['not found', '#/nowhere', /./],
    ]) {
      test(`${name}`, async ({ page }) => {
        await open(page, hash, { dark });
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
        expect(await violations(page)).toEqual([]);
      });
    }

    test('onboarding, on its first and a later step', async ({ page }) => {
      await open(page, '#/onboarding/1', { dark, onboarded: false });
      const progress = page.getByRole('progressbar', { name: 'Setup progress' });
      await expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 12');
      expect(await violations(page)).toEqual([]);
      await page.goto('/#/onboarding/4');
      await expect(progress).toHaveAttribute('aria-valuetext', 'Step 4 of 12');
      expect(await violations(page)).toEqual([]);
    });

    test('a library article', async ({ page }) => {
      await open(page, '#/app/library/managing-sundowning', { dark });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('chat with an answer on screen, and with its source open', async ({ page }) => {
      await open(page, '#/app/chat', { dark });
      await ask(page, 'My mum gets restless and upset every evening. What can I try?');
      await expect(page.getByRole('button', { name: 'Open source 2' }).last()).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await page.getByRole('button', { name: 'Open source 1' }).last().click();
      await expect(page.getByRole('dialog', { name: 'Source preview' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('settings with the clear-history question open', async ({ page }) => {
      await open(page, '#/app/settings', { dark });
      await page.getByRole('button', { name: /Clear Conversation History/ }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the voice screen, idle and while listening', async ({ page }) => {
      await open(page, '#/app/voice', { dark });
      await expect(page.getByText('Tap the mic or type below')).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Tap to talk' }).click();
      await expect(page.getByText('Listening')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('high contrast', async ({ page }) => {
      await open(page, '#/app/home', { dark, settings: { highContrast: true } });
      await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.dataset.hc)).toBe('1');
      expect(await violations(page)).toEqual([]);
    });
  });
}
