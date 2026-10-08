// Flows (a)–(c): the text chat with a BYO key, every provider mocked.
import { createRequire } from 'node:module';
import { test, mockProviders, seedStorage, ask, expect, CHUNKS } from './support.js';

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

test.describe('chat without a key (built-in example answers)', () => {
  test('the demo conversation, then a new one: empty state, a suggested question, sources and the article they come from', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria' } });
    await page.goto('/#/app/chat');
    // The demo thread, with its safety callout on the aggression answer.
    await expect(page.getByText('Some evenings he lashes out at me and I get scared. What should I do?')).toBeVisible();
    await expect(page.getByText('If you need help now:')).toBeVisible();

    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByText("Kia ora, I'm Aria")).toBeVisible();
    await expect(page.getByText('he lashes out at me')).toHaveCount(0);
    await page.getByRole('button', { name: 'What are early signs of dementia?' }).click();
    await expect(page.getByText(/Early dementia usually shows up as changes/)).toBeVisible();
    // While the answer streams the panel says so; afterwards it is listening again.
    await expect(page.getByText('Aria is listening')).toBeVisible();

    // A source chip opens the drawer on the library article it came from.
    await page.getByRole('button', { name: 'What Are the Early Signs of Dementia' }).click();
    const drawer = page.getByRole('dialog', { name: 'Source preview' });
    await expect(drawer.getByText('Reviewed content · 6 min read')).toBeVisible();
    await drawer.getByRole('button', { name: 'Read full article →' }).click();
    await expect(page).toHaveURL(/#\/app\/library\/early-signs$/);
    await expect(page.getByRole('heading', { name: 'What Are the Early Signs of Dementia' })).toBeVisible();
  });

  test('a question with no matching guide gets the general answer; "Get to the Point" shortens it', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { concise: true } });
    await page.goto('/#/app/chat');
    await ask(page, 'Tell me about gardening together');
    await expect(page.getByText(/Look for the need behind the behaviour, keep routines steady/)).toBeVisible();
    await page.getByText(/Look for the need behind the behaviour/).getByRole('button', { name: 'Open source 1' }).click();
    await expect(page.getByRole('dialog', { name: 'Source preview' }).getByRole('heading', { name: 'Person-Centred Care Principles' })).toBeVisible();
    // Clicking outside the drawer closes it.
    await page.mouse.click(40, 400);
    await expect(page.getByRole('dialog', { name: 'Source preview' })).toHaveCount(0);
  });

  test('the side panel hides and comes back', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria' } });
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(page.getByRole('button', { name: 'Hide panel' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show Aria panel' }).click();
    await expect(page.getByText('Aria is listening')).toBeVisible();
  });
});

test.describe('chat failures and recovery (BYO key)', () => {
  test('a failed answer offers Retry, which asks again and succeeds', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page);
    let fail = true;
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      if (fail) { fail = false; return route.fulfill({ status: 500, body: 'upstream exploded' }); }
      return route.fallback();
    });
    await page.goto('/#/app/chat');
    await ask(page, 'My mum gets restless every evening. What can I try?');
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/close the curtains before dusk/).last()).toBeVisible();
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toHaveCount(0);
    expect(log.chat).toHaveLength(1);
  });

  for (const [status, copy] of [
    [429, 'The AI service is rate-limited right now — wait a moment and retry.'],
    [401, 'Your OpenAI API key looks invalid — check it in Settings → Advanced.'],
    [403, "I couldn't reach the knowledge base — try again."],
  ]) {
    test(`an HTTP ${status} from the AI service is explained in plain words`, async ({ page }) => {
      await mockProviders(page);
      await seedStorage(page);
      await page.route('https://api.openai.com/v1/chat/completions', (route) => route.fulfill({ status, body: '{}' }));
      await page.goto('/#/app/chat');
      await ask(page, 'Where can I find respite care?');
      await expect(page.getByText(copy)).toBeVisible();
    });
  }

  test('when retrieval fails, the answer still comes, without sources', async ({ page }) => {
    await mockProviders(page, { answer: 'A calm, predictable evening routine usually helps.' });
    await seedStorage(page);
    await page.route('**/rest/v1/rpc/match_chunks', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"db down"}' }));
    await page.goto('/#/app/chat');
    await ask(page, 'What helps in the evenings?');
    await expect(page.getByText('A calm, predictable evening routine usually helps.')).toBeVisible();
  });

  test('sources without a library article or a public link say so in the drawer', async ({ page }) => {
    await mockProviders(page, { answer: 'Respite helps carers keep going [S1]. Ask about local groups [S2].' });
    await seedStorage(page);
    await page.route('**/rest/v1/rpc/match_chunks', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'x1', document_id: 'x1', title: 'Notes from a carers meeting', source_org: 'Carer Network', source_url: null, content: 'Breaks help.', similarity: 0.8 },
        { id: 'x2', document_id: 'x2', title: 'Untitled', source_org: null, source_url: null, content: 'Groups meet weekly.', similarity: 0.7 },
      ]),
    }));
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'How do I keep going as a carer?');
    const drawer = page.getByRole('dialog', { name: 'Source preview' });

    await page.getByRole('button', { name: 'Open source 1' }).click();
    await expect(drawer.getByText('Source: Carer Network')).toBeVisible();
    await expect(drawer.getByText('This source doesn’t have a public link — it comes from Carer Network’s materials.')).toBeVisible();
    await drawer.getByRole('button', { name: 'Close preview' }).click();

    await page.getByRole('button', { name: 'Open source 2' }).click();
    await expect(drawer.getByText('Knowledge base source')).toBeVisible();
    await expect(drawer.getByText('This source doesn’t have a public link.')).toBeVisible();
  });

  test('a source that matches a library article links to it and to the original', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page);
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'My mum gets restless every evening. What can I try?');
    await page.getByRole('button', { name: 'Open source 1' }).click();
    const drawer = page.getByRole('dialog', { name: 'Source preview' });
    await expect(drawer.getByRole('link', { name: 'View original source — opens in a new tab' })).toHaveAttribute('href', 'https://alzheimers.org.nz/sundowning');
    await drawer.getByRole('button', { name: 'Read related article →' }).click();
    await expect(page).toHaveURL(/#\/app\/library\/managing-sundowning$/);
  });
});

test.describe('chat scrolling', () => {
  test('scrolling up to reread shows "Jump to latest", which returns to the newest message', async ({ page }) => {
    await mockProviders(page);
    const history = [];
    for (let i = 1; i <= 15; i++) {
      history.push({ role: 'user', text: `Question number ${i}`, time: '9:00 am' });
      history.push({ role: 'aria', text: `Answer number ${i}. ${'A calm routine helps. '.repeat(6)}`, citations: [], time: '9:01 am' });
    }
    await seedStorage(page, { history });
    await page.goto('/#/app/chat');
    await expect(page.getByText('Question number 15')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Jump to latest ↓' })).toHaveCount(0);

    await page.getByText('Question number 15').hover();
    await page.mouse.wheel(0, -4000);
    await expect(page.getByRole('button', { name: 'Jump to latest ↓' })).toBeVisible();
    await expect(page.getByText('Question number 15')).not.toBeInViewport();

    await page.getByRole('button', { name: 'Jump to latest ↓' }).click();
    await expect(page.getByRole('button', { name: 'Jump to latest ↓' })).toHaveCount(0);
    await expect(page.getByText('Question number 15')).toBeInViewport();

    // A long draft grows the composer without hiding the newest message.
    await page.getByLabel('Type your question').fill('line one\nline two\nline three\nline four\nline five\nline six\nline seven');
    await expect(page.getByText(/^Answer number 15\./)).toBeInViewport();
  });
});

test.describe('chat on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the source drawer opens as a bottom sheet and there is no side panel', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page);
    await page.goto('/#/app/chat');
    await expect(page.getByRole('button', { name: 'Hide panel' })).toHaveCount(0);
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'My mum gets restless every evening. What can I try?');
    await page.getByRole('button', { name: 'Open source 1' }).click();
    const drawer = page.getByRole('dialog', { name: 'Source preview' });
    await expect(drawer).toBeVisible();
    // Full width (less any scrollbar gutter) and anchored to the bottom edge.
    const box = await drawer.boundingBox();
    const view = page.viewportSize();
    expect(box.x).toBe(0);
    expect(box.width).toBeGreaterThan(view.width * 0.9);
    expect(box.y + box.height).toBeGreaterThan(view.height - 20);
  });
});

test.describe('chat: slow and broken answers', () => {
  test('an AI service that never starts answering is given up on, and Retry works', async ({ page }) => {
    await page.clock.install();
    await mockProviders(page);
    await seedStorage(page);
    let hang = true;
    let waiting = false;
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      if (hang) { hang = false; waiting = true; return; } // never answered: the request just hangs
      return route.fallback();
    });
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'My mum gets restless every evening. What can I try?');
    // Waiting for the first byte gives up after twelve seconds.
    await expect.poll(() => waiting).toBe(true);
    await page.clock.fastForward(13_000);
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/close the curtains before dusk/)).toBeVisible();
  });

  test('an answer cut off mid-stream is not shown as complete', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page);
    await page.route('https://api.openai.com/v1/chat/completions', (route) => route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: ': keep-alive\n\ndata: not-json\n\n'
        + `data: ${JSON.stringify({ choices: [{ delta: { content: 'A calm routine' } }] })}\n\n`
        + `data: ${JSON.stringify({ error: 'stream_interrupted' })}\n\n`,
    }));
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'What helps in the evenings?');
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toBeVisible();
    await expect(page.getByText('A calm routine', { exact: true })).toHaveCount(0);
  });

  test('asking the same thing twice reuses the question’s search embedding', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page);
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'What helps in the evenings?');
    await expect(page.getByText(/close the curtains before dusk/)).toBeVisible();
    await ask(page, 'What helps in the evenings?');
    await expect.poll(() => log.chat.length).toBe(2);
    expect(log.embed).toHaveLength(1);
    expect(log.rpc).toHaveLength(2);
  });
});

test.describe('chat: changing course mid-answer', () => {
  test('?mock=1 forces the example answers even with a key; a second question while one is coming waits its turn', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page);
    await page.goto('/?mock=1#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'How do I manage sundowning?');
    // Sent while the first answer is still "typing": ignored.
    await ask(page, 'And bathing?');
    await expect(page.getByText(/Sundowning — becoming more restless or confused/)).toBeVisible();
    await expect(page.getByText('And bathing?')).toHaveCount(0);
    expect(log.chat).toHaveLength(0);
  });

  test('"New conversation" while an example answer is coming cancels it', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria' } });
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'How do I manage sundowning?');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByText("Kia ora, I'm Aria")).toBeVisible();
    // The cancelled answer never arrives.
    await page.waitForTimeout(1500);
    await expect(page.getByText(/Sundowning — becoming more restless/)).toHaveCount(0);
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toHaveCount(0);
  });

  test('"New conversation" while a live answer is on its way cancels the request', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { settings: { avatarId: 'aria' } });
    let pending = false;
    await page.route('https://api.openai.com/v1/chat/completions', () => { pending = true; }); // never answered
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'What helps in the evenings?');
    await expect.poll(() => pending).toBe(true);
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByText("Kia ora, I'm Aria")).toBeVisible();
    await expect(page.getByText("I couldn't reach the knowledge base — try again.")).toHaveCount(0);
  });

  test('a stray bracket number stays plain text, and a reply ending mid-marker keeps its last characters', async ({ page }) => {
    await mockProviders(page, { answer: 'Keep a calm routine [S1]. Step [3] of your plan still applies [S' });
    await seedStorage(page);
    await page.goto('/#/app/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'What helps in the evenings?');
    await expect(page.getByRole('button', { name: 'Open source 1' })).toBeVisible();
    await expect(page.getByText(/Step \[3\] of your plan/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open source 3' })).toHaveCount(0);
  });
});
