// "How this answer was made": the facts behind one answer, under it, closed
// until asked for. What was searched for and found, what the emergency check
// said, how long it took and what it used. The content comes from
// lib/answerTrace.js; this is only its layout.
//
// A <details> element, so it opens with the keyboard and reads properly to a
// screen reader with no script of its own.
import React from 'react';
import {
  formatMs,
  formatSafety,
  formatTokens,
  formatUsd,
  searchOutcome,
} from '../lib/answerTrace.js';

const row = { display: 'flex', gap: '10px', alignItems: 'baseline' };
const term = { flex: '0 0 7.5em', color: 'var(--text2)', fontWeight: '600' };
const value = { flex: '1', minWidth: 0, margin: 0 };

function Row({ label, children }) {
  return (
    <div style={row}>
      <dt style={term}>{label}</dt>
      <dd style={value}>{children}</dd>
    </div>
  );
}

export function AnswerTrace({ trace }) {
  if (!trace) return null;
  const { search, safety, usage, timings } = trace;
  const outcome = search ? searchOutcome(search) : null;
  const timing = timings
    ? [
        timings.search != null && `search ${formatMs(timings.search)}`,
        timings.firstWords != null && `first words ${formatMs(timings.firstWords)}`,
        `finished ${formatMs(timings.total)}`,
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  return (
    <details
      style={{
        alignSelf: 'flex-start',
        maxWidth: '88%',
        fontSize: '.82rem',
        color: 'var(--text)',
        paddingLeft: '4px',
      }}
    >
      <summary style={{ cursor: 'pointer', color: 'var(--text2)', minHeight: '28px' }}>
        How this answer was made
      </summary>
      <dl
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          margin: '6px 0 2px',
          padding: '12px 14px',
          border: 'var(--bw) solid var(--border)',
          borderRadius: '12px',
          background: 'var(--surface)',
          lineHeight: '1.5',
        }}
      >
        {search && (
          <Row label="Searched for">
            “{search.query}”{search.ms != null && ` (${formatMs(search.ms)})`}
          </Row>
        )}
        {search && (
          <Row label="Found">
            {outcome ?? (
              <ol style={{ margin: 0, paddingLeft: '1.2em' }}>
                {search.passages.map((p) => (
                  <li key={p.id}>
                    {p.title}
                    {p.org && ` (${p.org})`}
                    {p.similarity != null && `, match ${p.similarity.toFixed(2)}`}
                    {p.cited != null && <strong>{`, cited as [${p.cited}]`}</strong>}
                  </li>
                ))}
              </ol>
            )}
          </Row>
        )}
        {safety && <Row label="Safety check">{formatSafety(safety)}</Row>}
        {timing && <Row label="Time">{timing}</Row>}
        {usage && <Row label="Tokens">{formatTokens(usage)}</Row>}
        {usage && (
          <Row label="Cost">
            {usage.costUsd == null
              ? 'No list price is held for this model.'
              : `About ${formatUsd(usage.costUsd)} at list prices, for writing the answer alone.`}
          </Row>
        )}
        <Row label="Model">{trace.model}</Row>
        <Row label="Pipeline">{trace.pipelineVersion}</Row>
        {trace.stopReason === 'max_tokens' && (
          <Row label="Note">The answer reached its length limit and may be cut short.</Row>
        )}
      </dl>
    </details>
  );
}
