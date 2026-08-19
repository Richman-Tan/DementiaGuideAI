// The band that sits above the app while a participant works on a task.
//
// It carries the task, the two buttons that bound the time-on-task measurement,
// and the stop control. Without it an unmoderated participant would have no way
// back and no way to signal that they were done — and there would be nothing to
// measure.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStudy } from '../StudyContext.jsx';
import { IDENTITY_WARNING } from '@core/study/studyConfig.mjs';

export default function StudyTaskOverlay() {
  const st = useStudy();
  const [expanded, setExpanded] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const ref = useRef(null);

  const showing = Boolean(st?.active && st.step === 'task' && st.task);

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
  }, [showing, expanded, confirmStop]);

  useEffect(() => () => {
    document.documentElement.style.setProperty('--study-overlay-h', '0px');
    document.body.style.paddingTop = '';
  }, []);

  if (!showing) return null;

  const { task } = st;

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Your current task"
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
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.82rem', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--primary-d)' }}>
            Your task
          </strong>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>{task.title}</span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              marginLeft: 'auto', minHeight: 44, padding: '0 .75rem', border: 'none',
              background: 'transparent', color: 'var(--primary-d)', cursor: 'pointer',
              fontSize: '.95rem', fontWeight: 600,
            }}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>

        {expanded && (
          <>
            <p style={{ margin: '.6rem 0 .4rem', fontSize: '1rem', lineHeight: 1.6, color: 'var(--text)' }}>
              {task.situation}
            </p>
            <p style={{ margin: '0 0 .5rem', fontSize: '1rem', lineHeight: 1.6, fontWeight: 600, color: 'var(--text)' }}>
              {task.goal}
            </p>
            <p style={{ margin: '0 0 .75rem', fontSize: '.85rem', lineHeight: 1.5, color: 'var(--text2)' }}>
              {IDENTITY_WARNING}
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => st.endTask('yes')} style={primaryBtn}>
            I found my answer
          </button>
          <button type="button" onClick={() => st.endTask('no')} style={secondaryBtn}>
            I couldn’t find it
          </button>
          <button
            type="button"
            onClick={() => setConfirmStop(true)}
            style={{ ...secondaryBtn, border: 'none', color: 'var(--text2)', marginLeft: 'auto' }}
          >
            I need to stop
          </button>
        </div>

        {confirmStop && (
          <div
            role="alertdialog"
            aria-label="Stop the session"
            style={{
              marginTop: '.75rem', padding: '.9rem 1rem', borderRadius: 12,
              background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)',
            }}
          >
            <p style={{ margin: '0 0 .75rem', lineHeight: 1.6, color: 'var(--text)' }}>
              Stop the session? Nothing more will be recorded. You don’t have to give a reason.
            </p>
            <div style={{ display: 'flex', gap: '.6rem' }}>
              <button type="button" onClick={st.stop} style={primaryBtn}>Yes, stop</button>
              <button type="button" onClick={() => setConfirmStop(false)} style={secondaryBtn}>
                Keep going
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtn = {
  minHeight: 48,
  padding: '0 1.15rem',
  borderRadius: 10,
  border: '1px solid var(--primary)',
  background: 'var(--primary)',
  color: '#fff',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
};

const secondaryBtn = {
  minHeight: 48,
  padding: '0 1.15rem',
  borderRadius: 10,
  border: 'var(--bw) solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
};
