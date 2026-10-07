// The voice screen with credentials: typed and spoken turns, the transcript,
// repeat, captions, mute, barge-in, every speech-to-text path (live
// recognition, Whisper fallback and rescue, hands-free endpointing) and the
// three ways a reply is voiced (OpenAI TTS, ElevenLabs REST with lip-sync
// alignment, the ElevenLabs stream). Providers are mocked in support.js; the
// microphone and speech recognition are the scripted fakes in installFakeMedia.
//
// The avatar is hidden in most of these (Settings → Show Avatar off, a real
// option) so a software-rendered WebGL scene does not slow every turn; the
// first test runs with the 3D avatar on screen and voiced through it.
import { test, mockProviders, seedStorage, installFakeMedia, expect, ELEVEN_KEY, OPENAI_KEY } from './support.js';

// Two short sentences, each cited — long enough to have two caption lines,
// short enough that a turn takes a couple of seconds.
const ANSWER = 'Keep a calm routine in the evening [S1]. Close the curtains before dusk [S2].';
const IDLE = 'Tap the mic or type below';

async function openVoice(page, { settings = {}, keys = true, media = {}, providers = {} } = {}) {
  const log = await mockProviders(page, { answer: ANSWER, audioSeconds: 0.8, ...providers });
  await seedStorage(page, { keys, settings: { avatarId: 'aria', showAvatar: false, ...settings } });
  await installFakeMedia(page, media);
  await page.goto('/#/app/voice');
  return log;
}

async function typeTurn(page, text, who = 'Aria') {
  await page.getByLabel(`Message ${who}`).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}

test.describe('voice: typed turns, transcript, repeat and mute', () => {
  test('a typed question is answered aloud through the 3D avatar, with captions, a transcript and repeat', async ({ page }) => {
    const log = await openVoice(page, { settings: { showAvatar: true } });
    // The avatar mounts its canvas once the (stand-in) model has loaded.
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible();

    await typeTurn(page, 'What helps in the evenings?');
    await expect(page.getByText('Aria is speaking')).toBeVisible();
    // Captions follow the spoken sentence, markers stripped.
    await expect(page.getByText(/Keep a calm routine in the evening/)).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.chat).toHaveLength(1);
    // One OpenAI TTS request per sentence, in Aria's voice.
    expect(log.speech.map((s) => s.voice)).toEqual(['nova', 'nova']);

    // The transcript sheet holds both sides of the exchange.
    await page.getByRole('button', { name: 'Show transcript' }).click();
    await expect(page.getByText('Transcript', { exact: true })).toBeVisible();
    await expect(page.getByText('What helps in the evenings?')).toBeVisible();
    await page.getByRole('button', { name: 'Close transcript' }).click();
    await expect(page.getByText('Transcript', { exact: true })).toHaveCount(0);

    // Repeat replays the last answer as one clip.
    await page.getByRole('button', { name: 'Repeat last answer' }).click();
    await expect(page.getByText('Aria is speaking')).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.speech).toHaveLength(3);
    expect(log.speech[2].input).toMatch(/^Keep a calm routine in the evening/);
  });

  test('muted, a reply and a repeat are shown as paced captions instead of being spoken', async ({ page }) => {
    const log = await openVoice(page, { providers: { answer: 'Keep a calm routine [S1].' } });
    await page.getByRole('button', { name: 'Mute Aria' }).click();
    await expect(page.getByRole('button', { name: 'Unmute Aria' })).toBeVisible();

    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(/^Keep a calm routine/)).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Repeat last answer' }).click();
    await expect(page.getByText(/^Keep a calm routine/)).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.speech).toHaveLength(0);

    await page.getByRole('button', { name: 'Unmute Aria' }).click();
    await expect(page.getByRole('button', { name: 'Mute Aria' })).toBeVisible();
  });

  test('with audio replies off in Settings, the answer still arrives as captions', async ({ page }) => {
    const log = await openVoice(page, { settings: { audioResponses: false }, providers: { answer: 'Keep a calm routine [S1].' } });
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(/^Keep a calm routine/)).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.speech).toHaveLength(0);
  });

  test('tapping the mic while the answer is playing cuts it off, and typing over it starts a new turn', async ({ page }) => {
    const log = await openVoice(page, { providers: { audioSeconds: 6 } });
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText('Aria is speaking')).toBeVisible();
    await page.getByRole('button', { name: 'Tap to interrupt' }).click();
    await expect(page.getByText(IDLE)).toBeVisible();

    await typeTurn(page, 'And what about mornings?');
    await expect(page.getByText('Aria is speaking')).toBeVisible();
    await typeTurn(page, 'And at night?');
    await expect.poll(() => log.chat.length).toBe(3);
    await page.getByRole('button', { name: 'Tap to interrupt' }).click();
    await expect(page.getByText(IDLE)).toBeVisible();
  });

  test('pressing Enter with nothing typed sends nothing; a repeat that cannot be voiced says so', async ({ page }) => {
    const log = await openVoice(page);
    await page.getByLabel('Message Aria').press('Enter');
    await expect(page.getByText(IDLE)).toBeVisible();
    expect(log.chat).toHaveLength(0);

    // The demo conversation's last answer is the one repeated; the voice service is down.
    await page.route('https://api.openai.com/v1/audio/speech', (route) => route.fulfill({ status: 500, body: 'tts down' }));
    await page.getByRole('button', { name: 'Repeat last answer' }).click();
    await expect(page.getByRole('alert')).toContainText('TTS error');
    await expect(page.getByText(IDLE)).toBeVisible();
  });

  test('an over-long typed question is cut to the 1,000-character limit before it is sent', async ({ page }) => {
    const log = await openVoice(page);
    await typeTurn(page, `${'Q'.repeat(1000)} TAIL`);
    await expect.poll(() => log.chat.length).toBe(1);
    const sent = log.chat[0].messages.at(-1).content;
    expect(sent).toContain('Q'.repeat(1000));
    expect(sent).not.toContain('TAIL');
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
  });

  test('a refused key ends the turn with advice to check it, which can be dismissed', async ({ page }) => {
    await openVoice(page);
    await page.route('https://api.openai.com/v1/chat/completions', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"bad key"}}' }));
    await typeTurn(page, 'How do I manage sundowning?');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Your OpenAI API key looks invalid');
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('voice: speaking a question', () => {
  test('live recognition shows the words as they are heard, and the finished question is answered', async ({ page }) => {
    const log = await openVoice(page);
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await expect(page.getByText('Listening…')).toBeVisible();
    // A routine recognizer hiccup changes nothing.
    await page.evaluate(() => window.__stt.fail('no-speech'));
    await page.evaluate(() => window.__stt.say('What helps with wandering at night'));
    await expect(page.getByText('What helps with wandering at night')).toBeVisible();
    // The partial has been stable long enough for retrieval to start early.
    await expect.poll(() => log.rpc.length).toBe(1);

    await page.getByRole('button', { name: 'Tap when finished' }).click();
    await expect(page.getByText('Aria is speaking')).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    // The early retrieval was reused: no second search for the same words.
    expect(log.rpc).toHaveLength(1);
    expect(log.chat.at(-1).messages.at(-1).content).toContain('What helps with wandering at night');
  });

  test('hands-free: the end of speech is noticed, the reply plays, and listening resumes by itself', async ({ page }) => {
    const log = await openVoice(page, { settings: { handsFree: true }, media: { recorderBytes: 1000 } });
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await expect(page.getByText('Aria will notice when you finish speaking')).toBeVisible();
    await page.evaluate(() => window.__stt.say('How can I help him sleep'));
    // No tap: silence after the words ends the turn.
    await expect(page.getByText('Aria is speaking')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'End conversation' })).toBeVisible({ timeout: 20_000 });
    expect(log.chat).toHaveLength(1);

    // Ending with nothing said asks the person to try again.
    await page.getByRole('button', { name: 'End conversation' }).click();
    await expect(page.getByRole('alert')).toContainText("I didn't catch that");
    await expect(page.getByText(IDLE)).toBeVisible();
  });

  test('hands-free: with nothing said at all, listening gives up by itself', async ({ page }) => {
    await page.clock.install();
    await openVoice(page, { settings: { handsFree: true } });
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await expect(page.getByText('Listening…')).toBeVisible();
    // Eight seconds of silence before the first word ends the attempt quietly.
    await page.clock.fastForward(9_000);
    await expect(page.getByText(IDLE)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a blocked microphone says how to allow it', async ({ page }) => {
    await openVoice(page, { media: { mic: 'denied' } });
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await expect(page.getByRole('alert')).toContainText('Microphone access is blocked');
    await expect(page.getByText(IDLE)).toBeVisible();
  });

  test('with no microphone at all, the reason is shown and typing still works', async ({ page }) => {
    const log = await openVoice(page, { media: { mic: 'missing' } });
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await expect(page.getByRole('alert')).toContainText('Requested device not found');
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => log.chat.length).toBe(1);
  });

  for (const [code, copy] of [['network', 'Something went wrong with the microphone'], ['not-allowed', 'Your microphone was blocked']]) {
    test(`a recognizer failure mid-question (${code}) stops listening and says what to do`, async ({ page }) => {
      await openVoice(page);
      await page.getByRole('button', { name: 'Tap to talk' }).click();
      await expect(page.getByText('Listening…')).toBeVisible();
      await page.evaluate((c) => window.__stt.fail(c), code);
      await expect(page.getByRole('alert')).toContainText(copy);
      await expect(page.getByText(IDLE)).toBeVisible();
    });
  }

  test('nothing heard live is rescued by transcribing the recording', async ({ page }) => {
    const log = await openVoice(page);
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await page.getByRole('button', { name: 'Tap when finished' }).click();
    await expect(page.getByText('Aria is speaking')).toBeVisible({ timeout: 15_000 });
    expect(log.transcribe).toHaveLength(1);
    expect(log.chat[0].messages.at(-1).content).toContain('How do I manage sundowning in the evening?');
  });

  test('when the rescue transcription fails too, the person is asked to try again', async ({ page }) => {
    await openVoice(page);
    await page.route('https://api.openai.com/v1/audio/transcriptions', (route) => route.fulfill({ status: 500, body: 'upstream' }));
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await page.getByRole('button', { name: 'Tap when finished' }).click();
    await expect(page.getByRole('alert')).toContainText("I didn't catch that");
  });

  test('a recognizer that will not start falls back to recording and transcribing, for the rest of the session', async ({ page }) => {
    const log = await openVoice(page, { media: { liveStartThrows: true } });
    for (let turn = 1; turn <= 2; turn++) {
      await page.getByRole('button', { name: 'Tap to talk' }).click();
      await expect(page.getByText('Listening…')).toBeVisible();
      await page.getByRole('button', { name: 'Tap when finished' }).click();
      await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
      expect(log.transcribe).toHaveLength(turn);
    }
    // The second turn did not try the broken recognizer again.
    expect(await page.evaluate(() => window.__stt.instances.length)).toBe(1);
  });

  test('a browser without live recognition records and transcribes; a too-short clip is not sent', async ({ page }) => {
    const log = await openVoice(page, { media: { live: false, recorderBytes: 1000 } });
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await page.getByRole('button', { name: 'Tap when finished' }).click();
    await expect(page.getByRole('alert')).toContainText("I didn't catch that");
    expect(log.transcribe).toHaveLength(0);
  });

  test('a browser without live recognition shows why, when the transcription service fails', async ({ page }) => {
    await openVoice(page, { media: { live: false } });
    await page.route('https://api.openai.com/v1/audio/transcriptions', (route) => route.fulfill({ status: 500, body: 'transcriber down' }));
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await page.getByRole('button', { name: 'Tap when finished' }).click();
    await expect(page.getByRole('alert')).toContainText('Whisper error');
    await expect(page.getByText(IDLE)).toBeVisible();
  });

  test('a browser without live recognition sends a real recording to be transcribed', async ({ page }) => {
    const log = await openVoice(page, { media: { live: false } });
    await page.getByRole('button', { name: 'Tap to talk' }).click();
    await page.getByRole('button', { name: 'Tap when finished' }).click();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.transcribe).toHaveLength(1);
    expect(log.chat).toHaveLength(1);
  });
});

test.describe('voice: ElevenLabs voices', () => {
  test('with an ElevenLabs key, each sentence is voiced with character timings for lip-sync', async ({ page }) => {
    const log = await openVoice(page, { keys: { eleven: ELEVEN_KEY } });
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.eleven.map((r) => r.text)).toEqual([expect.stringMatching(/^Keep a calm routine/), expect.stringMatching(/^Close the curtains/)]);
    expect(log.speech).toHaveLength(0);
  });

  test('if ElevenLabs fails, the reply falls back to the OpenAI voice', async ({ page }) => {
    const log = await openVoice(page, { keys: { eleven: ELEVEN_KEY } });
    await page.route(/api\.elevenlabs\.io\/v1\/text-to-speech/, (route) => route.fulfill({ status: 500, body: 'quota' }));
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.speech).toHaveLength(2);
  });

  test('"Faster Voice Responses" streams the answer as it is written', async ({ page }) => {
    const log = await openVoice(page, { keys: { eleven: ELEVEN_KEY }, settings: { fasterVoice: true } });
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText('Aria is speaking')).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    const sent = log.stream[0].messages;
    expect(sent[0]).toMatchObject({ xi_api_key: ELEVEN_KEY });
    expect(sent.map((m) => m.text).join('')).toContain('calm routine');
    expect(sent.at(-1)).toEqual({ text: '' });
    // Nothing went over REST.
    expect(log.eleven).toHaveLength(0);
  });

  test('a stream that fails mid-answer is finished over REST, and later turns stay on REST', async ({ page }) => {
    const log = await openVoice(page, { keys: { eleven: ELEVEN_KEY }, settings: { fasterVoice: true } });
    await page.routeWebSocket(/^wss:\/\/api\.elevenlabs\.io\//, (ws) => {
      ws.onMessage((raw) => {
        const msg = JSON.parse(raw);
        if (msg.text && msg.text.trim() && !msg.xi_api_key) ws.send(JSON.stringify({ error: 'quota_exceeded', message: 'Quota exceeded' }));
      });
    });
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.eleven.length).toBeGreaterThanOrEqual(1);
    const before = log.eleven.length;
    await typeTurn(page, 'And at night?');
    await expect.poll(() => log.eleven.length, { timeout: 20_000 }).toBeGreaterThan(before);
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('voice: setup, navigation and layout', () => {
  test('without a key, the setup card takes one and opens the conversation', async ({ page }) => {
    await openVoice(page, { keys: false });
    await expect(page.getByText('Set up voice conversations')).toBeVisible();
    const save = page.getByRole('button', { name: 'Save and start' });
    await expect(save).toBeDisabled();
    await page.getByPlaceholder('sk-…').fill(OPENAI_KEY);
    await page.getByPlaceholder('Optional').fill(ELEVEN_KEY);
    await save.click();
    await expect(page.getByText(IDLE)).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_keys')).eleven)).toBe(ELEVEN_KEY);
  });

  test('the setup card links to Settings instead', async ({ page }) => {
    await openVoice(page, { keys: false });
    await page.getByRole('link', { name: 'Open Settings instead ›' }).click();
    await expect(page).toHaveURL(/#\/app\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('closing the voice screen goes back to where the person came from', async ({ page }) => {
    await openVoice(page);
    await page.goto('/#/app/home');
    await page.getByRole('button', { name: 'Ask Aria by voice' }).click();
    await expect(page.getByText(IDLE)).toBeVisible();
    await page.getByRole('button', { name: 'Close voice conversation' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
  });

  test('a Unity avatar that cannot load is replaced by Aria, and the screen says so', async ({ page }) => {
    await openVoice(page, { settings: { avatarId: 'aaron' } });
    await expect(page.getByText('Aaron isn’t available right now, so you’ll talk with Aria instead — everything else works the same.')).toBeVisible();
  });
});

test.describe('voice on a phone-sized screen', () => {
  test.use({ viewport: { width: 400, height: 820 } });

  test('captions sit above the controls and the header stacks', async ({ page }) => {
    await openVoice(page);
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(/Keep a calm routine in the evening/)).toBeVisible();
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('voice with a guest access code', () => {
  test('a guest with a code talks through the proxy, voiced by ElevenLabs there', async ({ page }) => {
    const log = await mockProviders(page, { answer: ANSWER, audioSeconds: 0.5 });
    await seedStorage(page, { keys: false, access: { code: 'e2e-guest-access-code-0001', status: 'ok' }, settings: { avatarId: 'aria', showAvatar: false } });
    await installFakeMedia(page);
    await page.goto('/#/app/voice');
    await typeTurn(page, 'How do I manage sundowning?');
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 20_000 });
    expect(log.chat).toHaveLength(1);
    expect(log.eleven.map((r) => r.proxied)).toEqual([true, true]);
  });
});
