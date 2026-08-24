// Shared presentational pieces for the study flow.
//
// Deliberately plain and large-targeted: participants are often older, tired, or
// unfamiliar with research software, and the accessibility requirements in
// docs/design-system.md apply here as much as to the product.
import React from 'react';

export const card = {
  background: 'var(--surface)',
  border: 'var(--bw) solid var(--border)',
  borderRadius: 16,
  boxShadow: 'var(--shadow)',
  padding: '1.5rem',
};

// Participant information sheets, rendered from docs/study/ethics/ by
// scripts/study/render-pis.mjs. Protocol §6 requires the sheet to be available
// on screen and downloadable, so these open in a new tab (print → Save as PDF)
// rather than replacing the session in progress.
export const PIS = {
  caregiver: { href: '/study/pis-caregiver.html', label: 'For family carers' },
  worker: { href: '/study/pis-careworker.html', label: 'For care and health workers' },
  plwd: { href: '/study/pis-plwd.html', label: 'For people living with dementia' },
  supporter: { href: '/study/pis-supporter.html', label: 'For support people' },
};
// A participant helping test the study reads the carer sheet: the pilot group is
// a rehearsal of that arm, and there is no separate approved sheet for it.
PIS.pilot = PIS.caregiver;

export function PisLink({ group = 'caregiver', children }) {
  const sheet = PIS[group] || PIS.caregiver;
  return (
    <a
      href={sheet.href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--primary-d)', fontWeight: 600, textDecoration: 'underline' }}
    >
      {children || sheet.label}
    </a>
  );
}

export function Page({ title, lead, children, footer }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '2rem 1rem 4rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {title && (
          <h1 style={{ fontSize: '1.55rem', lineHeight: 1.3, margin: '0 0 .5rem', color: 'var(--text)' }}>
            {title}
          </h1>
        )}
        {lead && (
          <p style={{ fontSize: '1.05rem', color: 'var(--text2)', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            {lead}
          </p>
        )}
        {children}
        {footer}
      </div>
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', disabled, style }) {
  const base = {
    minHeight: 52,
    padding: '0 1.5rem',
    borderRadius: 12,
    fontSize: '1.05rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: 'var(--bw) solid var(--border)',
    ...style,
  };
  const skin = variant === 'primary'
    ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
    : variant === 'quiet'
      ? { background: 'transparent', color: 'var(--text2)', borderColor: 'transparent' }
      : { background: 'var(--surface)', color: 'var(--text)' };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...base, ...skin }}>
      {children}
    </button>
  );
}

/** Labelled radio buttons rather than a slider: bigger targets, no ambiguity
 *  about the selected value (docs/study/instruments.md §8). */
export function Choice({ name, options, value, onChange, columns = 1 }) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      style={{ display: 'grid', gap: '.6rem', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
    >
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : o;
        const on = value === val;
        return (
          <button
            key={String(val)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(val)}
            style={{
              minHeight: 52,
              textAlign: 'left',
              padding: '.75rem 1rem',
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1.4,
              background: on ? 'var(--tint)' : 'var(--surface)',
              color: 'var(--text)',
              border: `${on ? 2 : 'var(--bw)'} solid ${on ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const LIKERT = [
  { value: 1, label: '1 — Strongly disagree' },
  { value: 2, label: '2 — Disagree' },
  { value: 3, label: '3 — Neither' },
  { value: 4, label: '4 — Agree' },
  { value: 5, label: '5 — Strongly agree' },
];

/** Scale direction never flips between screens (instruments.md §8). */
export function LikertItem({ id, text, value, onChange, scale = LIKERT }) {
  return (
    <div style={{ ...card, padding: '1.1rem 1.25rem', marginBottom: '.9rem' }}>
      <p style={{ margin: '0 0 .8rem', fontSize: '1.02rem', lineHeight: 1.5, color: 'var(--text)' }}>{text}</p>
      <Choice name={id} options={scale} value={value} onChange={onChange} />
    </div>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '.85rem 1rem',
        borderRadius: 12,
        border: 'var(--bw) solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: '1rem',
        lineHeight: 1.5,
        fontFamily: 'inherit',
        resize: 'vertical',
      }}
    />
  );
}

/** The support numbers, verified against official sources. Shown on the closing
 *  screen and whenever a participant stops
 *  (docs/study/ethics/risk-and-distress-protocol.md §2). */
export function SupportNumbers() {
  return (
    <div style={{ ...card, background: 'var(--amber-bg)', borderColor: 'var(--amber-bd)' }}>
      <h2 style={{ margin: '0 0 .6rem', fontSize: '1.1rem', color: 'var(--amber)' }}>
        If you would like to talk to someone
      </h2>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.9, color: 'var(--text)' }}>
        <li><strong>111</strong> — emergency</li>
        <li><strong>Healthline 0800 611 116</strong> — free 24/7 nurse advice</li>
        <li><strong>Alzheimers NZ 0800 004 001</strong> — dementia support and local services</li>
        <li><strong>1737</strong> — free call or text, any time</li>
      </ul>
    </div>
  );
}

export function Disclaimer() {
  return (
    <p style={{ fontSize: '.92rem', color: 'var(--text2)', lineHeight: 1.55, marginTop: '1.5rem' }}>
      DementiaGuide AI gives general information only. It is not medical advice, it
      is a research prototype, and it can be wrong. Please talk to a doctor, nurse or
      other health professional about any real decision.
    </p>
  );
}
