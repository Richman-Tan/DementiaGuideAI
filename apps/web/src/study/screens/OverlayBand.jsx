// The task band's content, presentational only — no contexts, no measurement —
// so tests can render it directly (the default export of StudyTaskOverlay.jsx
// drags in the study and settings providers, which need a browser).
//
// Slimmed twice after feedback. First ("the task window is too big but the main
// window is too small"): the situation paragraph, read in full on the arm brief,
// moved behind a toggle. Then (Oct 2026: "the top third of the screen is
// redundant", and a tester who didn't know how long it would take or that
// "Show details" held more instructions): three tight rows — progress and title
// with the controls; the goal with the task buttons on the same line; the
// identity warning, small but always visible, as it is the instruction most
// likely to be forgotten mid-task (see studyConfig.mjs). The toggle now says
// what it holds: "Detailed instructions".
import React from 'react';
import { IDENTITY_WARNING } from '@core/study/studyConfig.mjs';

/** Text size cycles rather than opening a menu: one button, no nesting. */
export const nextTextScale = (v) => (v === 1 ? 1.25 : v === 1.25 ? 0.85 : 1);
export const textScaleLabel = (v) => (v === 1.25 ? 'Aa+' : v === 0.85 ? 'Aa−' : 'Aa');

export function OverlayBand({
  task, expanded, onToggle, textScale, onCycleText,
  onFound, onNotFound, confirmStop, onStopRequest, onStopConfirm, onStopCancel,
  progress = null, minutes = '',
}) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
      {/* Row 1: where you are, the task title, and the two small controls. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.78rem', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--primary-d)' }}>
          {progress ? `Task ${progress.n} of ${progress.total}` : 'Your task'}
          {minutes && <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none', color: 'var(--text2)' }}>{` · ${minutes}`}</span>}
        </strong>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{task.title}</span>
        <button
          type="button"
          onClick={onCycleText}
          aria-label="Text size"
          title="Text size"
          style={{ ...linkBtn, marginLeft: 'auto', minWidth: 44, fontWeight: 700 }}
        >
          {textScaleLabel(textScale)}
        </button>
        <button type="button" onClick={onToggle} aria-expanded={expanded} style={linkBtn}>
          {expanded ? 'Hide instructions' : 'Detailed instructions'}
        </button>
      </div>

      {expanded && (
        <p style={{ margin: '0', fontSize: '1rem', lineHeight: 1.55, color: 'var(--text)' }}>
          {task.situation}
        </p>
      )}

      {/* Row 2: the goal, with the buttons that end the task on the same line. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, flex: '1 1 18rem', fontSize: '1rem', lineHeight: 1.45, fontWeight: 600, color: 'var(--text)' }}>
          {task.goal}
        </p>
        <button type="button" onClick={onFound} style={primaryBtn}>
          I found my answer
        </button>
        <button type="button" onClick={onNotFound} style={secondaryBtn}>
          I couldn’t find it
        </button>
        <button type="button" onClick={onStopRequest} style={{ ...secondaryBtn, border: 'none', color: 'var(--text2)' }}>
          I need to stop
        </button>
      </div>

      {/* Row 3: the standing identity warning, small but always visible. */}
      <p style={{ margin: 0, fontSize: '.8rem', lineHeight: 1.4, color: 'var(--text2)' }}>
        {IDENTITY_WARNING}
      </p>

      {confirmStop && (
        <div
          role="alertdialog"
          aria-label="Stop the session"
          style={{
            marginTop: '.4rem', padding: '.9rem 1rem', borderRadius: 12,
            background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)',
          }}
        >
          <p style={{ margin: '0 0 .75rem', lineHeight: 1.6, color: 'var(--text)' }}>
            Stop the session? Nothing more will be recorded. You don’t have to give a reason.
          </p>
          <div style={{ display: 'flex', gap: '.6rem' }}>
            <button type="button" onClick={onStopConfirm} style={primaryBtn}>Yes, stop</button>
            <button type="button" onClick={onStopCancel} style={secondaryBtn}>
              Keep going
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtn = {
  minHeight: 40,
  padding: '0 .6rem',
  border: 'none',
  background: 'transparent',
  color: 'var(--primary-d)',
  cursor: 'pointer',
  fontSize: '.92rem',
  fontWeight: 600,
};

const primaryBtn = {
  minHeight: 44,
  padding: '0 1rem',
  borderRadius: 10,
  border: '1px solid var(--primary)',
  background: 'var(--primary)',
  color: '#fff',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
};

const secondaryBtn = {
  minHeight: 44,
  padding: '0 1rem',
  borderRadius: 10,
  border: 'var(--bw) solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
};
