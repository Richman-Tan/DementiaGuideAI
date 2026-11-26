// An answer as plain text, for when it leaves the screen it is drawn on: the
// clipboard. And the short things a screen reader is told about a turn.
//
// On screen an answer is the model's Markdown, rendered (components/
// AnswerText.jsx). Pasted or read aloud as written it would carry the markers:
// "asterisk asterisk". This is the same text with the markers gone and the
// structure kept: paragraphs, and lists as lists.
import { parseBlocks, parseInline } from './markdown.js';

const inline = (text) =>
  parseInline(text)
    .map((run) => run.text)
    .join('');

/**
 * @param {string} text  The answer as stored.
 * @param {object} [options]
 * @param {boolean} [options.citations]  Keep the [1] markers. They mean something
 *   beside a list of sources, and are noise without one.
 */
export function plainAnswer(text, { citations = true } = {}) {
  const plain = parseBlocks(text)
    .map((block) => {
      if (block.type === 'heading') return inline(block.text);
      if (block.type === 'ul') return block.items.map((item) => `- ${inline(item)}`).join('\n');
      if (block.type === 'ol') {
        return block.items.map((item, i) => `${block.start + i}. ${inline(item)}`).join('\n');
      }
      return block.lines.map(inline).join('\n');
    })
    .join('\n\n');
  return citations ? plain : plain.replace(/[ \t]*\[\d+\]/g, '');
}

/**
 * What "Copy" puts on the clipboard: the answer, the sources its markers refer
 * to, and the line that goes with every answer. Someone pasting this into a
 * message to their family should not have to add where it came from or what it
 * is.
 */
export function answerForCopy(message) {
  const sources = (message.citations || []).map((source, i) => {
    const parts = [source.title, source.org, source.url].filter(Boolean);
    return `[${source.num ?? i + 1}] ${parts.join(' — ')}`;
  });
  return [
    plainAnswer(message.text, { citations: sources.length > 0 }),
    ...(sources.length ? [`Sources:\n${sources.join('\n')}`] : []),
    'From DementiaGuide AI. General information only — not medical advice.',
  ].join('\n\n');
}

/**
 * What a screen reader is told that is not on screen as words. A sighted
 * reader sees the dots while an answer is on its way, and sees it stop; this
 * says so. The answer itself is read from the conversation log when it joins
 * it, and an error from where it is shown.
 *
 * @param {{ kind: 'writing' | 'stopped' } | null} notice
 * @param {string} who  The guide's name.
 */
export function announcement(notice, who) {
  if (!notice) return '';
  return notice.kind === 'writing'
    ? `${who} is writing an answer.`
    : `Stopped. ${who} did not finish the answer.`;
}
