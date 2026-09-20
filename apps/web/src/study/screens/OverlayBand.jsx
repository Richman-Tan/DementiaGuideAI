// The task band's content, presentational only — no contexts, no measurement —
// so tests can render it directly (the default export of StudyTaskOverlay.jsx
// drags in the study and settings providers, which need a browser).
//
// Slimmed after pilot feedback ("the task window is too big but the main window
// is too small"): the always-visible band is the goal line, the identity
// warning, and the buttons. The situation paragraph — shown in full on the arm
// brief the participant just left — sits behind "Show details". The warning
// stays visible pending the clinician's call on moving it too: it is the
// instruction most likely to be forgotten mid-task (see studyConfig.mjs).
import React from 'react';
import { IDENTITY_WARNING } from '@core/study/studyConfig.mjs';

/** Text size cycles rather than opening a menu: one button, no nesting. */
export const nextTextScale = (v) => (v === 1 ? 1.25 : v === 1.25 ? 0.85 : 1);
export const textScaleLabel = (v) => (v === 1.25 ? 'Aa+' : v === 0.85 ? 'Aa−' : 'Aa');

export function OverlayBand({
  task, expanded, onToggle, textScale, onCycleText,
  onFound, onNotFound, confirmStop, onStopRequest, onStopConfirm, onStopCancel,
}) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.82rem', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--primary-d)' }}>
          Your task
        </strong>
        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>{task.title}</span>
        <button
          type="button"
          onClick={onCycleText}
          aria-label="Text size"
          title="Text size"
          style={{
            marginLeft: 'auto', minHeight: 44, minWidth: 44, padding: '0 .5rem', border: 'none',
            background: 'transparent', color: 'var(--primary-d)', cursor: 'pointer',
            fontSize: '.95rem', fontWeight: 700,
          }}
        >
          {textScaleLabel(textScale)}
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            minHeight: 44, padding: '0 .75rem', border: 'none',
            background: 'transparent', color: 'var(--primary-d)', cursor: 'pointer',
            fontSize: '.95rem', fontWeight: 600,
          }}
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {expanded && (
        <p style={{ margin: '.6rem 0 .4rem', fontSize: '1rem', lineHeight: 1.6, color: 'var(--text)' }}>
          {task.situation}
        </p>
      )}
      <p style={{ margin: expanded ? '0 0 .5rem' : '.5rem 0 .5rem', fontSize: '1rem', lineHeight: 1.6, fontWeight: 600, color: 'var(--text)' }}>
        {task.goal}
      </p>
      <p style={{ margin: '0 0 .75rem', fontSize: '.85rem', lineHeight: 1.5, color: 'var(--text2)' }}>
        {IDENTITY_WARNING}
      </p>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={onFound} style={primaryBtn}>
          I found my answer
        </button>
        <button type="button" onClick={onNotFound} style={secondaryBtn}>
          I couldn’t find it
        </button>
        <button
          type="button"
          onClick={onStopRequest}
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
