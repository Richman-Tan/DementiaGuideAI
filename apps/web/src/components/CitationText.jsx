// Web twin of mobile's inline citation renderer (ChatScreen.js CitationText):
// splits "…try a calm routine [1][2]." into text runs and tappable [n] badges
// that hand the matching citation to onCite. Real-mode sources carry an
// explicit `num`; mock-mode citations are positional ([n] → citations[n-1]).
// A marker with no matching citation stays literal text rather than becoming
// a dead badge; with no citations at all the text passes through untouched.
import React from 'react';

export function CitationText({ text, citations, onCite }) {
  if (!text || !citations || citations.length === 0) return text || null;
  const byNum = new Map(citations.map((c, i) => [c.num ?? i + 1, c]));
  const parts = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const c = byNum.get(parseInt(m[1], 10));
    if (!c) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ num: parseInt(m[1], 10), c });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      <React.Fragment key={i}>{p}</React.Fragment>
    ) : (
      <button key={i} onClick={() => onCite(p.c)} aria-label={`Open source ${p.num}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', height: '20px', padding: '0 5px', margin: '0 1px', borderRadius: '999px', border: 'none', background: 'var(--tint)', color: 'var(--primary-d)', fontSize: '.78rem', fontWeight: '700', cursor: 'pointer', verticalAlign: 'text-bottom' }} className="hv7">{p.num}</button>
    )
  );
}
