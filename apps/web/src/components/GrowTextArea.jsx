// Auto-growing composer input: single line at rest, expands vertically with
// content up to maxHeight, then scrolls inside itself (never sideways).
// Enter sends, Shift+Enter inserts a newline. Callers style the shell via
// `style`; height is managed here and resets when the value is cleared.
import React, { useLayoutEffect, useRef } from 'react';

export function GrowTextArea({ value, onChange, onSubmit, onGrow, maxHeight = 120, style, ...rest }) {
  const el = useRef(null);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, maxHeight) + 'px';
    t.style.overflowY = t.scrollHeight > maxHeight ? 'auto' : 'hidden';
    if (onGrow) onGrow();
  }, [value, maxHeight, onGrow]);
  return (
    <textarea
      ref={el}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
      style={{ resize: 'none', overflowY: 'hidden', fontFamily: 'inherit', fontSize: '1rem', lineHeight: '1.5', color: 'var(--text)', boxSizing: 'border-box', ...style }}
      {...rest}
    />
  );
}
