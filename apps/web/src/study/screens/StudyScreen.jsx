// The study flow screen. Everything except the tasks themselves happens here;
// during a task the participant is in the real app with StudyTaskOverlay on top.
import React, { useEffect, useState } from 'react';
import { useStudy, detectBrowser, SUPPORTED_BROWSERS } from '../StudyContext.jsx';
import { armLabel, GROUPS, IDENTITY_WARNING } from '@core/study/studyConfig.mjs';
import { useSettings } from '../../state/SettingsContext.jsx';
import { useEffectiveAvatarProfile } from '../../avatar/effectiveProfile.js';
import { Page, Button, Choice, LikertItem, TextArea, SupportNumbers, Disclaimer, card, PIS, PisLink } from '../ui.jsx';
import { navigate } from '../../state/router.js';
import { CONSENT_ITEMS, SUS_ITEMS, LIKERT_ITEMS, BACKGROUND, POST_TASK, DEBRIEF, PLWD_ITEMS, PLWD_DEBRIEF, SUPPORTER_DEBRIEF } from '../instruments.js';

function StopBar({ onStop }) {
  // Two-step, matching the task overlay's stop. A stopped session cannot be
  // resumed, so a single stray tap here used to end a participant permanently.
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: 'var(--bw) solid var(--border)' }}>
      <Button variant="quiet" onClick={() => setConfirming(true)} style={{ padding: 0, minHeight: 44 }}>
        I need to stop
      </Button>
      <p style={{ fontSize: '.88rem', color: 'var(--text2)', margin: '.25rem 0 0' }}>
        You can stop at any time, for any reason. You don’t have to say why.
      </p>
      {confirming && (
        <div
          role="alertdialog"
          aria-label="Stop the session"
          style={{ marginTop: '.75rem', padding: '.9rem 1rem', borderRadius: 12, background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)' }}
        >
          <p style={{ margin: '0 0 .75rem', lineHeight: 1.6, color: 'var(--text)' }}>
            Stop the session? Nothing more will be recorded. You don’t have to give a reason.
          </p>
          <div style={{ display: 'flex', gap: '.6rem' }}>
            <Button onClick={onStop}>Yes, stop</Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>Keep going</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hands the device to the next participant.
 *
 * Rendered in exactly two places: at the end of a finished session, and behind
 * the "I'm someone else" branch of the resume gate. It must NOT sit on an
 * ordinary screen of a live session — that was the old behaviour of the fallback
 * screen further down, and it silently discarded progress. Two steps rather than
 * one so that a tap does not clear the participant code before the participant
 * has written it down.
 */
function NextParticipant({ onReset, startArmed = false, onCancel = null }) {
  const [armed, setArmed] = useState(startArmed);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);

  const clear = async () => {
    setBusy(true);
    try {
      const result = await onReset();
      if (!result.cleared) setPending(result.pending);
    } finally {
      setBusy(false);
    }
  };

  if (!armed) {
    return (
      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: 'var(--bw) solid var(--border)' }}>
        <Button variant="quiet" onClick={() => setArmed(true)} style={{ padding: 0, minHeight: 44 }}>
          Setting up for another participant?
        </Button>
      </div>
    );
  }

  return (
    <div style={{ ...card, marginTop: '2.5rem' }}>
      {pending > 0 ? (
        <p style={{ margin: '0 0 1rem', lineHeight: 1.6, color: 'var(--text)' }}>
          <strong>Not cleared.</strong> {pending} {pending === 1 ? 'record has' : 'records have'} not
          reached the server yet. Stay on this page while the connection recovers, then try again —
          clearing now would lose {pending === 1 ? 'it' : 'them'}.
        </p>
      ) : (
        <p style={{ margin: '0 0 1rem', lineHeight: 1.6, color: 'var(--text)' }}>
          This clears the session from this device so the next participant starts from a blank
          slate. Answers already sent to the server are not affected.
        </p>
      )}
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <Button onClick={clear} disabled={busy}>
          {busy ? 'Checking…' : pending > 0 ? 'Try again' : 'Clear this device'}
        </Button>
        <Button variant="quiet" onClick={onCancel || (() => setArmed(false))}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * "Is this still you?" — shown once per page load when the device restored a
 * session that has not finished.
 *
 * The study runs on a single link the supervisor forwards, so more than one
 * person will open it on the same browser. Without this the second person is
 * resumed silently into the first person's session: their code, their answers,
 * their arm assignment. Two participants become one row and nothing in the data
 * records that it happened.
 *
 * The two choices are deliberately not weighted. "Carry on" is one tap for the
 * genuine returner, and the other branch reuses the same guarded clear as the
 * end-of-session control, so a half-finished handover cannot discard a queue of
 * unsent events.
 */
function ResumeGate({ code, onCarryOn, onReset }) {
  const [handover, setHandover] = useState(false);
  return (
    <Page
      title="Welcome back"
      lead={code
        ? `This device has a session in progress for participant ${code}.`
        : 'This device has a session already in progress.'}
    >
      {!handover ? (
        <>
          <div style={card}>
            <p style={{ margin: '0 0 1.25rem', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--text)' }}>
              If that is you, carry on from where you stopped. If you are a different
              person, start a fresh session so your answers are kept separate.
            </p>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <Button onClick={onCarryOn}>Yes, that’s me — carry on</Button>
              <Button variant="secondary" onClick={() => setHandover(true)}>
                I’m someone else
              </Button>
            </div>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '.95rem', color: 'var(--text2)', lineHeight: 1.6 }}>
            Not sure? Choosing “carry on” changes nothing — you can start fresh from
            this screen next time you open the link.
          </p>
        </>
      ) : (
        <NextParticipant onReset={onReset} startArmed onCancel={() => setHandover(false)} />
      )}
    </Page>
  );
}

export default function StudyScreen() {
  const st = useStudy();
  const { settings } = useSettings();
  // Whichever avatar actually resolved — Aaron by default, Aria if the Unity
  // build failed to load. Naming the wrong one in the instructions would confuse
  // a participant who is looking at a different face.
  const assistant = useEffectiveAvatarProfile(settings.avatarId).name;
  const { step, stage, task, responses } = st;

  // Every step is a new page of content, but the browser keeps the previous
  // scroll offset — so a participant who clicks "Continue" at the bottom of one
  // screen lands halfway down the next one and may never see its heading.
  useEffect(() => { window.scrollTo(0, 0); }, [step, st.stageIndex, st.taskIndex]);

  // Before every step: a restored session has to be claimed by whoever is at the
  // keyboard, or the next person inherits it. See ResumeGate.
  if (st.needsResumeCheck) {
    return (
      <ResumeGate
        code={st.participantCode}
        onCarryOn={st.acknowledgeResume}
        onReset={st.reset}
      />
    );
  }

  const answer = (k) => responses[k];
  const set = (k) => (v) => st.setResponse(k, v);

  // ─── Consent and setup ────────────────────────────────────────────────────

  if (step === 'intro') {
    return (
      <Page
        title="Thank you for taking part"
        lead="This study is about finding information on dementia care. It takes about 35 to 45 minutes, and you can take a break in the middle."
      >
        <div style={card}>
          <h2 style={{ margin: '0 0 .75rem', fontSize: '1.1rem' }}>What happens</h2>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.9, color: 'var(--text)' }}>
            <li>A few short questions about you — no name, no contact details</li>
            <li>Six short made-up situations to look up, three each way</li>
            <li>Some questions about how easy each way was to use</li>
            <li>Five short questions at the end</li>
          </ol>
        </div>
        <p style={{ marginTop: '1.25rem', color: 'var(--text2)', lineHeight: 1.6 }}>
          There are no right or wrong answers. <strong>We are testing the app, not you</strong> —
          if something is hard to find, that is exactly what we need to know.
        </p>
        <div style={{ marginTop: '1.5rem' }}><Button onClick={st.next}>Start</Button></div>
        <Disclaimer />
      </Page>
    );
  }

  if (step === 'info') return <InfoStep onNext={st.next} onStop={st.stop} />;
  if (step === 'group') return <GroupStep onNext={st.next} onStop={st.stop} />;
  if (step === 'consent') return <ConsentStep onNext={st.next} onStop={st.stop} />;
  if (step === 'setup') return <SetupStep onStop={st.stop} />;

  // ─── Background ───────────────────────────────────────────────────────────

  if (step === 'background') {
    const done = BACKGROUND.every((q) => answer(q.id) !== undefined || q.optional);
    return (
      <Page title="A few questions about you" lead="Every question can be skipped.">
        {/* The code is allocated by the server, so this is the first moment the
            participant can see it — and they need it to ask for their data to be
            deleted, or to pick the session up on another device. */}
        {st.participantCode && (
          <div style={{ ...card, marginBottom: '1.25rem', borderColor: 'var(--primary)' }}>
            <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text)' }}>
              Your participant code is <strong>{st.participantCode}</strong>. Please write
              it down. It is how you can ask us to delete your answers later, and how you
              would carry on if you had to continue on another device. We don’t collect
              your name, so it is the only way we can find your session.
            </p>
          </div>
        )}
        {BACKGROUND.map((q) => (
          <div key={q.id} style={{ ...card, marginBottom: '.9rem' }}>
            <p style={{ margin: '0 0 .8rem', fontSize: '1.02rem', lineHeight: 1.5 }}>{q.text}</p>
            <Choice name={q.id} options={q.options} value={answer(q.id)} onChange={set(q.id)} />
          </div>
        ))}
        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '.75rem' }}>
          <Button onClick={st.next}>{done ? 'Continue' : 'Skip and continue'}</Button>
        </div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  // ─── Arm brief and task cards ─────────────────────────────────────────────

  if (step === 'armbrief' && stage && task) {
    const first = st.taskIndex === 0;
    return (
      <Page
        title={first ? armLabel(stage.arm, assistant) : `Next: ${task.title}`}
        lead={first ? armIntro(stage.arm, assistant) : null}
      >
        <div style={card}>
          <p style={{ margin: '0 0 .9rem', fontSize: '1.08rem', lineHeight: 1.65, color: 'var(--text)' }}>
            {task.situation}
          </p>
          <p style={{ margin: 0, fontSize: '1.08rem', lineHeight: 1.65, fontWeight: 600, color: 'var(--text)' }}>
            {task.goal}
          </p>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '.95rem', color: 'var(--text2)', lineHeight: 1.6 }}>
          {IDENTITY_WARNING}
        </p>
        <p style={{ marginTop: '.75rem', fontSize: '.95rem', color: 'var(--text2)', lineHeight: 1.6 }}>
          Take as long as you like. When you have found what you need — or if you
          decide you can’t — use the buttons at the top of the screen to come back here.
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <Button onClick={st.startTask}>Start</Button>
        </div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  // Reachable by pressing Back, or by typing #/study during a task. Previously
  // this fell through to the "not started yet" screen, whose only button reset
  // the session to `intro` — losing the task entirely, since `task_end` never
  // fired and the export requires a matching start/end pair.
  if (step === 'task' && stage && task) {
    return (
      <Page
        title="Your task is still open"
        lead="You stepped away from the app. Nothing is lost — pick up where you were."
      >
        <div style={card}>
          <p style={{ margin: '0 0 .9rem', fontSize: '1.05rem', lineHeight: 1.65, color: 'var(--text)' }}>
            {task.situation}
          </p>
          <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.65, fontWeight: 600, color: 'var(--text)' }}>
            {task.goal}
          </p>
        </div>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <Button onClick={() => navigate(stage.arm === 'A' ? '#/app/voice' : '#/app/chat')}>
            Back to the app
          </Button>
          <Button variant="secondary" onClick={() => st.endTask('no')}>
            I couldn’t find it
          </Button>
        </div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  // ─── After each task ──────────────────────────────────────────────────────

  if (step === 'posttask' && task) {
    const k = (q) => `${task.id}.${q.id}`;
    const done = POST_TASK.every((q) => answer(k(q)) !== undefined);
    return (
      <Page title="How did that go?">
        {POST_TASK.map((q) => (
          <div key={q.id} style={{ ...card, marginBottom: '.9rem' }}>
            <p style={{ margin: '0 0 .8rem', fontSize: '1.02rem', lineHeight: 1.5 }}>{q.text}</p>
            <Choice name={q.id} options={q.options} value={answer(k(q))} onChange={set(k(q))} />
          </div>
        ))}
        <div style={{ marginTop: '1.25rem' }}>
          <Button onClick={st.next}>{done ? 'Continue' : 'Skip and continue'}</Button>
        </div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  // ─── Questionnaires ───────────────────────────────────────────────────────

  if (step === 'sus' && stage) {
    return (
      <Page
        title="How was that to use?"
        lead={`These ten questions are about ${(() => { const l = armLabel(stage.arm, assistant); return l.charAt(0).toLowerCase() + l.slice(1); })()}. There are no right answers — go with your first reaction.`}
      >
        {SUS_ITEMS.map((item, i) => (
          <LikertItem
            key={item.id}
            id={item.id}
            text={`${i + 1}. ${item.text}`}
            value={answer(`sus.${stage.arm}.${item.id}`)}
            onChange={set(`sus.${stage.arm}.${item.id}`)}
          />
        ))}
        <div style={{ marginTop: '1.25rem' }}><Button onClick={st.next}>Continue</Button></div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  if (step === 'likert' && stage) {
    const items = st.group === 'plwd' ? PLWD_ITEMS : LIKERT_ITEMS;
    return (
      <Page title="A few more about that way of using the app">
        {items.map((item) => (
          <div key={item.id} style={{ ...card, marginBottom: '.9rem' }}>
            <p style={{ margin: '0 0 .8rem', fontSize: '1.02rem', lineHeight: 1.5 }}>{item.text}</p>
            <Choice
              name={item.id}
              options={item.options}
              value={answer(`likert.${stage.arm}.${item.id}`)}
              onChange={set(`likert.${stage.arm}.${item.id}`)}
            />
          </div>
        ))}
        <div style={{ marginTop: '1.25rem' }}><Button onClick={st.next}>Continue</Button></div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  // ─── Debrief and close ────────────────────────────────────────────────────

  // Halfway pause for participants living with dementia. Deliberately makes
  // stopping the equally-weighted option, not the reluctant one.
  if (step === 'recheck') {
    return (
      <Page
        title="Time for a break"
        lead="That’s the first half done. There’s one more short part, or you can finish here."
      >
        <div style={{ ...card, borderColor: 'var(--primary)' }}>
          <p style={{ margin: '0 0 1rem', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--text)' }}>
            <strong>For the support person:</strong> please check with them whether they
            are happy to carry on. If they seem tired or have had enough, finishing now
            is a completely good outcome — it is not a failed session.
          </p>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <Button onClick={st.next}>Yes, carry on</Button>
            <Button variant="secondary" onClick={st.stop}>Finish here</Button>
          </div>
        </div>
      </Page>
    );
  }

  if (step === 'debrief') {
    // Participants living with dementia get one question, then two for their
    // support person (instruments.md §7, protocol.md §3.3).
    const questions = st.group === 'plwd' ? PLWD_DEBRIEF : DEBRIEF;
    return (
      <Page
        title={st.group === 'plwd' ? 'One last question' : 'Last few questions'}
        lead="Write as much or as little as you like. You can skip any of these."
      >
        {questions.map((q, i) => (
          <div key={q.id} style={{ ...card, marginBottom: '.9rem' }}>
            <p style={{ margin: '0 0 .8rem', fontSize: '1.02rem', lineHeight: 1.5 }}>{i + 1}. {q.text}</p>
            <TextArea value={answer(`debrief.${q.id}`)} onChange={set(`debrief.${q.id}`)} />
          </div>
        ))}
        {st.group === 'plwd' && (
          <div style={{ ...card, borderColor: 'var(--primary)', marginTop: '1.5rem' }}>
            <h2 style={{ margin: '0 0 .5rem', fontSize: '1.05rem' }}>For the support person</h2>
            <p style={{ margin: '0 0 1rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              Two short questions for whoever sat with you today.
            </p>
            {SUPPORTER_DEBRIEF.map((q) => (
              <div key={q.id} style={{ marginBottom: '.9rem' }}>
                <p style={{ margin: '0 0 .6rem', fontSize: '1rem', lineHeight: 1.5 }}>{q.text}</p>
                <TextArea value={answer(`supporter.${q.id}`)} onChange={set(`supporter.${q.id}`)} rows={3} />
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: '1.25rem' }}><Button onClick={st.next}>Finish</Button></div>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  if (step === 'stopped') {
    return (
      <Page
        title="You’ve stopped the session"
        lead="That’s completely fine, and nothing more will be recorded. Thank you for the time you did give."
      >
        <SupportNumbers />
        <p style={{ marginTop: '1.5rem', color: 'var(--text2)', lineHeight: 1.6 }}>
          If you would like the data from your session deleted, email the researcher
          within two weeks quoting your participant code — <strong>{st.participantCode}</strong>.
        </p>
        <NextParticipant onReset={st.reset} />
      </Page>
    );
  }

  if (step === 'done') {
    return (
      <Page
        title="Thank you — that’s everything"
        lead="Your answers have been recorded. They will help shape how this kind of tool is built for carers in New Zealand."
      >
        <SupportNumbers />
        <div style={{ ...card, marginTop: '1.25rem' }}>
          <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text)' }}>
            Your participant code is <strong>{st.participantCode}</strong>. Please keep it.
            It is the only way to ask us to delete your data, and you have two weeks
            from today to do that.
          </p>
        </div>
        <Disclaimer />
        <NextParticipant onReset={st.reset} />
      </Page>
    );
  }

  // Fallback for an inconsistent (step, stage, task) combination. It must NOT
  // offer to reset a live session — that was the previous behaviour and it
  // silently discarded the participant's progress.
  if (st.sessionId) {
    return (
      <Page
        title="Let’s get you back on track"
        lead="Something went out of step. Your answers so far are saved."
      >
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <Button onClick={() => st.update({ step: 'armbrief' })}>Continue the study</Button>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '.95rem', color: 'var(--text2)', lineHeight: 1.6 }}>
          If this keeps happening, email the researcher with your participant code
          — <strong>{st.participantCode}</strong>.
        </p>
        <StopBar onStop={st.stop} />
      </Page>
    );
  }

  return (
    <Page title="Study" lead="This session has not started yet.">
      <Button onClick={() => st.update({ step: 'intro' })}>Begin</Button>
    </Page>
  );
}

// No pronouns: the avatar roster is mixed (Aaron male, Ariana/Aria female) and a
// participant may be on any of them.
function armIntro(arm, name) {
  return arm === 'A'
    ? `For the next three, you’ll talk to ${name} out loud and hear the answer spoken back. Press the microphone button, ask your question, then press it again when you have finished speaking.`
    : `For the next three, you’ll type your questions and ${name} will answer in writing on the screen.`;
}

// ─── Steps with their own local state ───────────────────────────────────────

function InfoStep({ onNext, onStop }) {
  return (
    <Page title="About this study" lead="Please read this before you agree to take part.">
      <div style={card}>
        <h2 style={{ margin: '0 0 .6rem', fontSize: '1.05rem' }}>What we record</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.9 }}>
          <li>Your answers to the questions in this study</li>
          <li>How long each task took and how many questions you asked</li>
          <li><strong>The questions you ask the app and the answers it gives</strong></li>
          <li>Technical information — your browser, and how fast the app responded</li>
        </ul>
        <h2 style={{ margin: '1.25rem 0 .6rem', fontSize: '1.05rem' }}>What we don’t record</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.9 }}>
          <li>Your name, email address, or any contact details</li>
          <li>Any recording of your voice — speech becomes text, and only the text is kept</li>
          <li>Anything from your camera</li>
        </ul>
      </div>
      <p style={{ marginTop: '1.25rem', lineHeight: 1.65, color: 'var(--text)' }}>
        The situations you will be given are made up, and you don’t need to tell the
        app — or us — anything about your own circumstances. {IDENTITY_WARNING}
      </p>
      <p style={{ marginTop: '1rem', lineHeight: 1.65, color: 'var(--text)' }}>
        Everything is stored against your participant code, not your name, and is kept
        securely for six years before being destroyed. Nothing that could identify you
        will ever be published.
      </p>

      <div style={{ ...card, marginTop: '1.5rem' }}>
        <h2 style={{ margin: '0 0 .5rem', fontSize: '1.05rem' }}>The full information sheet</h2>
        <p style={{ margin: '0 0 .9rem', lineHeight: 1.6, color: 'var(--text)' }}>
          The summary above is the short version. The full information sheet opens in a new
          tab, and you can save or print a copy to keep.
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 2 }}>
          {Object.entries(PIS)
            .filter(([g]) => g !== 'pilot')
            .map(([g]) => <li key={g}><PisLink group={g} /></li>)}
        </ul>
      </div>

      <div style={{ marginTop: '1.5rem' }}><Button onClick={onNext}>I’ve read this</Button></div>
      <StopBar onStop={onStop} />
      <Disclaimer />
    </Page>
  );
}

// Itemised consent. Items 1–6 are required; the transcript item is genuinely
// optional and declining it does not block participation
// (docs/study/ethics/consent-form.md).

/**
 * Which group the participant is in — asked before consent, not at setup.
 *
 * Participants living with dementia consent on paper with their support person
 * before the session (ethics/consent-form.md, "Form for a participant living
 * with dementia"): plain language, 16 pt, signed. The eleven-item on-screen form
 * is for the unmoderated groups, and putting a person with dementia through it
 * anyway works against the fatigue safeguard in protocol §3.3 — the very reason
 * the short form exists. The app can only tell the two apart if it asks first.
 */
function GroupStep({ onNext, onStop }) {
  const st = useStudy();
  const [group, setGroup] = useState(st.group || null);
  return (
    <Page title="Which best describes you?" lead="This decides which questions you are asked, and how long the session takes.">
      <div style={card}>
        <Choice
          name="group"
          options={[
            { value: 'caregiver', label: 'I care, or recently cared, for someone with dementia' },
            { value: 'worker', label: 'I work in dementia care or aged care' },
            { value: 'plwd', label: 'I have a diagnosis of early-stage dementia' },
            { value: 'pilot', label: 'I am helping test the study itself' },
          ]}
          value={group}
          onChange={(v) => { setGroup(v); st.update({ group: v }); }}
        />
      </div>
      <div style={{ marginTop: '1.5rem' }}>
        <Button onClick={onNext} disabled={!GROUPS.includes(group)}>Continue</Button>
      </div>
      <StopBar onStop={onStop} />
    </Page>
  );
}

/**
 * Confirms the paper consent already signed with the support person.
 *
 * Deliberately NOT a second consent. The approved process for this group is a
 * signed paper form read through beforehand; re-collecting it on screen would
 * both duplicate it and replace a supported conversation with an unsupported
 * tick-box. This records that the paper step happened, and nothing more.
 */
function PlwdConsentStep({ onNext, onStop }) {
  const st = useStudy();
  const [confirmed, setConfirmed] = useState(false);
  const [transcripts, setTranscripts] = useState(null);
  return (
    <Page
      title="Before we start"
      lead="You should already have gone through the paper consent form with the person supporting you."
    >
      <div style={card}>
        <p style={{ margin: '0 0 1rem', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--text)' }}>
          If you have not done that yet, please stop here and do it together first.
        </p>
        <p style={{ margin: '0 0 1rem', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--text2)' }}>
          You can read the sheets again here: <PisLink group="plwd">the sheet for you</PisLink>,
          and <PisLink group="supporter">the one for your support person</PisLink>.
        </p>
        <label style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 24, height: 24, marginTop: 2, flexShrink: 0, accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--text)' }}>
            We have read and signed the paper form together.
          </span>
        </label>
      </div>

      <div style={{ ...card, borderColor: 'var(--primary)', marginTop: '1.25rem' }}>
        <p style={{ margin: '0 0 1rem', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--text)' }}>
          May the researcher read what you type or say to the app, and what the app says
          back? You can say no and still take part.
        </p>
        <Choice
          name="transcripts"
          options={[
            { value: true, label: 'Yes, the researcher may read it' },
            { value: false, label: 'No, they may not' },
          ]}
          value={transcripts}
          onChange={setTranscripts}
        />
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <Button
          onClick={() => { st.update({ consent: { paperFormSigned: true }, consentTranscripts: transcripts }); onNext(); }}
          disabled={!confirmed || transcripts === null}
        >
          Continue
        </Button>
      </div>
      <StopBar onStop={onStop} />
    </Page>
  );
}

function ConsentStep({ onNext, onStop }) {
  const st = useStudy();
  const [ticks, setTicks] = useState({});
  const [transcripts, setTranscripts] = useState(null);
  const allTicked = CONSENT_ITEMS.every((i) => ticks[i.id]);
  const ready = allTicked && transcripts !== null;

  // Paper consent, signed with the support person, is the approved route for
  // this group — see PlwdConsentStep.
  if (st.group === 'plwd') return <PlwdConsentStep onNext={onNext} onStop={onStop} />;

  return (
    <Page title="Your consent" lead="Please tick each box to show you understand and agree.">
      <p style={{ margin: '0 0 1.25rem', lineHeight: 1.65, color: 'var(--text2)' }}>
        You can re-read the full information sheet at any time: <PisLink group={st.group} />.
      </p>
      {CONSENT_ITEMS.map((item) => (
        <label
          key={item.id}
          style={{
            ...card,
            display: 'flex',
            gap: '.9rem',
            alignItems: 'flex-start',
            marginBottom: '.75rem',
            cursor: 'pointer',
            padding: '1rem 1.15rem',
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(ticks[item.id])}
            onChange={(e) => setTicks((p) => ({ ...p, [item.id]: e.target.checked }))}
            style={{ width: 24, height: 24, marginTop: 2, flexShrink: 0, accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: '1rem', lineHeight: 1.55, color: 'var(--text)' }}>{item.text}</span>
        </label>
      ))}

      <div style={{ ...card, borderColor: 'var(--primary)', marginTop: '1.25rem' }}>
        <h2 style={{ margin: '0 0 .5rem', fontSize: '1.05rem' }}>One optional choice</h2>
        <p style={{ margin: '0 0 1rem', lineHeight: 1.6, color: 'var(--text)' }}>
          May we keep <strong>the questions you ask the app and the answers it gives</strong>,
          so the researcher can check whether the app answered correctly and safely?
          You can say no and still take part.
        </p>
        <Choice
          name="transcripts"
          options={[
            { value: true, label: 'Yes, keep my conversation' },
            { value: false, label: 'No, do not keep my conversation' },
          ]}
          value={transcripts}
          onChange={setTranscripts}
        />
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <Button
          onClick={() => { st.update({ consent: ticks, consentTranscripts: transcripts }); onNext(); }}
          disabled={!ready}
        >
          I agree — continue
        </Button>
        {!ready && (
          <p style={{ fontSize: '.9rem', color: 'var(--text2)', marginTop: '.6rem' }}>
            Please tick every box above and answer the optional question to continue.
          </p>
        )}
      </div>
      <StopBar onStop={onStop} />
    </Page>
  );
}

// Codes, browser gate and microphone check — all before the first task, so a
// participant never discovers halfway through that voice cannot work.
function SetupStep({ onStop }) {
  const st = useStudy();
  const [participantCode, setParticipantCode] = useState(st.participantCode || '');
  // Open by default only when a code is already on file, i.e. this really is a
  // resume — otherwise the field stays out of a first-timer's way.
  const [resuming, setResuming] = useState(Boolean(st.participantCode));
  const [accessCode, setAccessCode] = useState(st.accessCode || '');
  // Chosen on the group step, before consent — see GroupStep.
  const group = st.group || 'caregiver';
  const [mic, setMic] = useState(null);
  const [supporterPresent, setSupporterPresent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const browser = detectBrowser();
  const browserOk = SUPPORTED_BROWSERS.includes(browser);

  const checkMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMic('ok');
    } catch {
      setMic('denied');
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await st.begin({
        participantCode,
        accessCode,
        group,
        consent: st.consent || {},
        consentTranscripts: st.consentTranscripts,
        supporterPresent,
      });
    } catch (err) {
      // Don't leave a rejected code sitting in localStorage — see transport.js.
      st.update({ accessCode: '' });
      setError(friendlyStartError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!browserOk) {
    return (
      <Page
        title="Please switch to Chrome or Edge"
        lead="The talking part of this app only works properly in Google Chrome or Microsoft Edge. In other browsers it can’t show what you are saying as you say it, which would change what we are measuring."
      >
        <div style={card}>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            Please copy the link from your invitation email, open Chrome or Edge, and
            paste it there. Nothing you have done so far will be lost.
          </p>
        </div>
        <p style={{ marginTop: '1rem', color: 'var(--text2)' }}>
          We detected: <strong>{browser}</strong>.
        </p>
        <StopBar onStop={onStop} />
      </Page>
    );
  }

  return (
    <Page title="Let’s get set up" lead="Two codes from your invitation email, and a quick microphone check.">
      <div style={{ ...card, marginBottom: '.9rem' }}>
        <label style={{ display: 'block', fontSize: '1rem', marginBottom: '.5rem', color: 'var(--text)' }}>
          Your access code
        </label>
        <input
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          placeholder="from your invitation email"
          autoComplete="off"
          style={inputStyle}
        />
      </div>

      {group === 'plwd' && (
        <div style={{ ...card, marginBottom: '.9rem', borderColor: 'var(--primary)' }}>
          <p style={{ margin: '0 0 .8rem', fontSize: '1rem', lineHeight: 1.6 }}>
            A family member or support person needs to be with you for this session.
            Are they here now?
          </p>
          <Choice
            name="supporter"
            options={[
              { value: true, label: 'Yes, someone is here with me' },
              { value: false, label: 'No, I am on my own' },
            ]}
            value={supporterPresent}
            onChange={setSupporterPresent}
          />
          {supporterPresent === false && (
            <p style={{ marginTop: '.75rem', color: 'var(--amber)', lineHeight: 1.6 }}>
              Please come back when someone can sit with you. Thank you.
            </p>
          )}
        </div>
      )}

      <div style={{ ...card, marginBottom: '.9rem' }}>
        <p style={{ margin: '0 0 .8rem', fontSize: '1rem' }}>
          Microphone check — part of this study involves speaking.
        </p>
        {mic === 'ok' ? (
          <p style={{ margin: 0, color: 'var(--primary-d)', fontWeight: 600 }}>Microphone is working.</p>
        ) : (
          <>
            <Button variant="secondary" onClick={checkMic}>Check my microphone</Button>
            {mic === 'denied' && (
              <p style={{ marginTop: '.75rem', color: 'var(--amber)', lineHeight: 1.6 }}>
                The browser blocked the microphone. Please allow it when asked — you can
                usually change this from the padlock icon in the address bar.
              </p>
            )}
          </>
        )}
      </div>

      {/* Only for someone continuing an earlier session on a different device or
          a cleared browser. First-time participants are allocated a code by the
          server — asking everyone to invent one is what let two people collide on
          the same number and be silently merged into one session. */}
      <div style={{ ...card, marginBottom: '.9rem' }}>
        <button
          type="button"
          onClick={() => setResuming((v) => !v)}
          aria-expanded={resuming}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: 0,
            border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
            color: 'var(--text2)', fontSize: '1rem', minHeight: 44,
          }}
        >
          <span style={{ flex: 1 }}>I’ve done part of this before and have a participant code</span>
          <span>{resuming ? '▾' : '▸'}</span>
        </button>
        {resuming && (
          <div style={{ paddingTop: '.75rem' }}>
            <label style={{ display: 'block', fontSize: '1rem', marginBottom: '.5rem', color: 'var(--text)' }}>
              Your participant code <span style={{ color: 'var(--text2)' }}>(looks like P07)</span>
            </label>
            <input
              value={participantCode}
              onChange={(e) => setParticipantCode(e.target.value)}
              placeholder="P07"
              autoComplete="off"
              style={inputStyle}
            />
            <p style={{ margin: '.6rem 0 0', fontSize: '.92rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              Leave this blank unless you were given a code earlier — you’ll pick up
              where you left off.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--amber)', lineHeight: 1.6 }}>{error}</p>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        <Button
          onClick={start}
          disabled={
            busy || !accessCode.trim() || !GROUPS.includes(group)
            // A PLWD session cannot proceed without a support person present.
            || (group === 'plwd' && supporterPresent !== true)
          }
        >
          {busy ? 'Starting…' : 'Start the study'}
        </Button>
      </div>
      <StopBar onStop={onStop} />
    </Page>
  );
}

// The API's messages are accurate but written for a developer. A participant
// needs to know which of the two codes to look at, and that it is not their fault.
function friendlyStartError(err) {
  const msg = String(err?.message ?? '');
  if (/access code/i.test(msg)) {
    return 'That access code wasn’t recognised. Please check it against your '
      + 'invitation email — it’s the second of the two codes.';
  }
  if (/participant code/i.test(msg)) {
    return 'That participant code doesn’t look right. It should be the letter P '
      + 'followed by a number, like P07.';
  }
  if (/not configured/i.test(msg)) {
    return 'The study isn’t quite ready at our end. Please email the researcher '
      + 'and we’ll sort it out — nothing you did caused this.';
  }
  return 'We couldn’t start the session. Please check your internet connection '
    + 'and try again, or email the researcher if it keeps happening.';
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 52,
  padding: '.75rem 1rem',
  borderRadius: 12,
  border: 'var(--bw) solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: '1.05rem',
};
