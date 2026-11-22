// The little Markdown an answer can carry. gpt-4o sometimes formats an answer
// with **bold** labels, a heading or a list (the "detailed" length rule in
// packages/core/rag/prompt.js asks for numbered steps), and the chat bubble used
// to show those markers literally. This reads the few constructs the model uses
// into blocks and inline runs, and strips them for speech. It is not a general
// Markdown parser: links, code, tables and HTML are not recognised, and anything
// it does not recognise stays plain text.

const HEADING = /^\s{0,3}#{1,6}\s+(.+)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.+)$/;
// A single "*" bullet needs a space after it, so "**Bold** text" is not a bullet.
const BULLET = /^\s*[-*•·]\s+(.+)$/;

/**
 * Text → blocks: { type: 'para', lines }, { type: 'heading', text },
 * { type: 'ul', items } and { type: 'ol', start, items }. Blank lines end a
 * paragraph or list; an indented line after a list item continues that item.
 */
export function parseBlocks(text) {
  const blocks = [];
  let para = null;
  let list = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      para = null;
      list = null;
    } else if ((m = line.match(HEADING))) {
      para = null;
      list = null;
      blocks.push({ type: 'heading', text: m[1] });
    } else if ((m = line.match(NUMBERED))) {
      para = null;
      if (list?.type !== 'ol') {
        list = { type: 'ol', start: Number(m[1]), items: [] };
        blocks.push(list);
      }
      list.items.push(m[2]);
    } else if ((m = line.match(BULLET))) {
      para = null;
      if (list?.type !== 'ul') {
        list = { type: 'ul', items: [] };
        blocks.push(list);
      }
      list.items.push(m[1]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      list = null;
      if (!para) {
        para = { type: 'para', lines: [] };
        blocks.push(para);
      }
      para.lines.push(line);
    }
  }
  return blocks;
}

const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;
const ITALIC = /(^|[^\w*])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![\w*])/g;

function italics(text, bold, out) {
  let last = 0;
  for (const m of text.matchAll(ITALIC)) {
    const start = m.index + m[1].length;
    if (start > last) out.push({ text: text.slice(last, start), bold, italic: false });
    out.push({ text: m[2], bold, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold, italic: false });
}

/**
 * One line → runs of { text, bold, italic }. A marker with no partner (half of
 * a pair still streaming in, say) is dropped rather than shown.
 */
export function parseInline(text) {
  const out = [];
  const s = String(text ?? '');
  let last = 0;
  for (const m of s.matchAll(BOLD)) {
    if (m.index > last) italics(s.slice(last, m.index), false, out);
    italics(m[1], true, out);
    last = m.index + m[0].length;
  }
  if (last < s.length) italics(s.slice(last), false, out);
  return out.map((r) => ({ ...r, text: r.text.replace(/\*\*/g, '') })).filter((r) => r.text);
}

/**
 * For speech and captions: drop emphasis and heading markers, which a voice
 * would either skip or read out. A "#" before a digit ("#1") is kept.
 */
export function stripMarkdownForSpeech(text) {
  return String(text ?? '')
    .replace(/\*+/g, '')
    .replace(/#+(?!\d)/g, '');
}
