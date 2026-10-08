// Flows (d)–(e): the usability study's text arm (Arm B) with a mocked session.
//
// The enrolment path is the real one — intro, information, group, consent,
// setup — with only the study API answered by fixtures. The mocked session
// assigns participant P02 (arm order BA), so the first arm is the text arm.
import { test, mockProviders, seedStorage, ask, expect, studyEvents, STUDY_ACCESS_CODE, SESSION_ID } from './support.js';

async function enrolArmB(page, log) {
  await page.goto('/#/study');

  // intro → info → group → consent → setup
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'I’ve read this' }).click();
  await page.getByRole('radiogroup', { name: 'group' })
    .getByRole('radio', { name: /I care, or recently cared/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const boxes = page.getByRole('checkbox');
  const n = await boxes.count();
  expect(n).toBeGreaterThanOrEqual(11);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.getByRole('radiogroup', { name: 'transcripts' })
    .getByRole('radio', { name: 'Yes, keep my conversation' }).click();
  await page.getByRole('button', { name: 'I agree — continue' }).click();

  // setup: access code + explicit "continue without the microphone"
  await page.getByPlaceholder('from your invitation email').fill(STUDY_ACCESS_CODE);
  await page.getByRole('checkbox', { name: /Continue without the microphone/ }).check();
  const start = page.getByRole('button', { name: 'Start the study' });
  await expect(start).toBeEnabled();
  await start.click();

  // The session was created with the code in the header and the group in the body.
  await expect.poll(() => log.study.session.length).toBe(1);
  expect(log.study.session[0].headers['x-study-code']).toBe(STUDY_ACCESS_CODE);
  expect(log.study.session[0].body).toMatchObject({ group: 'caregiver', consentTranscripts: true, consent: expect.any(Object) });

  // background → arm brief → task (navigates to the arm's screen)
  await expect(page.getByText('Your participant code is')).toBeVisible();
  await page.getByRole('button', { name: /Skip and continue|Continue/ }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/#\/app\/chat$/);
  await expect(page.getByRole('region', { name: 'Your current task' })).toBeVisible();
}

test.describe('study Arm B (text arm, mocked session)', () => {
  test('(d) enrol → one typed turn → "I found my answer" → post-task questionnaire; the turn event is typed', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await enrolArmB(page, log);

    // The demo thread must not be on screen during a study.
    await expect(page.getByText('he lashes out at me')).toHaveCount(0);

    await ask(page, 'What can I do when the evenings get difficult?');
    await expect(page.getByRole('button', { name: 'Open source 1' })).toBeVisible();

    // Chat went through the study proxy with the access code, never to OpenAI directly.
    expect(log.chat.length).toBe(1);
    expect(log.embed.length).toBeGreaterThanOrEqual(1);

    await page.getByRole('button', { name: 'I found my answer' }).click();
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'found' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'effort' })).toBeVisible();

    // The flushed events carry a typed turn for this arm and task, plus the
    // task boundaries that bound time-on-task.
    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: 15_000 })
      .toEqual(expect.arrayContaining(['session_start', 'task_start', 'turn_start', 'turn', 'task_end']));
    const events = studyEvents(log);
    // The mic check's outcome rides on session_start, since the queue is dead
    // until the session exists.
    const start = events.find((e) => e.kind === 'session_start');
    expect(start.payload).toMatchObject({ armOrder: 'BA', resumed: false, consentTranscripts: true, micStatus: 'skipped', micAck: true });
    const turn = events.find((e) => e.kind === 'turn');
    expect(turn).toMatchObject({ arm: 'B', taskId: 't1a', payload: expect.objectContaining({ modality: 'typed' }) });
    expect(turn.payload.question).toContain('evenings get difficult');
    expect(turn.payload.sourceIds).toEqual(expect.arrayContaining(['caregiving_001']));
    const end = events.find((e) => e.kind === 'task_end');
    expect(end).toMatchObject({ arm: 'B', taskId: 't1a', payload: expect.objectContaining({ gaveUp: false }) });
    expect(end.payload.durationMs).toBeGreaterThan(0);
    for (const e of log.study.event) {
      expect(e.body.sessionId).toBe(SESSION_ID);
      expect(e.headers['x-study-code'] || e.body.accessCode).toBe(STUDY_ACCESS_CODE);
    }
  });

  test('(e) in Arm B the voice screen is unreachable: /app/voice bounces back to /app/chat', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await enrolArmB(page, log);

    await page.goto('/#/app/voice');
    await expect(page).toHaveURL(/#\/app\/chat$/);
    await expect(page.getByLabel('Type your question')).toBeVisible();
    // The mic button on the chat screen goes the same way.
    await page.getByRole('button', { name: 'Switch to voice' }).click();
    await expect(page).toHaveURL(/#\/app\/chat$/);
    // No voice stack was ever requested.
    expect(log.chat.length).toBe(0);
  });
});

test.describe('study harness after the Oct 2026 UX feedback (mocked session)', () => {
  test('(f) the band says how far along the task is and what its toggle holds; the avatar is fixed for the session', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await enrolArmB(page, log);

    const band = page.getByRole('region', { name: 'Your current task' });
    await expect(band.getByText(/Task 1 of \d+/)).toBeVisible();
    await expect(band.getByText(/about 35–45 min in total/)).toBeVisible();
    await band.getByRole('button', { name: 'Detailed instructions' }).click();
    await expect(band.getByRole('button', { name: 'Hide instructions' })).toBeVisible();

    await page.goto('/#/app/settings');
    const avatars = page.getByRole('group', { name: 'Avatar' }).getByRole('button');
    for (let i = 0; i < await avatars.count(); i++) await expect(avatars.nth(i)).toBeDisabled();
    await expect(page.getByText(/Fixed for this study session/)).toBeVisible();
  });
});

test.describe('study harness in Firefox (mocked session)', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0' });

  test('(g) a Firefox participant can continue past the browser notice, and session_start records it', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/study');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'I’ve read this' }).click();
    await page.getByRole('radiogroup', { name: 'group' }).getByRole('radio', { name: /I care, or recently cared/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    const boxes = page.getByRole('checkbox');
    for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
    await page.getByRole('radiogroup', { name: 'transcripts' }).getByRole('radio', { name: 'Yes, keep my conversation' }).click();
    await page.getByRole('button', { name: 'I agree — continue' }).click();

    await expect(page.getByRole('heading', { name: 'Talking works best in Chrome or Edge' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue in this browser' }).click();
    await page.getByPlaceholder('from your invitation email').fill(STUDY_ACCESS_CODE);
    await page.getByRole('checkbox', { name: /Continue without the microphone/ }).check();
    await page.getByRole('button', { name: 'Start the study' }).click();
    await expect(page.getByText('Your participant code is')).toBeVisible();
    await expect.poll(() => studyEvents(log).find((e) => e.kind === 'session_start')?.payload?.browserAck, { timeout: 15_000 }).toBe(true);
  });
});

test.describe('a finished session left on the device (Oct 2026: "the avatar only works in incognito")', () => {
  // The state a pilot participant's own browser is left in: the session ended
  // in the text arm, and nobody pressed "Clear this device".
  const finished = (step) => ({
    accessCode: STUDY_ACCESS_CODE, participantCode: 'P05', sessionId: SESSION_ID,
    group: 'caregiver', armOrder: 'AB', setOrder: '12', step, stageIndex: 1, taskIndex: 2,
  });

  for (const step of ['done', 'stopped']) {
    test(`(k) after "${step}" in the text arm, chat shows the avatar again and the picker is free`, async ({ page }) => {
      await mockProviders(page);
      await seedStorage(page, { keys: false });
      await page.addInitScript((s) => localStorage.setItem('dg_study', JSON.stringify(s)), finished(step));
      await page.goto('/#/app/chat');
      await expect(page.getByLabel('Type your question')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hide panel' })).toBeVisible();
      await page.goto('/#/app/settings');
      await expect(page.getByText('Fixed for this study session')).toHaveCount(0);
    });
  }

  test('(l) during the text arm itself, the avatar stays hidden', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.addInitScript((s) => localStorage.setItem('dg_study', JSON.stringify(s)), { ...finished('task'), taskId: 't2c' });
    await page.goto('/#/app/chat');
    await expect(page.getByLabel('Type your question')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide panel' })).toHaveCount(0);
  });
});
