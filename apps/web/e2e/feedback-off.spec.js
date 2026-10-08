// The feedback round as it ships: switched off (the `shipped` project in
// playwright.config.js builds without VITE_STUDY_FEEDBACK). Its link must say
// so, and must never fall back to the tasks study, which has its own consent.
import { test, mockProviders, mockSupabase, seedStorage, expect } from './support.js';

test('with the feedback round switched off, its link says so instead of starting the tasks study', async ({ page }) => {
  await mockProviders(page);
  await mockSupabase(page);
  await seedStorage(page, { keys: false });
  await page.goto('/#/study/feedback');
  await expect(page.getByRole('heading', { name: 'Feedback sessions aren’t open yet' })).toBeVisible();
  await expect(page.getByText('Please check with the person who gave you this link.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  // The tasks study link is unaffected.
  await page.goto('/#/study');
  await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
});
