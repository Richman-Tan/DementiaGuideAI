// Settings: accessibility (text size, contrast, theme), the avatar picker,
// every avatar-and-audio switch, voice speed, the privacy links, clearing the
// conversation history, the guest access-code card in each of its outcomes,
// the Advanced API keys, and redoing the setup questions.
import { test, mockProviders, seedStorage, ask, expect, OPENAI_KEY } from './support.js';

const CODE = 'e2e-guest-access-code-0001';

async function openSettings(page, { settings = {}, keys = false, access = null } = {}) {
  const log = await mockProviders(page);
  await seedStorage(page, { keys, access, settings: { ...settings } });
  await page.goto('/#/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return log;
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dg_settings')));

test.describe('settings: accessibility and appearance', () => {
  test('text size, high contrast and dark mode apply to the whole app at once', async ({
    page,
  }) => {
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
      ['Show Avatar', 'showAvatar'],
      ['Audio Responses', 'audioResponses'],
      ['Subtitles', 'subtitles'],
      ['Auto-play Responses', 'autoPlay'],
      ['Get to the Point', 'concise'],
      ['Hands-free Conversation', 'handsFree'],
      ['Faster Voice Responses', 'fasterVoice'],
    ]) {
      const toggle = page.getByRole('switch', { name: label });
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      const after = before === 'true' ? 'false' : 'true';
      await expect(toggle).toHaveAttribute('aria-checked', after);
      expect((await stored(page))[key]).toBe(after === 'true');
    }
  });

  test('how answers are written can be changed: who for, detail, medical words and style', async ({
    page,
  }) => {
    await openSettings(page);
    const group = (name) => page.getByRole('radiogroup', { name });

    await expect(group('Who are you asking for?').getByRole('radio', { checked: true })).toHaveText(
      /Someone I care for/
    );
    await group('Who are you asking for?').getByRole('radio', { name: 'Myself' }).click();
    await group('Medical words').getByRole('radio', { name: 'Leave them' }).click();
    // Style is not asked during setup, so this is the only place it is chosen.
    await expect(group('Style').getByRole('radio', { name: 'Warm' })).toBeChecked();
    await group('Style').getByRole('radio', { name: 'Practical' }).click();
    await expect(group('Style')).toHaveAccessibleDescription(
      'Leads with what is most useful and skips long preambles.'
    );
    await group('How much detail?').getByRole('radio', { name: 'Thorough' }).click();
    expect(await stored(page)).toMatchObject({
      setupType: 'exploring',
      jargon: 'fine',
      ariaStyle: 'practical',
      responseStyle: 'thorough',
      concise: false,
    });
  });

  test('"Get to the Point" and the detail choice never disagree', async ({ page }) => {
    await openSettings(page);
    const detail = page.getByRole('radiogroup', { name: 'How much detail?' });
    const toThePoint = page.getByRole('switch', { name: 'Get to the Point' });
    await expect(detail.getByRole('radio', { name: 'Balanced' })).toBeChecked();
    await expect(toThePoint).toHaveAttribute('aria-checked', 'false');

    // The switch overrides the length, so with it on the detail in force is Short.
    await toThePoint.click();
    await expect(detail.getByRole('radio', { name: 'Short' })).toBeChecked();
    expect(await stored(page)).toMatchObject({ concise: true, responseStyle: 'balanced' });
    // And off again, the stored length is back in force.
    await toThePoint.click();
    await expect(detail.getByRole('radio', { name: 'Balanced' })).toBeChecked();

    // Choosing Short turns the switch on; choosing another length turns it off.
    await detail.getByRole('radio', { name: 'Short' }).click();
    await expect(toThePoint).toHaveAttribute('aria-checked', 'true');
    await detail.getByRole('radio', { name: 'Thorough' }).click();
    await expect(toThePoint).toHaveAttribute('aria-checked', 'false');
  });

  test('voice speed is chosen from three and remembered', async ({ page }) => {
    await openSettings(page);
    const speed = page.getByRole('group', { name: 'Voice speed' });
    await speed.getByRole('button', { name: 'Slower' }).click();
    expect((await stored(page)).voiceSpeed).toBe('slower');
    await speed.getByRole('button', { name: 'Faster' }).click();
    expect((await stored(page)).voiceSpeed).toBe('faster');
    await expect(page.getByText('How fast Aaron speaks')).toBeVisible();
  });

  test('the avatar picker offers Aaron and Ariana, with or without the 3D build, and remembers the pick', async ({
    page,
  }) => {
    await openSettings(page, { settings: { avatarId: 'aaron' } });
    const picker = page.getByRole('group', { name: 'Avatar' });
    await expect(picker.getByRole('button')).toHaveText(['Aaron', 'Ariana']);
    await expect(picker.getByRole('button', { name: 'Aaron' })).toBeEnabled();
    await expect(picker.getByRole('button', { name: 'Ariana' })).toBeEnabled();

    await picker.getByRole('button', { name: 'Ariana' }).click();
    await expect(page.getByText("Display Ariana's visual avatar interface")).toBeVisible();
    expect((await stored(page)).avatarId).toBe('ariana');
    await picker.getByRole('button', { name: 'Aaron' }).click();
    expect((await stored(page)).avatarId).toBe('aaron');
  });
});

test.describe('settings: privacy and history', () => {
  test('the privacy, data-security and disclaimer rows explain where things are kept', async ({
    page,
  }) => {
    await openSettings(page);
    await expect(
      page.getByText('Saved on this device only — no account is available')
    ).toBeVisible();
    await page.getByRole('button', { name: /Data Security/ }).click();
    await expect(page.getByRole('status')).toContainText(
      'Sign-in is unavailable, so your conversations are saved on this device only'
    );

    await page.getByRole('link', { name: /Privacy Policy/ }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await page.goto('/#/app/settings');
    await page.getByRole('link', { name: /Medical Disclaimer/ }).click();
    await expect(page.getByRole('heading', { name: 'Medical Disclaimer' })).toBeVisible();
  });

  test('clearing history asks first; "Keep history" changes nothing, "Clear history" empties the chat', async ({
    page,
  }) => {
    await openSettings(page);
    await page.goto('/#/app/chat');
    await ask(page, 'How do I manage sundowning?');
    await expect(page.getByRole('button', { name: 'Open source 1' }).last()).toBeVisible();
    await expect(page.getByText('How do I manage sundowning?')).toHaveCount(2);
    await page.goto('/#/app/settings');
    await page.getByRole('button', { name: /Clear Conversation History/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByRole('heading', { name: 'Clear conversation history?' })
    ).toBeVisible();
    await expect(dialog).toContainText(
      'This removes all past conversations from this device. It cannot be undone.'
    );
    // It is named by its heading and described by its message, and focus
    // starts on the choice that changes nothing.
    await expect(
      page.getByRole('alertdialog', { name: 'Clear conversation history?' })
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep history' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Keep history' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Escape is the same as "Keep history", and puts focus back on the button that asked.
    const clear = page.getByRole('button', { name: /Clear Conversation History/ });
    await clear.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]'))
    ).toBe(true); // Tab stays inside it
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(clear).toBeFocused();
    await page.goto('/#/app/chat');
    await expect(page.getByText('How do I manage sundowning?')).toHaveCount(2); // nothing was cleared
    await page.goto('/#/app/settings');

    await page.getByRole('button', { name: /Clear Conversation History/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByRole('status')).toHaveText('History cleared');
    await page.goto('/#/app/chat');
    await expect(page.getByText("Kia ora, I'm Aaron")).toBeVisible();
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
  test('a code is checked, saved, and can be removed (alongside a personal key)', async ({
    page,
  }) => {
    await openSettings(page, { keys: true });
    const field = page.getByLabel('Access code');
    await expect(page.getByRole('button', { name: 'Use code' })).toBeDisabled();
    await field.fill(CODE);
    await field.press('Enter');
    await expect(page.getByRole('status')).toHaveText(
      'Code accepted. Voice and live answers are on.'
    );
    await expect(page.getByText('An access code is saved on this device.')).toBeVisible();
    await expect(page.getByLabel('Replace the access code')).toBeVisible();

    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status')).toHaveText('Access code removed from this device.');
    expect(await page.evaluate(() => localStorage.getItem('dg_access'))).toBeNull();
  });

  test('a code over today’s limit is kept, and says when it resets', async ({ page }) => {
    await openSettings(page);
    await page.route('**/api/speech', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: '{"error":"study request limit reached for today"}',
      })
    );
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Code accepted, but today’s limit is used up.'
    );
    await expect(
      page.getByText('An access code is saved on this device (today’s limit was reached).')
    ).toBeVisible();
  });

  test('a code that is too short, or that cannot be checked, is not saved', async ({ page }) => {
    await openSettings(page);
    await page.getByLabel('Access code').fill('short-code');
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Access codes are at least 16 characters. Check you copied all of it.'
    );

    await page.route('**/api/speech', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.getByLabel('Access code').fill(CODE);
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'The code could not be checked just now. Try again in a moment.'
    );

    await page.route('**/api/speech', (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Use code' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'The code could not be checked just now. Try again in a moment.'
    );
    expect(await page.evaluate(() => localStorage.getItem('dg_access'))).toBeNull();
  });

  test('a saved code the server stops accepting is flagged in Chat and in Settings', async ({
    page,
  }) => {
    await openSettings(page, { access: { code: CODE, status: 'ok' } });
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"error":"invalid or missing study access code"}',
      })
    );
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'Where can I find respite care?');
    await expect(
      page.getByText('Your access code is no longer accepted — update it in Settings.')
    ).toBeVisible();

    await page.goto('/#/app/settings');
    await expect(
      page.getByText('The saved access code is no longer accepted. Enter a new one.')
    ).toBeVisible();
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
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_keys')))).toEqual({
      openai: OPENAI_KEY,
      eleven: 'el-key',
      azure: 'az-key',
    });

    await page.getByRole('button', { name: 'Clear keys' }).click();
    await expect(page.getByRole('status')).toHaveText('API keys cleared');
    await expect(page.getByLabel('OpenAI API key')).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('dg_keys'))).toBeNull();

    await toggle.click();
    await expect(page.getByLabel('OpenAI API key')).toHaveCount(0);
  });
});
