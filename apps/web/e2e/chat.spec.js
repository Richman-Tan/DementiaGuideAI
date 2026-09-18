// Flows (a)–(c): the text chat with a BYO key, every provider mocked.
import { test } from '@playwright/test';
import { createRequire } from 'node:module';
import { mockProviders, seedStorage, ask, expect, CHUNKS } from './support.js';

const require = createRequire(import.meta.url);
// The same constants the client uses, so the assertion cannot drift from the config.
const { maxTokensForStyle } = require('../../../packages/core/rag/ragConfig.js');

test.describe('text chat (BYO key, mocked providers)', () => {
  test('(a) a question streams an answer with citation markers, and the source drawer lists the cited source', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page);
    await page.goto('/#/app/chat');

    await ask(page, 'My mum gets restless and upset every evening. What can I try?');

    // The reply renders with renumbered [1]/[2] badges (the raw [S#] markers
    // are stripped by the real marker stripper). Outside a study the screen
    // also shows the seeded demo thread, which has badges of its own, so the
    // assertions are scoped to the newest reply.
    await expect(page.getByText(/close the curtains before dusk/).last()).toBeVisible();
    await expect(page.getByText('[S1]')).toHaveCount(0);
    const cite1 = page.getByRole('button', { name: 'Open source 1' }).last();
    await expect(cite1).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open source 2' }).last()).toBeVisible();

    // Retrieval ran once against the RPC with the production arguments.
    expect(log.embed.length).toBeGreaterThanOrEqual(1);
    expect(log.rpc.length).toBe(1);
    expect(log.rpc[0]).toMatchObject({ match_count: 50, min_similarity: 0.25 });
    expect(log.rpc[0].query_embedding).toHaveLength(1536);

    // The chat request carried the retrieved passages and the production model.
    expect(log.chat).toHaveLength(1);
    expect(log.chat[0].model).toBe('gpt-4o');
    expect(log.chat[0].stream).toBe(true);
    const userMsg = log.chat[0].messages.at(-1);
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toContain('[S1] ' + CHUNKS[0].title);

    // Opening a citation shows the drawer with that source's title and organisation.
    await cite1.click();
    const drawer = page.getByRole('dialog', { name: 'Source preview' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: CHUNKS[0].title })).toBeVisible();
    await expect(drawer.getByText(CHUNKS[0].source_org).first()).toBeVisible();
    await drawer.getByRole('button', { name: 'Close preview' }).click();
    await expect(drawer).toHaveCount(0);
  });

  test('(b) an emergency question shows the safety callout and the answer escalates to 111', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page);
    await page.goto('/#/app/chat');

    await ask(page, "My mother has collapsed and isn't breathing — is this an emergency?");

    await expect(page.getByText(/Call 111 now/).last()).toBeVisible();
    // The amber callout sits inside the newest reply bubble.
    const bubble = page.getByText(/Call 111 now/).last().locator('xpath=ancestor-or-self::div[contains(@style, "border-left")][1]');
    await expect(bubble.getByText('If you need help now:')).toBeVisible();
    // The escalation passage is what the answer cites.
    await expect(bubble.getByRole('button', { name: 'Open source 1' })).toBeVisible();
  });

  test('(c) the "Get to the Point" setting changes max_tokens in the chat request', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page);

    await page.goto('/#/app/chat');
    await ask(page, 'How do I handle the same question being asked over and over?');
    await expect(page.getByText(/close the curtains before dusk/).last()).toBeVisible();
    expect(log.chat[0].max_tokens).toBe(maxTokensForStyle('balanced', false));

    // Flip the concise toggle in Settings, then ask again.
    await page.goto('/#/app/settings');
    const toggle = page.getByRole('switch', { name: 'Get to the Point' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await page.goto('/#/app/chat');
    await ask(page, 'And what about evenings?');
    await expect.poll(() => log.chat.length).toBe(2);
    expect(log.chat[1].max_tokens).toBe(maxTokensForStyle('balanced', true));
    expect(log.chat[1].max_tokens).toBeLessThan(log.chat[0].max_tokens);
  });
});
