// The study flow screen. Everything except the tasks themselves happens here;
// during a task the participant is in the real app with StudyTaskOverlay on top.
import React, { useEffect, useState } from 'react';
import { useStudy, detectBrowser, SUPPORTED_BROWSERS } from '../StudyContext.jsx';
import { armLabel, GROUPS, IDENTITY_WARNING } from '@core/study/studyConfig.mjs';
import { useSettings } from '../../state/SettingsContext.jsx';
import { useEffectiveAvatarProfile } from '../../avatar/effectiveProfile.js';
import { Page, Button, Choice, LikertItem, TextArea, SupportNumbers, Disclaimer, card } from '../ui.jsx';
import { navigate } from '../../state/router.js';
import { SUS_ITEMS, LIKERT_ITEMS, BACKGROUND, POST_TASK, DEBRIEF, PLWD_ITEMS, PLWD_DEBRIEF, SUPPORTER_DEBRIEF } from '../instruments.js';

function StopBar({ onStop }) {
  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: 'var(--bw) solid var(--border)' }}>
      <Button variant="quiet" onClick={onStop} style={{ padding: 0, minHeight: 44 }}>
        I need to stop
      </Button>
      <p style={{ fontSize: '.88rem', color: 'var(--text2)', margin: '.25rem 0 0' }}>
        You can stop at any time, for any reason. You don’t have to say why.
      </p>
    </div>
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
  if (step === 'consent') return <ConsentStep onNext={st.next} onStop={st.stop} />;
  if (step === 'setup') return <SetupStep onStop={st.stop} />;

  // ─── Background ───────────────────────────────────────────────────────────

  if (step === 'background') {
    const done = BACKGROUND.every((q) => answer(q.id) !== undefined || q.optional);
    return (
      <Page title="A few questions about you" lead="Every question can be skipped.">
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
        lead={`These ten questions are about ${armLabel(stage.arm, assistant).toLowerCase()}. There are no right answers — go with your first reaction.`}
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
      <div style={{ marginTop: '1.5rem' }}><Button onClick={onNext}>I’ve read this</Button></div>
      <StopBar onStop={onStop} />
      <Disclaimer />
    </Page>
  );
}

// Itemised consent. Items 1–6 are required; the transcript item is genuinely
// optional and declining it does not block participation
// (docs/study/ethics/consent-form.md).
const CONSENT_ITEMS = [
  { id: 'take_part', text: 'I agree to take part in this research.' },
  { id: 'voluntary', text: 'I understand that taking part is voluntary, and that I may stop at any time without giving a reason and without any disadvantage.' },
  { id: 'fictional', text: 'I understand that the situations are made up, and that I should not enter real names or anything that would identify me or anyone else.' },
  { id: 'not_advice', text: 'I understand that the app gives general information only, that it is not medical advice, that it is a research prototype which may be wrong, and that I should consult a health professional about any real decision.' },
  { id: 'collection', text: 'I agree to the collection of my questionnaire answers, the time I take on each task, the number of questions I ask, and technical information about my browser.' },
  { id: 'no_audio', text: 'I understand that no recording of my voice is kept, and that anything I say to the app is converted to text with only the text retained.' },
  { id: 'storage', text: 'I understand that my data is stored against a participant code, held securely for six years, then destroyed, and that I may request deletion within two weeks by quoting my code.' },
];

function ConsentStep({ onNext, onStop }) {
  const st = useStudy();
  const [ticks, setTicks] = useState({});
  const [transcripts, setTranscripts] = useState(null);
  const allTicked = CONSENT_ITEMS.every((i) => ticks[i.id]);
  const ready = allTicked && transcripts !== null;

  return (
    <Page title="Your consent" lead="Please tick each box to show you understand and agree.">
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
  const [accessCode, setAccessCode] = useState(st.accessCode || '');
  const [group, setGroup] = useState(st.group || 'caregiver');
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
          Your participant code <span style={{ color: 'var(--text2)' }}>(looks like P07)</span>
        </label>
        <input
          value={participantCode}
          onChange={(e) => setParticipantCode(e.target.value)}
          placeholder="P07"
          autoComplete="off"
          style={inputStyle}
        />
      </div>

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

      <div style={{ ...card, marginBottom: '.9rem' }}>
        <p style={{ margin: '0 0 .8rem', fontSize: '1rem' }}>Which best describes you?</p>
        <Choice
          name="group"
          options={[
            { value: 'caregiver', label: 'I care, or recently cared, for someone with dementia' },
            { value: 'worker', label: 'I work in dementia care or aged care' },
            { value: 'plwd', label: 'I have a diagnosis of early-stage dementia' },
            { value: 'pilot', label: 'I am helping test the study itself' },
          ]}
          value={group}
          onChange={setGroup}
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

      {error && (
        <p role="alert" style={{ color: 'var(--amber)', lineHeight: 1.6 }}>{error}</p>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        <Button
          onClick={start}
          disabled={
            busy || !participantCode.trim() || !accessCode.trim() || !GROUPS.includes(group)
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
