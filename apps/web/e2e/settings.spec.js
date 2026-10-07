// Settings: accessibility (text size, contrast, theme), the avatar picker,
// every avatar-and-audio switch, voice speed, the privacy links, clearing the
// conversation history, the guest access-code card in each of its outcomes,
// the Advanced API keys, and redoing the setup questions.
import { test, mockProviders, seedStorage, ask, expect, OPENAI_KEY } from './support.js';

const CODE = 'e2e-guest-access-code-0001';

async function openSettings(page, { settings = {}, keys = false, access = null } = {}) {
  const log = await mockProviders(page);
  await seedStorage(page, { keys, access, settings: { avatarId: 'aria', ...settings } });
  await page.goto('/#/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return log;
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dg_settings')));

test.describe('settings: accessibility and appearance', () => {
  test('text size, high contrast and dark mode apply to the whole app at once', async ({ page }) => {
    await openSettings(page, { settings: { darkMode: false } });
    const html = page.locator('html');
    await page.getByRole('button', { name: 'Text size large' }).click();
    await expect(html).toHaveCSS('font-size', '21.25px');
    await page.getByRole('button', { name: 'Text size small' }).click();
    await expect(html).toHaveCSS('font-size', '14.45px');
    await page.getByRole('button', { name: 'Text size medium' }).click();
    await expect(html).toHaveCSS('font-size', '17px');

    const contrast = page.getByRole('switch', { name: 'High Contrast' });
    await contrast.click();
    await expect(contrast).toHaveAttribute('aria-checked', 'true');
    await expect(html).toHaveAttribute('data-hc', '1');

    const dark = page.getByRole('switch', { name: 'Dark Mode' });
    await dark.click();
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await stored(page)).toMatchObject({ textScale: 1, highContrast: true, darkMode: true });
  });

  test('every avatar and audio switch turns on and off, and is remembered', async ({ page }) => {
    await openSettings(page);
    for (const [label, key] of [
      ['Show Avatar', 'showAvatar'], ['Audio Responses', 'audioResponses'], ['Subtitles', 'subtitles'],
      ['Auto-play Responses', 'autoPlay'], ['Get to the Point', 'concise'],
      ['Hands-free Conversation', 'handsFree'], ['Faster Voice Responses', 'fasterVoice'],
    ]) {
      const toggle = page.getByRole('switch', { name: label });
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      const after = before === 'true' ? 'false' : 'true';
      await expect(toggle).toHaveAttribute('aria-checked', after);
      expect((await stored(page))[key]).toBe(after === 'true');
    }
  });

  test('voice speed is chosen from three and remembered', async ({ page }) => {
    await openSettings(page);
    const speed = page.getByRole('group', { name: 'Voice speed' });
    await speed.getByRole('button', { name: 'Slower' }).click();
    expect((await stored(page)).voiceSpeed).toBe('slower');
    await speed.getByRole('button', { name: 'Faster' }).click();
    expect((await stored(page)).voiceSpeed).toBe('faster');
    await expect(page.getByText('How fast Aria speaks')).toBeVisible();
  });

  test('the avatar picker: Unity helpers are locked without their build, the light ones can be chosen', async ({ page }) => {
    await openSettings(page, { settings: { avatarId: 'aaron' } });
    const picker = page.getByRole('group', { name: 'Avatar' });
    await expect(picker.getByRole('button', { name: 'Aaron' })).toBeDisabled();
    await expect(picker.getByRole('button', { name: 'Ariana' })).toBeDisabled();
    await expect(page.getByText('Aaron needs the Unity build — using Aria meanwhile')).toBeVisible();

    await picker.getByRole('button', { name: 'Zhenja' }).click();
    await expect(page.getByText('Aaron needs the Unity build')).toHaveCount(0);
    await expect(page.getByText("Display Zhenja's visual avatar interface")).toBeVisible();
    expect((await stored(page)).avatarId).toBe('zhenja');
    // A locked helper cannot be picked.
    await picker.getByRole('button', { name: 'Aaron' }).click({ force: true });
    expect((await stored(page)).avatarId).toBe('zhenja');
  });
});

test.describe('settings: privacy and history', () => {
  test('the privacy, data-security and disclaimer rows explain where things are kept', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByText('Saved on this device only — no account is available')).toBeVisible();
    await page.getByRole('button', { name: /Data Security/ }).click();
    await expect(page.getByRole('status')).toContainText('Sign-in is unavailable, so your conversations are saved on this device only');

    await page.getByRole('link', { name: /Privacy Policy/ }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await page.goto('/#/app/settings');
    await page.getByRole('link', { name: /Medical Disclaimer/ }).click();
    await expect(page.getByRole('heading', { name: 'Medical Disclaimer' })).toBeVisible();
  });

  test('clearing history asks first; "Keep history" changes nothing, "Clear history" empties the chat', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: /Clear Conversation History/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Clear conversation history?' })).toBeVisible();
    await expect(dialog).toContainText('This removes all past conversations from this device. It cannot be undone.');
    await dialog.getByRole('button', { name: 'Keep history' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await page.getByRole('button', { name: /Clear Conversation History/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByRole('status')).toHaveText('History cleared');
    await page.goto('/#/app/chat');
    await expect(page.getByText("Kia ora, I'm Aria")).toBeVisible();
    await expect(page.getByText('he lashes out at me')).toHaveCount(0);
  });

  test('"Redo the setup questions" starts the onboarding again', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: /Redo the setup questions/ }).click();
    await expect(page).toHaveURL(/#\/onboarding\/1$/);
    expect((await stored(page)).onboarded).toBe(false);
  });
});

test.describe('settings: access code', () => {
  test('a code is checked, saved, and can be removed', async ({ page }) => {
    await openSettings(page);
    const field = page.getByLabel('Access code');
    await expect(page.getByRole('button', { name: 'Use code' })).toBeDisabled();
    await field.fill(CODE);
    await field.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Code accepted. Voice and live answers are on.');
    await expect(page.getByText('An access code is saved on this device.')).toBeVisible();
    await expect(page.getByLabel('Replace the access code')).toBeVisible();

    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status')).toHaveText('Access code removed from this device.');
    expect(await page.evaluate(() => localStorage.getItem('dg_access'))).toBeNull();
  });

  test('a code over today’s limit is kept, and says when it resets', async ({ page }) => {
    await openSettings(page);
    await page.route('**/api/speech', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"study request limit reached for today"}' }));
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toContainText('Code accepted, but today’s limit is used up.');
    await expect(page.getByText('An access code is saved on this device (today’s limit was reached).')).toBeVisible();
  });

  test('a code that is too short, or that cannot be checked, is not saved', async ({ page }) => {
    await openSettings(page);
    await page.getByLabel('Access code').fill('short-code');
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toHaveText('Access codes are at least 16 characters. Check you copied all of it.');

    await page.route('**/api/speech', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toHaveText('The code could not be checked just now. Try again in a moment.');

    await page.route('**/api/speech', (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toHaveText('The code could not be checked just now. Try again in a moment.');
    expect(await page.evaluate(() => localStorage.getItem('dg_access'))).toBeNull();
  });

  test('a saved code the server stops accepting is flagged in Chat and in Settings', async ({ page }) => {
    await openSettings(page, { access: { code: CODE, status: 'ok' } });
    await page.route('**/api/chat', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid or missing study access code"}' }));
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'Where can I find respite care?');
    await expect(page.getByText('Your access code is no longer accepted — update it in Settings.')).toBeVisible();

    await page.goto('/#/app/settings');
    await expect(page.getByText('The saved access code is no longer accepted. Enter a new one.')).toBeVisible();
  });
});

test.describe('settings: advanced API keys', () => {
  test('keys are saved to this browser and can be cleared', async ({ page }) => {
    await openSettings(page);
    const toggle = page.getByRole('button', { name: /API Keys/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.getByLabel('OpenAI API key').fill(OPENAI_KEY);
    await page.getByLabel('ElevenLabs API key').fill('el-key');
    await page.getByLabel('Azure Speech key (not used on web)').fill('az-key');
    await page.getByRole('button', { name: 'Save keys' }).click();
    await expect(page.getByRole('status')).toHaveText('Settings saved');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_keys')))).toEqual({ openai: OPENAI_KEY, eleven: 'el-key', azure: 'az-key' });

    await page.getByRole('button', { name: 'Clear keys' }).click();
    await expect(page.getByRole('status')).toHaveText('API keys cleared');
    await expect(page.getByLabel('OpenAI API key')).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('dg_keys'))).toBeNull();

    await toggle.click();
    await expect(page.getByLabel('OpenAI API key')).toHaveCount(0);
  });
});
