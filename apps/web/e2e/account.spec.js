// The app with Supabase configured (the `supabase` project in
// playwright.config.js): anonymous sign-in, conversations kept on the server,
// the account upgrade in Settings, clearing history from the server, and what
// happens when any of those calls fail. Supabase itself is the in-memory
// backend in support.js (mockSupabase); the other providers are mocked as usual.
import { test, mockProviders, mockSupabase, seedStorage, ask, expect, USER_ID } from './support.js';

async function open(page, path, { supabase = {}, seed = {} } = {}) {
  const log = await mockProviders(page, { answer: 'Keep a calm routine in the evening [S1].' });
  const db = await mockSupabase(page, supabase);
  await seedStorage(page, { ...seed });
  await page.goto(path);
  return { log, db };
}

test.describe('an anonymous account, created on first visit', () => {
  test('a conversation is saved to the account, and Settings says so', async ({ page }) => {
    const { db } = await open(page, '/#/app/chat');
    await expect.poll(() => db.conversations.length).toBe(1);
    expect(db.conversations[0]).toMatchObject({
      user_id: USER_ID,
      surface: 'chat',
      study_arm: null,
    });

    await ask(page, 'What helps in the evenings?');
    await expect(page.getByText(/Keep a calm routine in the evening/).last()).toBeVisible();
    await expect.poll(() => db.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(db.messages[0]).toMatchObject({
      conversation_id: db.conversations[0].id,
      content: 'What helps in the evenings?',
    });

    await page.goto('/#/app/settings');
    await expect(page.getByText('Saved to your account and cached on this device')).toBeVisible();
    await page.getByRole('button', { name: /Data Security/ }).click();
    await expect(page.getByRole('status')).toContainText(
      'Your conversations are saved to your anonymous account'
    );
  });

  test('a returning visitor sees the conversation from the server, not the demo', async ({
    page,
  }) => {
    const created = new Date(Date.UTC(2026, 9, 1, 21, 5)).toISOString();
    await open(page, '/#/app/chat', {
      supabase: {
        conversations: [
          {
            id: 'conv-old',
            user_id: USER_ID,
            surface: 'chat',
            study_arm: null,
            updated_at: created,
          },
        ],
        messages: [
          {
            conversation_id: 'conv-old',
            role: 'user',
            content: 'Is it normal to feel so tired?',
            citations: [],
            created_at: created,
          },
          {
            conversation_id: 'conv-old',
            role: 'assistant',
            content: 'Yes — caring is exhausting. Breaks matter.',
            citations: [],
            created_at: created,
          },
        ],
      },
    });
    await expect(page.getByText('Is it normal to feel so tired?')).toBeVisible();
    await expect(page.getByText('Yes — caring is exhausting. Breaks matter.')).toBeVisible();
    await expect(page.getByText('he lashes out at me')).toHaveCount(0);
  });

  test('history kept in this browser before accounts existed is copied to the account once', async ({
    page,
  }) => {
    const { db } = await open(page, '/#/app/chat', {
      seed: {
        history: [
          { role: 'user', text: 'An old question from before', time: '9:00 am' },
          { role: 'aria', text: 'An old answer from before', citations: [], time: '9:01 am' },
        ],
      },
    });
    await expect
      .poll(() => db.messages.map((m) => m.content))
      .toEqual(['An old question from before', 'An old answer from before']);
    expect(await page.evaluate(() => localStorage.getItem('dg_history_migrated'))).toBe('1');
    await expect(page.getByText('An old question from before')).toBeVisible();
    // Once only: the next visit does not copy it again.
    await page.reload();
    await expect(page.getByText('An old question from before')).toBeVisible();
    await expect
      .poll(() => db.calls.filter((c) => c === 'GET messages').length)
      .toBeGreaterThanOrEqual(2);
    expect(db.messages).toHaveLength(2);
  });

  test('"New conversation" starts a new thread on the server', async ({ page }) => {
    const { db } = await open(page, '/#/app/chat');
    await expect.poll(() => db.conversations.length).toBe(1);
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect.poll(() => db.conversations.length).toBe(2);
    await ask(page, 'A fresh question');
    await expect
      .poll(() => db.messages.filter((m) => m.conversation_id === db.conversations[1].id).length)
      .toBe(2);
  });

  test('clearing history deletes it from the account; a failed delete says so and keeps the screen', async ({
    page,
  }) => {
    const { db } = await open(page, '/#/app/settings');
    await expect(page.getByText('Saved to your account and cached on this device')).toBeVisible();
    const firstId = db.conversations[0].id;
    db.fail.deleteAll = true;
    await page.getByRole('button', { name: /Clear Conversation History/ }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'This deletes all past conversations from your account and this device.'
    );
    await page.getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Could not clear your history — check your connection and try again'
    );

    db.fail.deleteAll = false;
    await page.getByRole('button', { name: /Clear Conversation History/ }).click();
    await page.getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByRole('status')).toHaveText('History cleared');
    // A fresh, empty thread replaces the deleted ones.
    await expect
      .poll(() => db.conversations.map((c) => c.id))
      .toEqual([expect.not.stringMatching(new RegExp(`^${firstId}$`))]);
    expect(db.calls).toContain('DELETE conversations');
  });

  test('the conversations can be attached to an email, from Settings', async ({ page }) => {
    const { db } = await open(page, '/#/app/settings');
    await page.getByRole('button', { name: /Use these conversations on another device/ }).click();
    await page.getByRole('button', { name: 'Not now' }).click();
    await page.getByRole('button', { name: /Use these conversations on another device/ }).click();

    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel('Email').fill('carer@example.nz');
    await page.getByLabel('Choose a password').fill('12345');
    await expect(save).toBeDisabled();
    await page.getByLabel('Choose a password').fill('123456');

    db.fail.updateUser = true;
    await save.click();
    await expect(page.getByRole('alert')).toHaveText(
      'A user with this email address has already been registered'
    );

    db.fail.updateUser = false;
    await save.click();
    await expect(page.getByRole('status')).toHaveText(
      'Check your email to confirm — your conversations are already saved.'
    );
    expect(db.linkedEmail).toBe('carer@example.nz');
  });
});

test.describe('a permanent account', () => {
  test('Settings says the conversations follow the person to any device', async ({ page }) => {
    await open(page, '/#/app/settings', { supabase: { signedIn: 'email' } });
    await expect(page.getByText('Saved to your account', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Your conversations follow you to any device you sign in on.')
    ).toBeVisible();
  });
});

test.describe('when the account service misbehaves', () => {
  test('anonymous sign-in refused: the app still works, and says conversations stay on this device', async ({
    page,
  }) => {
    const { db } = await open(page, '/#/app/chat', { supabase: { fail: { signIn: true } } });
    await expect.poll(() => db.refused).toContain('signIn');
    await ask(page, 'What helps in the evenings?');
    await expect(page.getByText(/Keep a calm routine in the evening/).last()).toBeVisible();
    await page.goto('/#/app/settings');
    await expect(
      page.getByText('Saved on this device only — no account is available')
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your conversations' })).toHaveCount(0);
  });

  test('a failed lookup or create leaves the conversation on this device only', async ({
    page,
  }) => {
    const { db } = await open(page, '/#/app/settings', { supabase: { fail: { lookup: true } } });
    await expect.poll(() => db.refused).toContain('lookup');
    await expect(
      page.getByText('Saved on this device only — no account is available')
    ).toBeVisible();
    expect(db.conversations).toHaveLength(0);
    db.fail.lookup = false;
    db.fail.createConversation = true;
    await page.reload();
    await expect.poll(() => db.refused).toContain('createConversation');
    await expect(
      page.getByText('Saved on this device only — no account is available')
    ).toBeVisible();
    // "New conversation" cannot make a server thread either, and the screen still clears.
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByText("Kia ora, I'm Aaron")).toBeVisible();
    await expect.poll(() => db.refused.filter((r) => r === 'createConversation').length).toBe(2);
  });

  test('failed reads and writes do not interrupt the conversation', async ({ page }) => {
    const created = new Date().toISOString();
    const { db } = await open(page, '/#/app/chat', {
      supabase: {
        conversations: [
          {
            id: 'conv-old',
            user_id: USER_ID,
            surface: 'chat',
            study_arm: null,
            updated_at: created,
          },
        ],
        fail: { loadMessages: true, appendMessage: true },
      },
      seed: { history: [{ role: 'user', text: 'Cached before the outage', time: '9:00 am' }] },
    });
    // The cached copy stays on screen when the server copy cannot be read.
    await expect.poll(() => db.refused).toContain('loadMessages');
    await expect(page.getByText('Cached before the outage')).toBeVisible();
    await ask(page, 'What helps in the evenings?');
    await expect(page.getByText(/Keep a calm routine in the evening/).last()).toBeVisible();
    // The one-time copy of the cached history, then this turn's question and answer.
    await expect.poll(() => db.refused.filter((r) => r === 'appendMessage').length).toBe(3);
    expect(db.messages).toHaveLength(0);

    db.fail.appendMessage = false;
    db.fail.touch = true;
    await ask(page, 'And at night?');
    await expect.poll(() => db.messages.length).toBe(2);
    await expect.poll(() => db.refused).toContain('touch');
  });
});
