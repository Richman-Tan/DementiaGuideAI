// An answer can come in two parts: a short lead that is worth saying aloud, and
// the detail that is better read. The model separates them with a line holding
// only SECTION_DELIMITER. This module splits a streamed answer on that line, so
// the avatar can speak the lead while the whole answer fills the transcript.
//
// If the model never writes the delimiter, the whole answer is the lead.
import type { Section } from './types.ts';

export const SECTION_DELIMITER = '---detail---';

export interface SectionPiece {
  section: Section;
  text: string;
}

const isDelimiterLine = (line: string) => line.trim().toLowerCase() === SECTION_DELIMITER;

// A line that is still arriving and could yet turn out to be the delimiter.
const couldBecomeDelimiter = (partial: string) => {
  const t = partial.trim().toLowerCase();
  return t.length > 0 && SECTION_DELIMITER.startsWith(t);
};

/**
 * Splits a stream of text into lead and detail pieces. Text is released as soon
 * as it cannot be part of the delimiter line; only a line that might still
 * become the delimiter is held back.
 */
export function createSectionSplitter() {
  let section: Section = 'lead';
  let pending = ''; // the unfinished last line, when it could still be the delimiter
  let detailStarted = false;

  const emit = (out: SectionPiece[], text: string) => {
    if (section === 'detail' && !detailStarted) {
      text = text.replace(/^\n+/, ''); // the blank lines that followed the delimiter
      if (!text) return;
      detailStarted = true;
    }
    if (text) out.push({ section, text });
  };

  const consume = (out: SectionPiece[], text: string, end: boolean) => {
    if (section === 'detail') {
      emit(out, text);
      return;
    }
    const lines = text.split('\n');
    const last = lines.pop() as string; // text after the final newline (may be empty)
    let ready = '';
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] as string;
      if (isDelimiterLine(line)) {
        emit(out, ready.replace(/\n+$/, '')); // the blank lines that led up to it
        section = 'detail';
        const rest = [...lines.slice(i + 1), last].join('\n');
        consume(out, rest, end);
        return;
      }
      ready += `${line}\n`;
    }
    if (end && isDelimiterLine(last)) {
      emit(out, ready.replace(/\n+$/, ''));
      section = 'detail';
      return;
    }
    if (!end && couldBecomeDelimiter(last)) {
      // Hold the newlines before it too: if it is the delimiter, they go with it.
      const held = ready.match(/\n+$/)?.[0] ?? '';
      emit(out, ready.slice(0, ready.length - held.length));
      pending = held + last;
      return;
    }
    emit(out, ready + last);
  };

  return {
    write(text: string): SectionPiece[] {
      const out: SectionPiece[] = [];
      const all = pending + text;
      pending = '';
      consume(out, all, false);
      return out;
    },
    /** The stream has ended: release anything still held back. */
    flush(): SectionPiece[] {
      const out: SectionPiece[] = [];
      const all = pending;
      pending = '';
      if (all) consume(out, all, true);
      return out;
    },
  };
}

/** The same split over a complete answer. */
export function splitSections(text: string): { lead: string; detail: string } {
  const splitter = createSectionSplitter();
  const pieces = [...splitter.write(text), ...splitter.flush()];
  const join = (section: Section) =>
    pieces
      .filter((p) => p.section === section)
      .map((p) => p.text)
      .join('');
  return { lead: join('lead').trim(), detail: join('detail').trim() };
}
