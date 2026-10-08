// Flows (h)–(j): the feedback round (Oct 2026) with a mocked session — privacy
// notice, free use with "Things to try", a flagged answer, open questions, the
// optional SUS skipped. The study API is answered by the fixtures in support.js,
// which give a feedback session no arms, as the real endpoint does.
import { test, mockProviders, seedStorage, ask, expect, studyEvents, STUDY_ACCESS_CODE, slow } from './support.js';

async function enrol(page) {
  await page.goto('/#/study/feedback');
  await expect(page.getByRole('heading', { name: 'Thank you for trying the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  // Privacy notice: one yes/no choice, no consent ticks.
  await expect(page.getByRole('heading', { name: 'Before you start: your privacy' })).toBeVisible();
  const go = page.getByRole('button', { name: 'I’ve read this — continue' });
  await expect(go).toBeDisabled();
  await page.getByRole('radiogroup', { name: 'transcripts' })
    .getByRole('radio', { name: 'Yes, keep my conversation' }).click();
  await go.click();

  // No group for people living with dementia on this round.
  const groups = page.getByRole('radiogroup', { name: 'group' });
  await expect(groups.getByRole('radio', { name: /diagnosis of early-stage dementia/ })).toHaveCount(0);
  await groups.getByRole('radio', { name: /I care, or recently cared/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Setup: the code only. The microphone is optional, so Start does not wait for it.
  await page.getByPlaceholder('the code you were given').fill(STUDY_ACCESS_CODE);
  await expect(page.getByRole('checkbox', { name: /Continue without the microphone/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

test.describe('feedback round (mocked session)', () => {
  test('(h) privacy → free use → try an idea → flag an answer → questions → skip SUS → done; no arm anywhere', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false });
    await enrol(page);

    await expect.poll(() => log.study.session.length).toBe(1);
    expect(log.study.session[0].body).toMatchObject({
      protocol: 'feedback', group: 'caregiver', consentTranscripts: true, consent: { privacyNoticeRead: true },
    });

    await expect(page.getByRole('heading', { name: 'Use the app as you would at home' })).toBeVisible();
    await page.getByRole('button', { name: 'Start using the app' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    const band = page.getByRole('region', { name: 'Feedback session' });
    await expect(band).toBeVisible();

    // An idea from the list, ticked off. The e-DiVA ideas link to its website.
    await band.getByRole('button', { name: 'Things to try (0 of 8)' }).click();
    await expect(band.getByRole('link', { name: 'Open e-DiVA-NZ' }).first()).toHaveAttribute('href', 'https://ediva.example.nz/');
    await band.getByRole('checkbox', { name: 'Ask about respite care near you.' }).check();
    await band.getByRole('button', { name: 'Hide ideas' }).click();
    await expect(band.getByRole('button', { name: 'Things to try (1 of 8)' })).toBeVisible();

    // In-app navigation, not a reload (a reload asks "is this still you?").
    await page.evaluate(() => { location.hash = '#/app/chat'; });
    await expect(page.getByLabel('Type your question')).toBeVisible();
    await ask(page, 'Where can I find respite care near me?');
    await expect(page.getByRole('button', { name: 'Open source 1' })).toBeVisible();

    await page.getByRole('button', { name: '⚑ Flag this answer' }).click();
    await page.getByLabel('What’s wrong with this answer?').fill('It did not mention my region.');
    await page.getByRole('button', { name: 'Send flag' }).click();
    await expect(page.getByText('Flagged — thank you.')).toBeVisible();

    await band.getByRole('button', { name: 'I’m finished' }).click();
    await page.getByRole('button', { name: 'Yes, I’m finished' }).click();
    await expect(page).toHaveURL(/#\/study\/feedback$/);
    await expect(page.getByRole('heading', { name: 'What did you think?' })).toBeVisible();
    await page.getByLabel('What did you find useful?').fill('The respite answer was clear.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Ten quick questions (optional)' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip and finish' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you — that’s everything' })).toBeVisible();
    await expect(page.getByText('Your session code is')).toBeVisible();

    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining([
      'session_start', 'explore_start', 'try_done', 'page_view', 'turn', 'answer_flagged',
      'explore_end', 'feedback_done', 'sus_done', 'session_complete',
    ]));
    const events = studyEvents(log);
    const of = (kind) => events.filter((e) => e.kind === kind);

    expect(of('session_start')[0].payload).toMatchObject({ protocol: 'feedback', armOrder: null });
    // No arm and no task on anything: free use is not an arm of the tasks study.
    for (const e of events) {
      expect(e.arm).toBeNull();
      expect(e.taskId).toBeNull();
    }
    expect(of('try_done')[0].payload).toEqual({ id: 'respite', done: true });
    expect(of('page_view').map((e) => e.payload.path)).toEqual(expect.arrayContaining(['/app/home', '/app/chat']));

    // The flag joins its answer through the turn id, and carries the exchange itself.
    const turn = of('turn')[0];
    const flag = of('answer_flagged')[0];
    expect(turn.payload.turnId).toEqual(expect.any(String));
    expect(flag.payload).toMatchObject({
      turnId: turn.payload.turnId,
      surface: 'chat',
      comment: 'It did not mention my region.',
      question: expect.stringContaining('respite care'),
      answer: turn.payload.answer,
    });

    expect(of('feedback_done')[0].payload.responses).toEqual({ 'feedback.useful': 'The respite answer was clear.' });
    expect(of('sus_done')[0].payload).toEqual({ scope: 'feedback', responses: {} });
    expect(log.study.progress.map((p) => p.step)).toEqual(expect.arrayContaining(['explore', 'feedback', 'feedbacksus']));
    // Marked complete after the final flush, so it can trail the last events.
    await expect.poll(() => log.study.complete, { timeout: slow(15_000) }).toEqual([expect.objectContaining({ stoppedEarly: false })]);

    // "Nothing more will be recorded": going back into the app afterwards adds nothing.
    const before = studyEvents(log).length;
    await page.evaluate(() => { location.hash = '#/app/chat'; });
    await ask(page, 'One more question after the end');
    await expect(page.getByText('One more question after the end')).toBeVisible();
    await page.waitForTimeout(2500); // one flush interval
    expect(studyEvents(log).length).toBe(before);
  });

  test('(i) the API refusing the round shows "not open", not a different study', async ({ page }) => {
    await mockProviders(page);
    await page.route('**/api/study/session', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"not available"}' }));
    await seedStorage(page, { keys: false });
    await enrol(page);
    await expect(page.getByRole('alert')).toContainText('Feedback sessions aren’t open at the moment');
    await expect(page.getByRole('heading', { name: 'Let’s get set up' })).toBeVisible();
  });

  test('(i2) an API that ignores the protocol is refused too, not run as the tasks study', async ({ page }) => {
    await mockProviders(page);
    // What an API from before the feedback round answers: a tasks session.
    await page.route('**/api/study/session', (route) => route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ sessionId: '11111111-2222-4333-8444-555555555555', participantCode: 'P02', participantNumber: 2, group: 'caregiver', armOrder: 'BA', setOrder: '12', resumed: false, completed: false, studyVersion: '1.1' }),
    }));
    await seedStorage(page, { keys: false });
    await enrol(page);
    await expect(page.getByRole('alert')).toContainText('Feedback sessions aren’t open at the moment');
    await expect(page.getByText('Your participant code is')).toHaveCount(0);
  });

  test('(j) the tasks study link is unchanged with the round switched on', async ({ page }) => {
    await mockProviders(page);
    await seedStorage(page, { keys: false });
    await page.goto('/#/study');
    await expect(page.getByRole('heading', { name: 'Thank you for taking part' })).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'About this study' })).toBeVisible();
  });
});

test.describe('feedback round: the other ways through (mocked session)', () => {
  test('declining to keep conversations is explained; the band can be cancelled, stopped, and the session code is shown', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, { keys: false, settings: { avatarId: 'aria', showAvatar: false } });
    await page.goto('/#/study/feedback');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('radiogroup', { name: 'transcripts' }).getByRole('radio', { name: 'No, do not keep my conversation' }).click();
    await expect(page.getByText('An answer you choose to flag is still sent, with the question you asked')).toBeVisible();
    // Who holds the data, and how to reach them (NZ Privacy Act, IPP 3).
    await expect(page.getByText(/contact the DementiaGuide team at feedback@example\.nz/)).toBeVisible();
    await page.getByRole('button', { name: 'I’ve read this — continue' }).click();
    await page.getByRole('radiogroup', { name: 'group' }).getByRole('radio', { name: 'I am helping test this feedback session' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('the code you were given').fill(STUDY_ACCESS_CODE);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('button', { name: 'Start using the app' }).click();

    const band = page.getByRole('region', { name: 'Feedback session' });
    // Text size from the band.
    await band.getByRole('button', { name: 'Text size' }).click();
    await expect(band.getByRole('button', { name: 'Text size' })).toHaveText('Aa+');
    // Ticking several ideas on and off records each change.
    await band.getByRole('button', { name: /Things to try/ }).click();
    // (Twenty-odd changes in a row are sent at once rather than waiting for the timer.)
    const idea = band.getByRole('checkbox', { name: 'Ask how dementia is different from normal ageing.' });
    for (let i = 0; i < 22; i++) await idea.click();
    await expect(idea).not.toBeChecked();

    // "I'm finished" asks first; "Keep using the app" changes nothing.
    await band.getByRole('button', { name: 'I’m finished' }).click();
    await page.getByRole('button', { name: 'Keep using the app' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);
    // Stopping from the band ends the session.
    await band.getByRole('button', { name: 'I need to stop' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Stop the session' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, stop' }).click();
    await expect(page).toHaveURL(/#\/study\/feedback$/);
    await expect(page.getByRole('heading', { name: 'You’ve stopped the session' })).toBeVisible();
    await expect(page.getByText(/quoting your session code — P31/)).toBeVisible();

    await expect.poll(() => studyEvents(log).map((e) => e.kind), { timeout: slow(15_000) }).toEqual(expect.arrayContaining(['explore_end', 'session_stopped']));
    expect(studyEvents(log).filter((e) => e.kind === 'try_done').length).toBeGreaterThanOrEqual(22);
    expect(studyEvents(log).find((e) => e.kind === 'explore_end').payload.stoppedMidExplore).toBe(true);
  });

  test('back on the study page mid-session: return to the app, or finish, then answer the questionnaire', async ({ page }) => {
    const log = await mockProviders(page);
    await seedStorage(page, {
      keys: false,
      settings: { avatarId: 'aria', showAvatar: false },
      study: {
        protocol: 'feedback', accessCode: STUDY_ACCESS_CODE, participantCode: 'P31', sessionId: '11111111-2222-4333-8444-555555555555',
        group: 'caregiver', step: 'explore', exploreStartedAt: Date.now() - 60_000, consentTranscripts: true,
      },
    });
    await page.goto('/#/study/feedback');
    await expect(page.getByText('This device has a session in progress for participant P31.')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    await expect(page.getByRole('heading', { name: 'You’re still using the app' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to the app' }).click();
    await expect(page).toHaveURL(/#\/app\/home$/);

    await page.evaluate(() => { location.hash = '#/study/feedback'; });
    // The page's own button (the band above the page has one too).
    await page.getByRole('button', { name: 'I’m finished' }).first().click();
    await expect(page.getByRole('heading', { name: 'What did you think?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radiogroup', { name: 'q1', exact: true }).getByRole('radio', { name: '4 — Agree' }).click();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thank you — that’s everything' })).toBeVisible();
    await expect.poll(() => studyEvents(log).find((e) => e.kind === 'sus_done')?.payload?.responses, { timeout: slow(15_000) }).toEqual({ 'sus.feedback.q1': 4 });
  });

  test('during free use an answer heard on the voice screen can be flagged from the transcript', async ({ page }) => {
    const log = await mockProviders(page, { answer: 'Respite can be arranged through a needs assessment [S1].', audioSeconds: 0.3 });
    await seedStorage(page, {
      keys: false,
      settings: { avatarId: 'aria', showAvatar: false },
      study: {
        protocol: 'feedback', accessCode: STUDY_ACCESS_CODE, participantCode: 'P31', sessionId: '11111111-2222-4333-8444-555555555555',
        group: 'caregiver', step: 'explore', exploreStartedAt: Date.now(), consentTranscripts: true,
      },
    });
    await page.goto('/#/study/feedback');
    await page.getByRole('button', { name: 'Yes, that’s me — carry on' }).click();
    await page.getByRole('button', { name: 'Back to the app' }).click();
    await page.evaluate(() => { location.hash = '#/app/voice'; });
    await page.getByLabel('Message Aria').fill('Where can I get a break?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Tap the mic or type below')).toBeVisible({ timeout: slow(20_000) });

    await page.getByRole('button', { name: 'Show transcript' }).click();
    await page.getByRole('button', { name: '⚑ Flag this answer' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: '⚑ Flag this answer' }).click();
    await page.getByLabel('What’s wrong with this answer?').fill('Too vague.');
    await page.getByRole('button', { name: 'Send flag' }).click();
    await expect(page.getByText('Flagged — thank you.')).toBeVisible();
    await expect.poll(() => studyEvents(log).find((e) => e.kind === 'answer_flagged')?.payload, { timeout: slow(15_000) }).toMatchObject({ surface: 'voice', comment: 'Too vague.', question: 'Where can I get a break?' });
  });
});
