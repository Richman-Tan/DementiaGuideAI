import React from 'react';

// Typed content blocks for library articles. 'x' is a string for h/p/tip/warn
// and an array of strings for ul/ol. Unknown types render nothing.
export const BLOCK_TYPES = ['h', 'p', 'ul', 'ol', 'tip', 'warn'];

const listStyle = { margin: '0 0 16px', paddingLeft: '26px', lineHeight: '1.7' };
const itemStyle = { marginBottom: '7px', textWrap: 'pretty' };

export default function ArticleBody({ blocks }) {
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i}>
          {b.t === 'h' && <h2 style={{ fontSize: '1.35rem', margin: '30px 0 10px' }}>{b.x}</h2>}
          {b.t === 'p' && <p style={{ margin: '0 0 16px', lineHeight: '1.7', textWrap: 'pretty' }}>{b.x}</p>}
          {b.t === 'ul' && <ul style={listStyle}>{b.x.map((li, j) => <li key={j} style={itemStyle}>{li}</li>)}</ul>}
          {b.t === 'ol' && <ol style={listStyle}>{b.x.map((li, j) => <li key={j} style={itemStyle}>{li}</li>)}</ol>}
          {b.t === 'tip' && <div style={{ background: 'var(--tint)', border: 'var(--bw) solid var(--border)', borderRadius: '14px', padding: '16px 18px', margin: '0 0 16px', lineHeight: '1.65' }}>{b.x}</div>}
          {b.t === 'warn' && <div style={{ background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderLeft: '4px solid var(--amber)', borderRadius: '14px', padding: '16px 18px', margin: '0 0 16px', lineHeight: '1.65' }}>{b.x}</div>}
        </div>
      ))}
    </>
  );
}
