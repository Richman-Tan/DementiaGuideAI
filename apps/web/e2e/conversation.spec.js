// The spoken conversation (the `server` project in playwright.config.js, built
// with VITE_TURN_ENDPOINT=on): an open microphone, turn-taking, and talking
// over the avatar. A visitor with no key and no access code.
//
// What is real: the app, the audio worklet, the speech detector, the
// turn-taking machine and its timers, and the avatar's audio engine playing
// real (short) audio. What is scripted: the microphone (a tone the test turns
// on and off, support.js installFakeMedia), the browser's speech recogniser,
// and the two server endpoints, answered here in their real formats.
import { AxeBuilder } from '@axe-core/playwright';
import {
  test,
  mockProviders,
  mockSupabase,
  seedStorage,
  installFakeMedia,
  elevenRestBody,
  expect,
  slow,
} from './support.js';

const AARON_VOICE = 'nPczCjzI2devNBz1zQrb';
const LEAD = ['Keep the late afternoon calm. ', 'Close the curtains at dusk.'];
const FULL =
  'Keep the late afternoon calm [1]. Close the curtains at dusk.\n\nRing your GP if it gets worse.';

function turnStream(extra = {}) {
  const events = [
    {
      type: 'meta',
      pipelineVersion: 'v3-claude-nz@e2e',
      promptVersion: 'v3-claude-nz',
      model: 'claude-opus-5-5',
      modality: 'voice',
    },
    { type: 'retrieval', mode: 'fresh', query: 'q', chunks: [], ms: 40 },
    { type: 'safety', level: 'none', categories: [], source: 'triage' },
    ...LEAD.map((text) => ({ type: 'token', text, section: 'lead' })),
    { type: 'token', text: 'Ring your GP if it gets worse.', section: 'detail' },
    { type: 'final', text: FULL, marked: FULL, lead: LEAD.join('').trim(), sources: [], ...extra },
    { type: 'done', stopReason: 'end_turn' },
  ];
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
    body: events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
  };
}

/**
 * Opens the voice screen as a visitor with nothing stored but their settings.
 * `audioSeconds` is how long each spoken sentence lasts; `speak` overrides the
 * speech endpoint's reply.
 */
async function open(page, { audioSeconds = 0.6, speak = null, media = {}, settings = {} } = {}) {
  await mockProviders(page);
  await mockSupabase(page);
  const log = { turns: [], speech: [] };
  await page.route('**/api/turn', async (route) => {
    log.turns.push(route.request().postDataJSON());
    await route.fulfill(turnStream());
  });
  await page.route('**/api/speak', async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    log.speech.push({ authorization: request.headers().authorization, ...body });
    await route.fulfill(
      speak
        ? speak(body)
        : {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(elevenRestBody(body.text, audioSeconds)),
          }
    );
  });
  await seedStorage(page, {
    keys: false,
    settings: { showAvatar: false, ...settings },
    history: [
      { role: 'user', text: 'Hello', time: '9:00 am' },
      { role: 'aria', text: 'Kia ora. How can I help?', time: '9:00 am' },
    ],
  });
  await installFakeMedia(page, media);
  await page.goto('/#/app/voice');
  return log;
}

const mic = (page, name) => page.getByRole('button', { name, exact: true });

/** Starts the conversation and waits until the microphone is live, not just asked for. */
async function listening(page) {
  await mic(page, 'Start talking').click();
  await expect(mic(page, 'End conversation')).toBeVisible();
  await expect(page.getByText('Aaron will notice when you finish speaking')).toBeVisible();
}

/** The person says this: sound on the microphone, the words recognised, then quiet. */
async function say(page, text) {
  await page.evaluate(async (words) => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__stt.voice(true);
    await pause(400);
    window.__stt.say(words);
    await pause(300);
    window.__stt.voice(false);
  }, text);
}

/** Starts talking over whatever is playing, and keeps going. */
async function interrupt(page, text) {
  await page.evaluate(async (words) => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__stt.voice(true);
    await pause(350); // the recogniser starts afresh at the sound
    window.__stt.say(words);
  }, text);
}

test.describe('a spoken conversation, with no key and no access code', () => {
  test('nothing to set up: the microphone opens, a question is answered aloud, and it listens again', async ({
    page,
  }) => {
    // Each sentence lasts long enough for its caption to be read.
    const log = await open(page, { audioSeconds: 1.5 });
    // No setup card on this path: the server holds the keys.
    await expect(page.getByText('Tap the mic or type below')).toBeVisible();
    await expect(page.getByLabel(/OpenAI/i)).toHaveCount(0);

    await listening(page);
    // The open-microphone screen passes the automated accessibility rules.
    const listeningScreen = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      listeningScreen.violations.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`)
    ).toEqual([]);

    await say(page, 'How do I manage sundowning');
    await expect(page.getByText('How do I manage sundowning')).toBeVisible();

    // Sent on its own once the pause has run out, as a spoken turn.
    await expect.poll(() => log.turns.length, { timeout: slow(8000) }).toBe(1);
    expect(log.turns[0]).toMatchObject({
      message: 'How do I manage sundowning',
      modality: 'voice',
      avatar: 'aaron',
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Kia ora. How can I help?' },
      ],
    });

    // The part meant for speaking is voiced a sentence at a time, by the server.
    await expect(page.getByText('Aaron is speaking')).toBeVisible();
    await expect(page.getByText('Keep the late afternoon calm.').first()).toBeVisible();
    await expect(page.getByText('Close the curtains at dusk.').first()).toBeVisible();
    await expect.poll(() => log.speech.length).toBe(2);
    expect(log.speech[0]).toEqual({
      authorization: 'Bearer e2e-access-token',
      text: 'Keep the late afternoon calm.',
      voiceId: AARON_VOICE,
      speechRate: 0.78,
    });
    expect(log.speech[1].text).toBe('Close the curtains at dusk.');

    // And then it is the person's turn again, with the microphone still open.
    await expect(mic(page, 'End conversation')).toBeVisible({ timeout: slow(15_000) });

    // The next question carries what was said and heard.
    await say(page, 'What about at night');
    await expect.poll(() => log.turns.length, { timeout: slow(8000) }).toBe(2);
    expect(log.turns[1].message).toBe('What about at night');
    expect(log.turns[1].history.slice(-2)).toEqual([
      { role: 'user', content: 'How do I manage sundowning' },
      { role: 'assistant', content: FULL },
    ]);
  });

  test('talking over the avatar stops it, and what was heard of the answer is what is kept', async ({
    page,
  }) => {
    const log = await open(page, { audioSeconds: 4 });
    await listening(page);
    await say(page, 'How do I manage sundowning');
    await expect(page.getByText('Aaron is speaking')).toBeVisible({ timeout: slow(10_000) });

    await interrupt(page, 'sorry what about her tablets');
    // It stops and listens: the button is now "I'm done", and nothing is being said.
    await expect(mic(page, 'I’m done')).toBeVisible({ timeout: slow(5000) });
    await expect(page.getByText('Aaron is speaking')).toHaveCount(0);
    await expect(page.getByText('sorry what about her tablets')).toBeVisible();

    await page.evaluate(() => window.__stt.voice(false));
    await expect.poll(() => log.turns.length, { timeout: slow(8000) }).toBe(2);
    expect(log.turns[1].message).toBe('sorry what about her tablets');
    // The first answer is in the history as far as it was heard, not in full.
    expect(log.turns[1].history.slice(-2)).toEqual([
      { role: 'user', content: 'How do I manage sundowning' },
      { role: 'assistant', content: 'Keep the late afternoon calm.…' },
    ]);
  });

  test('"I’m done" sends what has been said without waiting out the pause', async ({ page }) => {
    const log = await open(page);
    await listening(page);
    await page.evaluate(async () => {
      window.__stt.voice(true);
      await new Promise((r) => setTimeout(r, 300));
      window.__stt.say('She seems very tired and');
    });
    await mic(page, 'I’m done').click();
    await expect.poll(() => log.turns.length).toBe(1);
    expect(log.turns[0].message).toBe('She seems very tired and');
    await page.evaluate(() => window.__stt.voice(false));
  });

  test('a typed question is answered aloud with the microphone left closed, and can be repeated', async ({
    page,
  }) => {
    const log = await open(page);
    await page.getByLabel('Message Aaron').fill('How do I manage sundowning?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Aaron is speaking')).toBeVisible();
    await expect.poll(() => log.speech.length).toBe(2);
    await expect(page.getByText('Tap the mic or type below')).toBeVisible({
      timeout: slow(15_000),
    });
    await expect(mic(page, 'Start talking')).toBeVisible();
    expect(await page.evaluate(() => window.__stt.streams.length)).toBe(0); // never opened

    // Repeat says the spoken part again, without asking the server for another answer.
    await page.getByRole('button', { name: 'Repeat last answer' }).click();
    await expect(page.getByText('Aaron is speaking')).toBeVisible();
    await expect.poll(() => log.speech.length).toBe(4);
    expect(log.speech[2].text).toBe('Keep the late afternoon calm.');
    expect(log.turns).toHaveLength(1);
  });

  test('when speech cannot be produced, the answer comes as captions and the screen says so', async ({
    page,
  }) => {
    const log = await open(page, {
      speak: () => ({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: "The live demo has reached today's limit.",
          code: 'demo_limit',
        }),
      }),
    });
    await page.getByLabel('Message Aaron').fill('How do I manage sundowning?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(
      page.getByText('I can’t speak just now, so my answers will appear as text.')
    ).toBeVisible();
    await expect(page.getByText('Keep the late afternoon calm.').first()).toBeVisible();
    await expect(page.getByText('Tap the mic or type below')).toBeVisible({
      timeout: slow(15_000),
    });
    // Both sentences arrive at once here, so both were asked for before the
    // first refusal came back; none is asked for after it.
    expect(log.speech.length).toBeLessThanOrEqual(2);
  });

  test('a blocked microphone is explained, and typing still works', async ({ page }) => {
    const log = await open(page, { media: { mic: 'denied' } });
    await mic(page, 'Start talking').click();
    await expect(page.getByRole('alert')).toContainText(
      'Microphone access is blocked. Allow it in your browser settings to talk with Aaron'
    );
    await expect(mic(page, 'Start talking')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await page.getByLabel('Message Aaron').fill('How do I manage sundowning?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => log.turns.length).toBe(1);
  });

  test('ending the conversation closes the microphone', async ({ page }) => {
    await open(page);
    await listening(page);
    await expect.poll(() => page.evaluate(() => window.__stt.streams.length)).toBe(1);
    await mic(page, 'End conversation').click();
    await expect(mic(page, 'Start talking')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__stt.micReleased())).toBe(true);
  });
});
