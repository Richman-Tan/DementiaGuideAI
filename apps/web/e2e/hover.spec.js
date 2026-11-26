// What controls look like under the pointer.
//
// The screens set each control's resting colours as inline styles, which beat
// any ordinary stylesheet rule. For a long time that silently disabled every
// hover style in the app: nothing responded to the pointer. This holds the
// main kinds of control to the colour the design tokens give them on hover, in
// both themes.
import { test, mockProviders, seedStorage, expect } from './support.js';
import { light, dark } from '../../../packages/core/design/tokens.ts';

const rgb = (hex) =>
  `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

const colours = (locator) =>
  locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, text: style.color, border: style.borderTopColor };
  });

/** Hovers a control and waits for its colours to settle (the change is eased). */
async function hovered(page, locator) {
  await locator.hover();
  await page.waitForTimeout(400);
  return colours(locator);
}

for (const [name, palette, settings] of [
  ['light', light, {}],
  ['dark', dark, { theme: 'dark', darkMode: true }],
]) {
  test.describe(`hover, ${name} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await mockProviders(page);
      await seedStorage(page, { settings: { showAvatar: false, ...settings } });
      await page.goto('/#/app/home');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(name);
    });

    test('a primary button darkens (or, in the dark theme, lightens) and keeps readable text', async ({
      page,
    }) => {
      const talk = page.getByRole('button', { name: /Talk to Aaron/ });
      expect(await colours(talk)).toMatchObject({
        background: rgb(palette.primary),
        text: rgb(palette.onPrimary),
      });
      expect(await hovered(page, talk)).toMatchObject({
        background: rgb(palette.primaryDark),
        text: rgb(palette.onPrimary),
      });
      // And it goes back when the pointer leaves.
      await page.mouse.move(640, 5);
      await page.waitForTimeout(400);
      expect((await colours(talk)).background).toBe(rgb(palette.primary));
    });

    test('a navigation item that is not the current one takes the tint', async ({ page }) => {
      const library = page.getByRole('button', { name: 'Library', exact: true }).first();
      expect((await colours(library)).background).not.toBe(rgb(palette.tint));
      expect((await hovered(page, library)).background).toBe(rgb(palette.tint));
    });

    test('a quick question takes the tint and a primary edge', async ({ page }) => {
      const chip = page.getByRole('button', { name: 'How do I manage sundowning?' });
      const resting = await colours(chip);
      const over = await hovered(page, chip);
      expect(over.background).toBe(rgb(palette.tint));
      expect(over.border).toBe(rgb(palette.primary));
      expect(over).not.toEqual(resting);
    });
  });
}
