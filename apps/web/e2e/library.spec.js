// The library: categories, search (titles and, once the bodies have loaded,
// full text), an article with its sources and related articles, asking about
// an article, an article that fails to load, and an address with no article.
import { test, mockProviders, seedStorage, expect } from './support.js';

async function openLibrary(page, path = '/#/app/library') {
  await mockProviders(page);
  await seedStorage(page, { keys: false });
  await page.goto(path);
}

test.describe('library', () => {
  test('a category narrows the list, and its chip clears it again', async ({ page }) => {
    await openLibrary(page);
    await expect(page.getByText('49 articles', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Trusted, curated dementia-care guidance — the same knowledge Aaron uses.')
    ).toBeVisible();

    const homeSafety = page.getByRole('button', { name: /^Home Safety Making the home safe/ });
    await homeSafety.click();
    await expect(page.getByText('7 articles in Home Safety', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Preventing Falls at Home/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Managing Sundowning Behaviour/ })).toHaveCount(
      0
    );
    // Picking the selected category again clears it.
    await homeSafety.click();
    await expect(page.getByText('49 articles', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Carer Wellbeing Supporting/ }).click();
    await page.getByLabel('Search the library').fill('respite');
    await expect(
      page.getByText(/^\d+ articles? in Carer Wellbeing matching “respite”$/)
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /What Respite Care Options Are Available/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Managing Sundowning Behaviour/ })).toHaveCount(
      0
    );
    await page.getByRole('button', { name: 'Carer Wellbeing ✕' }).click();
    await expect(page.getByText('49 articles', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Search the library')).toHaveValue('');
  });

  test('search matches words inside the articles, not only titles', async ({ page }) => {
    await openLibrary(page);
    // "pharmac…" appears in no title or summary, only in article text.
    await page.getByLabel('Search the library').fill('pharmac');
    await expect(page.getByText('7 articles matching “pharmac”', { exact: true })).toBeVisible();
  });

  test('a search with no results suggests asking in Chat', async ({ page }) => {
    await openLibrary(page);
    await page.getByLabel('Search the library').fill('zzqx no such topic');
    await expect(page.getByText('No matches')).toBeVisible();
    await expect(page.getByText('0 articles matching “zzqx no such topic”')).toBeVisible();
    await page.getByRole('button', { name: 'Ask Aaron in Chat' }).click();
    await expect(page).toHaveURL(/#\/app\/chat$/);
  });

  test('an article shows its body, tags and sources; related articles and the breadcrumb navigate', async ({
    page,
  }) => {
    await openLibrary(page);
    await page.getByRole('button', { name: /Understanding a Dementia Diagnosis/ }).click();
    await expect(page).toHaveURL(/#\/app\/library\/diagnosis$/);
    await expect(
      page.getByRole('heading', { name: 'Understanding a Dementia Diagnosis', level: 1 })
    ).toBeVisible();
    await expect(page.getByText('5 min read')).toBeVisible();
    await expect(page.getByText('Next steps', { exact: true })).toBeVisible();
    // The body has headings, lists (numbered too) and a sources list.
    await expect(page.locator('main ol li').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByText(/Adapted for Aotearoa New Zealand · Last updated/)).toBeVisible();

    await page.getByRole('heading', { name: 'Related articles' }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /Understanding the Stages of Dementia/ }).click();
    await expect(page).toHaveURL(/#\/app\/library\/stages$/);
    await expect(
      page.getByRole('heading', { name: 'Understanding the Stages of Dementia', level: 1 })
    ).toBeVisible();
    await expect(page.getByText('Loading article…')).toHaveCount(0);

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Library' })
      .click();
    await expect(page).toHaveURL(/#\/app\/library$/);
  });

  test('"Ask Aaron about this" asks about the article in Chat', async ({ page }) => {
    await openLibrary(page, '/#/app/library/wandering');
    await expect(
      page.getByRole('heading', {
        name: 'Wandering Prevention and Safe-Return Strategies',
        level: 1,
      })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ask Aaron about this' }).click();
    await expect(page).toHaveURL(/#\/app\/chat$/);
    await expect(
      page.getByText('Tell me more about wandering prevention and safe-return strategies')
    ).toBeVisible();
    await expect(page.getByText(/Wandering usually has a reason behind it/)).toBeVisible();
  });

  test('an article missing from its category says it could not be loaded; Try again checks again', async ({
    page,
  }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    // The category's text arrives empty the first time (a cut-off download).
    let served = 0;
    await page.route(/\/src\/data\/articles\/prevention\.js/, async (route) => {
      served += 1;
      if (served === 1)
        return route.fulfill({
          status: 200,
          contentType: 'text/javascript',
          body: 'export const BODIES = {};',
        });
      return route.fallback();
    });
    await page.goto('/#/app/library/early-signs');
    await expect(
      page.getByText("This article couldn't be loaded. Check your connection and try again.")
    ).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    // The empty category is remembered for this visit, so it stays unavailable.
    await expect(
      page.getByText("This article couldn't be loaded. Check your connection and try again.")
    ).toBeVisible();
    // The rest of the page still works.
    await expect(page.getByRole('heading', { name: 'Related articles' })).toBeVisible();
  });

  test('an article whose download fails says so, and the rest of the page still works', async ({
    page,
  }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.route(/\/src\/data\/articles\/safety\.js/, (route) =>
      route.abort('connectionreset')
    );
    await page.goto('/#/app/library/falls');
    const failed = page.getByText(
      "This article couldn't be loaded. Check your connection and try again."
    );
    await expect(failed).toBeVisible();
    // Chromium remembers a failed module download for the life of the page, so
    // Try again cannot fetch it again without a reload; it must not break anything.
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(failed).toBeVisible();
    await page.getByRole('button', { name: /Kitchen and Bathroom Safety/ }).click();
    await expect(page).toHaveURL(/#\/app\/library\/kitchen-bathroom$/);
  });

  test('an unknown article offers the way back to the Library', async ({ page }) => {
    await openLibrary(page, '/#/app/library/no-such-article');
    await expect(
      page.getByRole('heading', { name: "We couldn't find that article" })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to Library' }).click();
    await expect(page).toHaveURL(/#\/app\/library$/);
  });
});
