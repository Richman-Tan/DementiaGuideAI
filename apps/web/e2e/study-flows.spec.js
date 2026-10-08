// The tasks study end to end, with a mocked session: both arms (typing, then
// talking), every questionnaire, the participant living with dementia's path
// (paper consent, support person, the halfway check), stopping at each point,
// the "is this still you?" gate and the device handover, setup errors, and the
// screens for a session that went out of step. study.spec.js covers the text
// arm's first task in detail; this file covers the rest of the journey.
//
// The mocked session is participant P02: arm order BA, task sets 1 then 2.
import { test, mockProviders, seedStorage, installFakeMedia, ask, expect, studyEvents, STUDY_ACCESS_CODE, SESSION_ID, slow } from './support.js';

const ANSWER = 'Keep a calm routine in the evening [S1].';

async function startStudy(page, { group = /I care, or recently cared/ } = {}) {
  await page.goto('/#/study');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'I’ve read this' }).click();
  await page.getByRole('radiogroup', { name: 'group' }).getByRole('radio', { name: group }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function consentAll(page, transcripts = 'Yes, keep my conversation') {
  const boxes = page.getByRole('checkbox');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await page.getByRole('radiogroup', { name: 'transcripts' }).getByRole('radio', { name: transcripts }).click();
  await page.getByRole('button', { name: 'I agree — continue' }).click();
}

async function setUp(page, log) {
  await page.getByPlaceholder('from your invitation email').fill(STUDY_ACCESS_CODE);
  await page.getByRole('button', { name: 'Check my microphone' }).click();
  await expect(page.getByText('Microphone is working.')).toBeVisible();
  await page.getByRole('button', { name: 'Start the study' }).click();
  await expect.poll(() => log.study.session.length).toBe(1);
}

const radio = (page, group, name) => page.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true });

async function answerPostTask(page) {
  await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();
  await radio(page, 'found', 'Yes').click();
  await radio(page, 'effort', '4 — Easy').click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

const band = (page) => page.getByRole('region', { name: 'Your current task' });

async function voiceTurn(page, text) {
  await page.getByLabel('Message Aria').fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Aria is speaking')).toBeVisible();
  await expect(page.getByText('Tap the mic or type below')).toBeVisible({ timeout: slow(20_000) });
}

test.describe('the tasks study, start to finish', () => {
  test('a carer types three tasks, talks three, answers every questionnaire, and hands the device on', async ({ page }) => {
    test.slow();
    const log = await mockProviders(page, { answer: ANSWER, audioSeconds: 0.3 });
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria', showAvatar: false, textScale: 1.25 } });
    await installFakeMedia(page);
    await startStudy(page);
    await consentAll(page);
    await setUp(page, log);
    // A new participant starts at the default text size, whatever the last one chose.
    await expect(page.locator('html')).toHaveCSS('font-size', '17px');

    // Background: the button says whether anything is left unanswered, and a
    // stray tap can be taken back by tapping the same answer again.
    await expect(page.getByText('Your participant code is')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip and continue' })).toBeVisible();
    await radio(page, 'age', '40–54').click();
    await radio(page, 'age', '40–54').click();
    await expect(radio(page, 'age', '40–54')).toHaveAttribute('aria-checked', 'false');
    await radio(page, 'age', '55–64').click();
    await radio(page, 'tech_confidence', '4').click();
    await radio(page, 'prior_ai', 'Sometimes').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Arm B, the text arm: three tasks.
    await expect(page.getByRole('heading', { name: 'Typing to Aria' })).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await ask(page, 'What can I do when the evenings get difficult?');
    await expect(page.getByRole('button', { name: 'Open source 1' })).toBeVisible();
    await band(page).getByRole('button', { name: 'I found my answer' }).click();
    await answerPostTask(page);

    await expect(page.getByRole('heading', { name: 'Next: Awake and moving at night' })).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await band(page).getByRole('button', { name: 'I couldn’t find it' }).click();
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip and continue' }).click();

    await expect(page.getByRole('heading', { name: 'Next: You need a break' })).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    // Wandering back to the study page mid-task: the task is still open.
    await page.goto('/#/study');
    await expect(page.getByRole('heading', { name: 'Your task is still open' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to the app' }).click();
    await expect(page).toHaveURL(/#\/app\/chat$/);
    // The band's text-size button cycles the size for the whole app.
    await band(page).getByRole('button', { name: 'Text size' }).click();
    await expect(band(page).getByRole('button', { name: 'Text size' })).toHaveText('Aa+');
    await band(page).getByRole('button', { name: 'Text size' }).click();
    await band(page).getByRole('button', { name: 'Text size' }).click();
    await expect(band(page).getByRole('button', { name: 'Text size' })).toHaveText('Aa');
    await band(page).getByRole('button', { name: 'I found my answer' }).click();
    await answerPostTask(page);

    // Questionnaires for the text arm.
    await expect(page.getByRole('heading', { name: 'How was that to use?' })).toBeVisible();
    await expect(page.getByText(/These ten questions are about typing to Aria/)).toBeVisible();
    await radio(page, 'q1', '4 — Agree').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'A few more about that way of using the app' })).toBeVisible();
    await radio(page, 'trust', '5 — Strongly agree').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Arm A, the voice arm: three tasks on the voice screen.
    await expect(page.getByRole('heading', { name: 'Talking with Aria' })).toBeVisible();
    await expect(page.getByText(/To hear an answer again, press ↻ at the top right/)).toBeVisible();
    for (const [i, title] of [[0, null], [1, 'Next: The bathroom feels unsafe'], [2, 'Next: Wondering whether home is still the right place']]) {
      if (title) await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await page.getByRole('button', { name: 'Start' }).click();
      await expect(page).toHaveURL(/#\/app\/voice$/);
      await expect(band(page).getByText(`Task ${4 + i} of 6`)).toBeVisible();
      await voiceTurn(page, `Voice question ${i + 1}`);
      await band(page).getByRole('button', { name: 'I found my answer' }).click();
      await answerPostTask(page);
    }
    await expect(page.getByText(/These ten questions are about talking with Aria/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Debrief and the end.
    await expect(page.getByRole('heading', { name: 'Last few questions' })).toBeVisible();
    await page.getByRole('textbox').first().fill('Typing felt quicker for me.');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you — that’s everything' })).toBeVisible();
    await expect(page.getByText('Your participant code is P02. Please keep it.')).toBeVisible();
    await expect(page.getByText('If you would like to talk to someone')).toBeVisible();

    await expect.poll(() => log.study.complete.length, { timeout: slow(15_000) }).toBe(1);
    expect(log.study.complete[0]).toMatchObject({ sessionId: SESSION_ID, stoppedEarly: false });
    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining([
      'background_done', 'posttask_response', 'sus_done', 'likert_done', 'debrief_done', 'session_complete',
    ]));
    const events = studyEvents(log);
    expect(events.filter((e) => e.kind === 'task_end')).toHaveLength(6);
    expect(events.filter((e) => e.kind === 'turn').map((e) => e.arm)).toEqual(['B', 'A', 'A', 'A']);
    expect(events.find((e) => e.kind === 'debrief_done').payload.responses).toMatchObject({ 'debrief.preference': 'Typing felt quicker for me.' });

    // Handing the device to the next person.
    await page.getByRole('button', { name: 'Setting up for another participant?' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Setting up for another participant?' }).click();
    await page.getByRole('button', { name: 'Clear this device' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
    // Nothing of this participant is left on the device.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_study') || '{}'))).toMatchObject({ sessionId: '', participantCode: '', accessCode: '' });
  });

  test('a person living with dementia: paper consent, a support person, short questions, and a break halfway', async ({ page }) => {
    test.slow();
    const log = await mockProviders(page, { answer: ANSWER, audioSeconds: 0.3 });
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria', showAvatar: false } });
    await installFakeMedia(page);
    await startStudy(page, { group: /I have a diagnosis of early-stage dementia/ });

    await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible();
    const go = page.getByRole('button', { name: 'Continue' });
    await expect(go).toBeDisabled();
    await page.getByRole('checkbox', { name: 'We have read and signed the paper form together.' }).check();
    await radio(page, 'transcripts', 'No, they may not').click();
    await go.click();

    // A support person must be there.
    await page.getByPlaceholder('from your invitation email').fill(STUDY_ACCESS_CODE);
    await page.getByRole('checkbox', { name: /Continue without the microphone/ }).check();
    await radio(page, 'supporter', 'No, I am on my own').click();
    await expect(page.getByText('Please come back when someone can sit with you. Thank you.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start the study' })).toBeDisabled();
    await radio(page, 'supporter', 'Yes, someone is here with me').click();
    await page.getByRole('button', { name: 'Start the study' }).click();
    await expect.poll(() => log.study.session.length).toBe(1);
    expect(log.study.session[0].body).toMatchObject({ group: 'plwd', supporterPresent: true, consentTranscripts: false, consent: { paperFormSigned: true } });

    await page.getByRole('button', { name: 'Skip and continue' }).click();
    await expect(page.getByText('Sometimes people find it hard to sleep through the night')).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await ask(page, 'What might help me sleep?');
    await expect(page.getByRole('button', { name: 'Open source 1' })).toBeVisible();
    await band(page).getByRole('button', { name: 'I found my answer' }).click();
    await answerPostTask(page);

    // Three plain questions instead of the ten-item questionnaire.
    await expect(page.getByText('Was that easy or hard to use?')).toBeVisible();
    await radio(page, 'easy', 'Easy').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Time for a break' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, carry on' }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await voiceTurn(page, 'What support is there?');
    await band(page).getByRole('button', { name: 'I found my answer' }).click();
    await answerPostTask(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'One last question' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'For the support person' })).toBeVisible();
    await page.getByRole('textbox').nth(1).fill('Reading the answers aloud.');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you — that’s everything' })).toBeVisible();

    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining(['consent_rechecked', 'likert_done', 'session_complete']));
    // Transcripts declined: turns are counted, but no words leave the browser.
    const turns = studyEvents(log).filter((e) => e.kind === 'turn');
    expect(turns).toHaveLength(2);
    for (const t of turns) expect(t.payload.question).toBeUndefined();
  });
});

// A session already on the device: what the next visit to the link sees.
const live = (patch = {}) => ({
  accessCode: STUDY_ACCESS_CODE, participantCode: 'P02', sessionId: SESSION_ID, group: 'caregiver',
  armOrder: 'BA', setOrder: '12', step: 'background', stageIndex: 0, taskIndex: 0, consentTranscripts: true, ...patch,
});

test.describe('a session already on this device', () => {
  test('"Yes, that’s me" carries on where the session was', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, study: live() });
    await page.goto('/#/study');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('This device has a session in progress for participant P02.')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    await expect(page.getByRole('heading', { name: 'A few questions about you' })).toBeVisible();
  });

  test('"I’m someone else" clears the device for a fresh start — but not while records are unsent', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, study: live({ participantCode: '' }) });
    // One event recorded but not yet sent, and a server that is down.
    await page.addInitScript(() => {
      if (!localStorage.getItem('dg_study_queue')) {
        localStorage.setItem('dg_study_queue', JSON.stringify([{ eventUuid: 'e2e-1', seq: 1, kind: 'tab_hidden', arm: null, taskId: null, payload: {}, clientTs: new Date().toISOString() }]));
      }
    });
    let down = true;
    await page.route('**/api/study/event', (route) => (down ? route.fulfill({ status: 503, body: 'down' }) : route.fallback()));
    await page.goto('/#/study');
    await expect(page.getByText('This device has a session already in progress.')).toBeVisible();

    await page.getByRole('button', { name: 'I’m someone else' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Yes, that’s me — carry on' })).toBeVisible();

    await page.getByRole('button', { name: 'I’m someone else' }).click();
    await page.getByRole('button', { name: 'Clear this device' }).click();
    await expect(page.getByText(/Not cleared\. 1 record has not reached the server yet/)).toBeVisible();

    down = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
    expect(studyEvents(log).map((e) => e.eventUuid)).toContain('e2e-1');
  });

  test('clearing the device while records are still on their way waits for them', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, study: live() });
    // The event endpoint is slow: a batch is in flight when the handover starts.
    let inFlight = false;
    let release;
    const released = new Promise((r) => { release = r; });
    await page.route('**/api/study/event', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.accessCode) return route.fallback(); // beacons are not part of this
      inFlight = true;
      await released;
      return route.fallback();
    });
    await page.goto('/#/study');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => inFlight, { timeout: slow(15_000) }).toBe(true);

    await page.getByRole('button', { name: 'I’m someone else' }).click();
    await page.getByRole('button', { name: 'Clear this device' }).click();
    await expect(page.getByText(/Not cleared\. 1 record has not reached the server yet/)).toBeVisible();
    release();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('dg_study_queue') || '[]').length)).toBe(0);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
  });

  test('a session that went out of step offers a way back', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, study: live({ step: 'sideways' }) });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get you back on track' })).toBeVisible();
    await expect(page.getByText(/email the researcher with your participant code — P02/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue the study' }).click();
    await expect(page.getByRole('heading', { name: 'Typing to Aria' })).toBeVisible();
  });

  test('a study link with no session yet and a stray step offers to begin', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false, study: { step: 'posttask' } });
    await page.goto('/#/study');
    await expect(page.getByText('This session has not started yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Begin' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
  });

  test('at the halfway break, "Finish here" ends the session as a good outcome', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, study: live({ group: 'plwd', step: 'recheck', responses: { 'likert.B.easy': 'easy' } }) });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    await page.getByRole('button', { name: 'Finish here' }).click();
    await expect(page.getByRole('heading', { name: 'You’ve stopped the session' })).toBeVisible();
    await expect(page.getByText(/quoting your participant code — P02/)).toBeVisible();
    await expect.poll(() => log.study.complete.length, { timeout: slow(15_000) }).toBe(1);
    expect(log.study.complete[0].stoppedEarly).toBe(true);
    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining(['responses_snapshot', 'session_stopped']));
  });
});

test.describe('stopping', () => {
  test('"I need to stop" before a session exists asks once, and can be taken back', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'I need to stop' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Stop the session' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep going' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'I need to stop' }).click();
    await page.getByRole('button', { name: 'Yes, stop' }).click();
    await expect(page.getByRole('heading', { name: 'You’ve stopped the session' })).toBeVisible();
    await expect(page.getByText('If you would like to talk to someone')).toBeVisible();
    // Nothing was ever recorded, so the device clears straight away.
    await page.getByRole('button', { name: 'Setting up for another participant?' }).click();
    await page.getByRole('button', { name: 'Clear this device' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
  });

  test('stopping mid-task closes the task, keeps what was answered, and ends the session', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria' }, study: live({ step: 'task', taskId: 't1a', taskStartedAt: Date.now() - 5000, responses: { age: '55–64' } }) });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    await page.getByRole('button', { name: 'Back to the app' }).click();
    await band(page).getByRole('button', { name: 'I need to stop' }).click();
    await band(page).getByRole('button', { name: 'Keep going' }).click();
    await expect(band(page).getByRole('alertdialog')).toHaveCount(0);
    await band(page).getByRole('button', { name: 'I need to stop' }).click();
    await band(page).getByRole('button', { name: 'Yes, stop' }).click();
    await expect(page.getByRole('heading', { name: 'You’ve stopped the session' })).toBeVisible();

    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining(['task_end', 'responses_snapshot', 'session_stopped']));
    const end = studyEvents(log).find((e) => e.kind === 'task_end');
    expect(end).toMatchObject({ arm: 'B', taskId: 't1a', payload: expect.objectContaining({ stoppedMidTask: true }) });
    expect(end.payload.durationMs).toBeGreaterThanOrEqual(5000);
  });

  test('"I couldn’t find it" from the open-task page ends the task as not found', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, study: live({ step: 'task', taskId: 't1a', taskStartedAt: Date.now() }) });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    // The page's own button (the task band above it has one too).
    await page.getByRole('button', { name: 'I couldn’t find it' }).first().click();
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();
    await expect.poll(() => studyEvents(log).find((e) => e.kind === 'task_end')?.payload?.gaveUp, { timeout: slow(15_000) }).toBe(true);
  });
});

test.describe('study setup problems', () => {
  test('each kind of refusal gets its own plain explanation, and a resumed session picks up where it was', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await installFakeMedia(page, { mic: 'denied' });
    await startStudy(page);
    await consentAll(page);

    await page.getByRole('button', { name: 'Check my microphone' }).click();
    await expect(page.getByText(/The browser blocked the microphone/)).toBeVisible();
    await page.getByRole('checkbox', { name: /Continue without the microphone/ }).check();

    let reply = { status: 401, body: { error: 'invalid or missing study access code' } };
    await page.route('**/api/study/session', async (route) => {
      if (!reply) return route.fallback();
      if (reply.raw) return route.fulfill({ status: reply.status, contentType: 'text/html', body: reply.raw });
      return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
    });
    const code = page.getByPlaceholder('from your invitation email');
    const start = page.getByRole('button', { name: 'Start the study' });
    const alert = page.getByRole('alert');
    for (const [r, copy] of [
      [{ status: 401, body: { error: 'invalid or missing study access code' } }, 'That access code wasn’t recognised. Please check it against your invitation email'],
      [{ status: 409, body: { error: 'participant code belongs to a different study' } }, 'That session code belongs to a different study.'],
      [{ status: 503, body: { error: 'study backend not configured' } }, 'The study isn’t quite ready at our end.'],
      [{ status: 500, body: {} }, 'We couldn’t start the session. Please check your internet connection'],
      [{ status: 502, raw: '<html>Bad gateway</html>' }, 'We couldn’t start the session. Please check your internet connection'],
    ]) {
      reply = r;
      await code.fill(STUDY_ACCESS_CODE);
      await start.click();
      await expect(alert).toContainText(copy);
      // A refused code is not left behind in storage.
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_study')).accessCode)).toBe('');
    }

    // A participant code typed by someone resuming on another device.
    await page.getByRole('button', { name: 'I’ve done part of this before and have a participant code' }).click();
    await page.getByPlaceholder('P07').fill('X9');
    await code.fill(STUDY_ACCESS_CODE);
    await start.click();
    await expect(alert).toContainText('That participant code doesn’t look right.');

    // Progress checkpoints failing does not hold the participant up.
    await page.route('**/api/study/progress', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"db down"}' }));
    reply = { status: 200, body: { sessionId: SESSION_ID, participantCode: 'P02', participantNumber: 2, group: 'caregiver', armOrder: 'BA', setOrder: '12', resumed: true, completed: false, step: 'armbrief', stageIndex: 0, taskIndex: 1, studyVersion: 'e2e', protocol: 'tasks' } };
    await page.getByPlaceholder('P07').fill(' p02 ');
    await code.fill(STUDY_ACCESS_CODE);
    await start.click();
    await expect(page.getByRole('heading', { name: 'Next: Awake and moving at night' })).toBeVisible();
    await expect.poll(() => studyEvents(log).find((e) => e.kind === 'session_start')?.payload?.resumed, { timeout: slow(15_000) }).toBe(true);
  });
});

test.describe('event delivery', () => {
  test('switching tabs is recorded and sent straight away; a rejected batch is retried in halves', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, study: live() });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();

    const setVisibility = (state) => page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
    await setVisibility('hidden');
    // The beacon carries the access code in its body (it cannot set headers).
    await expect.poll(() => log.study.event.some((e) => e.body?.accessCode === STUDY_ACCESS_CODE)).toBe(true);
    await setVisibility('visible');
    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining(['tab_hidden', 'tab_visible']));

    // The server starts refusing everything: the next batch is split until the
    // bad event is alone, then dropped, so later events are not held up behind it.
    // (Beacons — which carry the code in the body — are fire-and-forget and not counted.)
    const sizes = [];
    await page.route('**/api/study/event', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (!body.accessCode) sizes.push((body.events || []).length);
      await route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"bad event"}' });
    });
    for (const state of ['hidden', 'visible', 'hidden']) await setVisibility(state);
    await expect.poll(() => sizes.includes(1), { timeout: slow(30_000) }).toBe(true);
    expect(sizes[0]).toBeGreaterThan(1);
    expect(sizes.indexOf(1)).toBeGreaterThan(0);
  });
});

test.describe('event delivery on a bad connection', () => {
  test('a damaged queue is discarded, and events survive a dropped connection, odd replies and partial writes', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, study: live() });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('dg_e2e_queue')) {
        sessionStorage.setItem('dg_e2e_queue', '1');
        localStorage.setItem('dg_study_queue', '{damaged');
      }
    });
    const replies = ['drop', 'not-json', 'partial'];
    const seen = [];
    await page.route('**/api/study/event', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.accessCode) return route.fallback(); // beacons: not part of this
      const reply = replies.shift();
      seen.push(reply || 'ok');
      if (reply === 'drop') return route.abort('connectionreset');
      if (reply === 'not-json') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
      if (reply === 'partial') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ received: body.events.length, inserted: 0 }) });
      return route.fallback();
    });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    const setVisibility = (state) => page.evaluate((st) => {
      Object.defineProperty(document, 'visibilityState', { value: st, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
    // Dropped: kept and retried a couple of seconds later, when the reply is not JSON.
    await setVisibility('hidden');
    await expect.poll(() => seen, { timeout: slow(20_000) }).toEqual(['drop', 'not-json']);
    // A reply admitting that fewer were stored than sent.
    await setVisibility('visible');
    await expect.poll(() => seen, { timeout: slow(20_000) }).toEqual(['drop', 'not-json', 'partial']);
    // And then back to normal.
    await setVisibility('hidden');
    await expect.poll(() => seen, { timeout: slow(20_000) }).toEqual(['drop', 'not-json', 'partial', 'ok']);
    const delivered = log.study.event.filter((e) => !e.body?.accessCode).flatMap((e) => e.body?.events || []);
    expect(delivered.map((e) => e.kind)).toContain('tab_hidden');
  });

  test('outside a study, switching tabs sends nothing', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/app/home');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
    expect(log.study.event).toHaveLength(0);
  });
});

// The browser notice is advisory and depends only on the browser family.
for (const [family, ua, notice] of [
  ['edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', false],
  ['safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', true],
  ['opera', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0', true],
  ['other', 'e2e-unknown-browser/1.0', true],
]) {
  test.describe(`study setup in ${family}`, () => {
    test.use({ userAgent: ua });

    test(`${notice ? 'shows' : 'skips'} the Chrome-or-Edge notice`, async ({ page }) => {
      await mockProviders(page);
      await seedStorage(page, { keys: false });
      await startStudy(page);
      await consentAll(page);
      if (notice) {
        await expect(page.getByRole('heading', { name: 'Talking works best in Chrome or Edge' })).toBeVisible();
        await expect(page.getByText(`We detected: ${family}.`)).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Let’s get set up' })).toBeVisible();
      }
    });
  });
}
