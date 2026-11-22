// An answer as the reader should see it: paragraphs, headings, lists, bold and
// italic from the model's Markdown (src/lib/markdown.js), with the [n] citation
// badges of CitationText inside each run. Without citations it is the same
// formatting with plain text.
import React from 'react';
import { CitationText } from './CitationText.jsx';
import { parseBlocks, parseInline } from '../lib/markdown.js';

function Inline({ text, citations, onCite }) {
  return parseInline(text).map((r, i) => {
    let node = <CitationText text={r.text} citations={citations} onCite={onCite} />;
    if (r.italic) node = <em>{node}</em>;
    if (r.bold) node = <strong>{node}</strong>;
    return <React.Fragment key={i}>{node}</React.Fragment>;
  });
}

const GAP = '.75em';

export function AnswerText({ text, citations, onCite }) {
  const blocks = parseBlocks(text);
  return blocks.map((b, i) => {
    const margin = `0 0 ${i < blocks.length - 1 ? GAP : '0'}`;
    const inline = (t) => <Inline text={t} citations={citations} onCite={onCite} />;
    if (b.type === 'heading') {
      return (
        <p key={i} style={{ margin, fontWeight: '700' }}>
          {inline(b.text)}
        </p>
      );
    }
    if (b.type === 'ul' || b.type === 'ol') {
      const List = b.type;
      return (
        <List
          key={i}
          start={b.type === 'ol' ? b.start : undefined}
          style={{ margin, paddingLeft: '1.5em' }}
        >
          {b.items.map((item, j) => (
            <li key={j} style={{ margin: '.25em 0' }}>
              {inline(item)}
            </li>
          ))}
        </List>
      );
    }
    return (
      <p key={i} style={{ margin }}>
        {b.lines.map((line, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {inline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}
