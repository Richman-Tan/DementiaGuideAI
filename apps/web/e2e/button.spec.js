// The Button component in a real browser: the colours the design tokens give
// it, at rest and under the pointer, in both themes; its shape with keyboard
// focus and in high contrast; and that one which cannot be pressed stays put.
//
// These read computed styles, so they also hold the stylesheet together: the
// Tailwind theme made from the tokens, and the app's element rules sitting in
// a layer the button's classes can override.
import { test, mockProviders, seedStorage, expect } from './support.js';
import { light, dark, radius, touchTarget } from '../../../packages/core/design/tokens.ts';

const rgb = (hex) =>
  `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

const look = (locator) =>
  locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      text: style.color,
      border: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      height: el.getBoundingClientRect().height,
      weight: style.fontWeight,
      cursor: style.cursor,
      opacity: style.opacity,
    };
  });

/** Hovers a control and waits for its colours to settle (the change is eased). */
async function hovered(page, locator) {
  await locator.hover();
  await page.waitForTimeout(400);
  return look(locator);
}

for (const [name, palette, settings] of [
  ['light', light, { darkMode: false }],
  ['dark', dark, { darkMode: true }],
]) {
  test.describe(`buttons, ${name} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await mockProviders(page);
      await seedStorage(page, { keys: false, settings: { onboarded: false, ...settings } });
      await page.goto('/');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(name);
    });

    test('a primary button takes the primary colours, and the darker one under the pointer', async ({
      page,
    }) => {
      const open = page.getByRole('button', { name: 'Open the app' }).first();
      expect(await look(open)).toMatchObject({
        background: rgb(palette.primary),
        text: rgb(palette.onPrimary),
        borderWidth: '0px',
        radius: radius.md,
        cursor: 'pointer',
      });
      expect(await hovered(page, open)).toMatchObject({
        background: rgb(palette.primaryDark),
        text: rgb(palette.onPrimary),
      });
    });

    test('a secondary button is a bordered surface that takes the tint under the pointer', async ({
      page,
    }) => {
      const browse = page.getByRole('button', { name: 'Browse the library' });
      expect(await look(browse)).toMatchObject({
        background: rgb(palette.surface),
        text: rgb(palette.text),
        border: rgb(palette.border),
        borderWidth: '1px',
      });
      expect(await hovered(page, browse)).toMatchObject({
        background: rgb(palette.tint),
        text: rgb(palette.text),
      });
    });

    test('a large button is taller, rounder and bolder than a medium one', async ({ page }) => {
      const medium = await look(page.getByRole('button', { name: 'Open the app' }).first());
      const large = await look(page.getByRole('button', { name: 'Open the app' }).last());
      expect(medium).toMatchObject({ radius: radius.md, weight: '600' });
      expect(large).toMatchObject({ radius: radius.lg, weight: '700' });
      expect(large.height).toBeGreaterThan(medium.height);
      // Neither is smaller than a finger needs.
      expect(medium.height).toBeGreaterThanOrEqual(Number.parseInt(touchTarget, 10));
    });

    test('with keyboard focus it shows the focus ring and keeps its own corners', async ({
      page,
    }) => {
      const open = page.getByRole('button', { name: 'Open the app' }).first();
      await page.keyboard.press('Tab');
      await expect(open).toBeFocused();
      const ring = () =>
        open.evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            width: style.outlineWidth,
            colour: style.outlineColor,
            radius: style.borderTopLeftRadius,
          };
        });
      // The app-wide focus rule rounds whatever has focus to 8px. The button's
      // own radius has to win, or its corners would jump when it is focused.
      // Polled: the ring's colour eases in with the button's other colours.
      await expect
        .poll(ring)
        .toEqual({ width: '3px', colour: rgb(palette.primary), radius: radius.md });
    });

    test('one that cannot be pressed is dimmed and does not light up', async ({ page }) => {
      const open = page.getByRole('button', { name: 'Open the app' }).last();
      for (const disable of [
        (el) => el.setAttribute('disabled', ''),
        (el) => el.setAttribute('aria-disabled', 'true'),
      ]) {
        await page.mouse.move(2, 2);
        await open.evaluate((el) => {
          el.removeAttribute('disabled');
          el.removeAttribute('aria-disabled');
        });
        await open.evaluate(disable);
        await page.waitForTimeout(300);
        expect(await look(open)).toMatchObject({ opacity: '0.5', cursor: 'default' });
        // `force`: a disabled button is not something Playwright will hover by itself.
        await open.hover({ force: true });
        await page.waitForTimeout(400);
        expect((await look(open)).background).toBe(rgb(palette.primary));
      }
    });
  });
}

test.describe('buttons in high contrast', () => {
  test('a secondary button’s border thickens with the rest of the app’s borders', async ({
    page,
  }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { onboarded: false, highContrast: true } });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hc)).toBe('1');
    const browse = await look(page.getByRole('button', { name: 'Browse the library' }));
    expect(browse.borderWidth).toBe('2px');
  });
});

test.describe('a button that is a link', () => {
  test('the source drawer’s article button, and its close button, are Buttons too', async ({
    page,
  }) => {
    await mockProviders(page);
    await seedStorage(page, { settings: { showAvatar: false, darkMode: false } });
    await page.goto('/#/app/chat');
    await page.getByLabel('Type your question').fill('My mum gets restless every evening.');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'Open source 1' }).last().click();
    const drawer = page.getByRole('dialog', { name: 'Source preview' });
    await expect(drawer).toBeVisible();

    const close = drawer.getByRole('button', { name: 'Close preview' });
    const closeLook = await look(close);
    expect(closeLook).toMatchObject({ background: rgb(light.surface), radius: radius.md });
    // Square, and big enough to press.
    const box = await close.boundingBox();
    expect(Math.round(box.width)).toBe(Number.parseInt(touchTarget, 10));
    expect(Math.round(box.height)).toBe(Number.parseInt(touchTarget, 10));

    const read = drawer.getByRole('button', { name: /Read (full|related) article/ });
    expect(await look(read)).toMatchObject({
      background: rgb(light.primary),
      text: rgb(light.onPrimary),
      radius: radius.lg,
    });
  });
});
