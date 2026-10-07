// The band that sits above the app while a participant works on a task.
//
// It carries the task, the two buttons that bound the time-on-task measurement,
// and the stop control. Without it an unmoderated participant would have no way
// back and no way to signal that they were done — and there would be nothing to
// measure. The content itself lives in OverlayBand.jsx (presentational, tested);
// this file owns the state, the settings wiring, and the height machinery.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStudy } from '../StudyContext.jsx';
import { useSettings } from '../../state/SettingsContext.jsx';
import { OverlayBand, ExploreBand, nextTextScale } from './OverlayBand.jsx';
import { THINGS_TO_TRY } from '../instruments.js';
import { edivaUrl } from '../feedback.js';

export default function StudyTaskOverlay() {
  const st = useStudy();
  const { settings, setSetting } = useSettings();
  // Collapsed by default: the participant read the full situation on the arm
  // brief seconds ago, and every line here is subtracted from the chat window.
  const [expanded, setExpanded] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  // Feedback round: which confirmation is open, 'finish' | 'stop' | null.
  const [confirm, setConfirm] = useState(null);
  const ref = useRef(null);

  const exploring = Boolean(st?.exploring);
  const showing = Boolean(st?.active && st.step === 'task' && st.task) || exploring;
  // "Task n of N" across both arms, so a participant always knows how far along they are.
  const progress = showing && Array.isArray(st.sequence)
    ? {
        n: st.sequence.slice(0, st.stageIndex).reduce((k, s) => k + (s.tasks?.length || 0), 0) + st.taskIndex + 1,
        total: st.sequence.reduce((k, s) => k + (s.tasks?.length || 0), 0),
      }
    : null;

  // Publish the band's height as a custom property so the two full-viewport
  // screens (Home and Voice) can subtract it instead of being covered by it.
  // Measured rather than hard-coded: it changes with text scale and wrapping.
  //
  // The write below feeds back into the thing being measured, so it MUST be
  // idempotent. `apply` runs from a ResizeObserver watching this very band, and
  // it changes page layout — so any write that can alter the band's own height
  // closes a loop: taller band → more body padding → taller document → scrollbar
  // appears → narrower viewport → text rewraps → taller band → …
  //
  // That loop is not theoretical. It pegged the main thread hard enough that
  // keystrokes and paste were dropped and the tab stopped responding — during a
  // task, which is the one moment the participant cannot afford it. Two things
  // stop it: `scrollbar-gutter: stable` (styles/tokens.css) removes the width
  // change that drives the rewrap, and this guard makes a settled height cost
  // nothing.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!showing) {
      root.style.setProperty('--study-overlay-h', '0px');
      document.body.style.paddingTop = '';
      return undefined;
    }
    let lastH = null;
    const apply = () => {
      const h = ref.current?.offsetHeight || 0;
      // Unchanged height means nothing to publish. Returning here is what turns
      // a self-sustaining cycle into a single settling step.
      if (h === lastH) return;
      lastH = h;
      root.style.setProperty('--study-overlay-h', `${h}px`);
      document.body.style.paddingTop = `${h}px`;
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      root.style.setProperty('--study-overlay-h', '0px');
      document.body.style.paddingTop = '';
    };
  }, [showing, expanded, confirmStop, confirm]);

  useEffect(() => () => {
    document.documentElement.style.setProperty('--study-overlay-h', '0px');
    document.body.style.paddingTop = '';
  }, []);

  if (!showing) return null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={exploring ? 'Feedback session' : 'Your current task'}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Above the app shell and the voice screen (which is position:fixed at
        // z-index 50), below nothing.
        zIndex: 900,
        background: 'var(--surface)',
        borderBottom: '2px solid var(--primary)',
        boxShadow: '0 2px 12px rgba(28,48,58,.12)',
        padding: '.75rem 1rem',
      }}
    >
      {exploring ? (
        <ExploreBand
          items={THINGS_TO_TRY}
          tried={st.tried}
          edivaUrl={edivaUrl()}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          onTry={st.markTried}
          textScale={settings.textScale}
          onCycleText={() => setSetting('textScale', nextTextScale(settings.textScale))}
          confirm={confirm}
          onFinishRequest={() => setConfirm('finish')}
          onFinishConfirm={() => { setConfirm(null); setExpanded(false); st.endExplore(); }}
          onStopRequest={() => setConfirm('stop')}
          onStopConfirm={st.stop}
          onCancel={() => setConfirm(null)}
        />
      ) : (
        <OverlayBand
          task={st.task}
          progress={progress}
          minutes="about 35–45 min in total"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          textScale={settings.textScale}
          onCycleText={() => setSetting('textScale', nextTextScale(settings.textScale))}
          onFound={() => st.endTask('yes')}
          onNotFound={() => st.endTask('no')}
          confirmStop={confirmStop}
          onStopRequest={() => setConfirmStop(true)}
          onStopConfirm={st.stop}
          onStopCancel={() => setConfirmStop(false)}
        />
      )}
    </div>
  );
}
