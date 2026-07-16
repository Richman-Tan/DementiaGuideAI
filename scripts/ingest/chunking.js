// Pure chunking + hashing for the ingestion pipeline. CommonJS so Jest and the
// .mjs runner share one implementation. No network, no filesystem.
//
// Strategy (docs/rag-industry-research.md §4): section-aware first — split on
// headings so retrieval units align with topic boundaries (the iSupport
// material is heavily structured) — then a word-window fallback (500 words,
// 50-word overlap, paragraph-preferred breaks) inside oversized sections.
// Section headings are carried into chunk TITLES (which are embedded via
// `${title}. ${content}`), never spliced into the source content itself.

const { createHash } = require('node:crypto');

const CHUNK_WORDS = 500;
const OVERLAP_WORDS = 50;
const MIN_CHUNK_WORDS = 40;
// Sections smaller than this are merged with following sections before
// windowing — interactive/workbook-style documents (like the WHO iSupport
// manual) contain many short heading-led fragments that would otherwise
// become useless 5-word chunks.
const MIN_SECTION_WORDS = 100;

// Normalise whitespace without altering wording.
function normalise(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

// A line is heading-like if it is short, has no terminal punctuation, and is
// either a markdown heading, a numbered section ("3.", "2.1", "Module 4:"),
// or an ALL-CAPS line.
function isHeading(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/^(module|lesson|unit|section|chapter|part)\s+\d+\b/i.test(t) && !/[.!?]$/.test(t)) return true;
  if (/^\d+(\.\d+)*[.)]?\s+\S/.test(t) && !/[.!?]$/.test(t) && t.split(' ').length <= 12) return true;
  if (t === t.toUpperCase() && /[A-Z]{3}/.test(t) && t.split(' ').length <= 10) return true;
  return false;
}

function headingText(line) {
  return line.trim().replace(/^#{1,6}\s+/, '').replace(/\s+$/, '');
}

// Split a document into sections at heading lines. Text before the first
// heading becomes a section with heading null.
function splitIntoSections(text) {
  const lines = normalise(text).split('\n');
  const sections = [];
  let heading = null;
  let buf = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ heading, text: body });
    buf = [];
  };
  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      heading = headingText(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  // A heading with no body contributes nothing.
  return sections;
}

// Word-window split of one section's text: paragraph-preferred break points,
// CHUNK_WORDS budget, OVERLAP_WORDS carried between windows, short tails
// merged into the previous chunk.
function windowSplit(text, {
  chunkWords = CHUNK_WORDS,
  overlapWords = OVERLAP_WORDS,
  minChunkWords = MIN_CHUNK_WORDS,
} = {}) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  const chunks = [];
  let current = [];
  let wordCount = 0;

  const pushCurrent = () => {
    const body = current.join(' ').trim();
    if (!body) return;
    if (body.split(' ').length >= minChunkWords || chunks.length === 0) {
      chunks.push(body);
    } else {
      chunks[chunks.length - 1] += ' ' + body;
    }
  };

  for (const para of paragraphs) {
    const words = para.split(' ');
    if (words.length > chunkWords) {
      // Oversized single paragraph (common in PDF extraction): flush what we
      // have, then window the paragraph directly at word boundaries. The last
      // window stays open so following paragraphs can attach to it.
      pushCurrent();
      const step = chunkWords - overlapWords;
      const pieces = [];
      for (let i = 0; i < words.length; i += step) {
        pieces.push(words.slice(i, i + chunkWords).join(' '));
        if (i + chunkWords >= words.length) break;
      }
      const last = pieces.pop();
      chunks.push(...pieces);
      current = [last];
      wordCount = last.split(' ').length;
    } else if (wordCount + words.length > chunkWords && wordCount > 0) {
      pushCurrent();
      // NB: slice(-0) === slice(0), so guard the zero-overlap case explicitly.
      const overlap = overlapWords > 0 ? current.join(' ').split(' ').slice(-overlapWords) : [];
      current = overlap.length ? [overlap.join(' '), para] : [para];
      wordCount = overlap.length + words.length;
    } else {
      current.push(para);
      wordCount += words.length;
    }
  }
  pushCurrent();
  return chunks;
}

// sha256 of the normalised title+content — the idempotency key. Any change to
// either re-embeds the chunk; identical content is skipped on re-ingestion.
function contentHash(title, content) {
  return createHash('sha256').update(`${normalise(title)}\n${normalise(content)}`).digest('hex');
}

// Merge undersized sections forward so every windowed unit has enough words
// to be a useful retrieval target. The merged group keeps the FIRST heading
// (the one that introduced the material).
function mergeSmallSections(sections, minWords = MIN_SECTION_WORDS) {
  const merged = [];
  let acc = null;
  for (const s of sections) {
    if (!acc) {
      acc = { heading: s.heading, text: s.text };
    } else {
      // Keep the first NON-NULL heading: a tiny preamble that merges into the
      // first real section shouldn't erase that section's label.
      acc.heading = acc.heading ?? s.heading;
      acc.text += `\n\n${s.text}`;
    }
    if (acc.text.split(/\s+/).length >= minWords) {
      merged.push(acc);
      acc = null;
    }
  }
  if (acc) {
    // Undersized trailing group: fold into the last merged section.
    if (merged.length > 0) merged[merged.length - 1].text += `\n\n${acc.text}`;
    else merged.push(acc);
  }
  return merged;
}

// Chunk a whole document. Returns [{ id, title, content, section, contentHash }].
// Chunk ids are content-addressed (`<idBase>_<hash8>`): stable under section
// reordering and insertions, and duplicate passages collapse to one id.
function chunkDocument(text, { idBase, sourceTitle, options = {} }) {
  const sections = mergeSmallSections(splitIntoSections(text), options.minSectionWords);
  const out = [];
  const seen = new Set();
  for (const section of sections) {
    const pieces = windowSplit(section.text, options);
    pieces.forEach((content, i) => {
      const sectionLabel = section.heading ? ` — ${section.heading}` : '';
      const partLabel = pieces.length > 1 ? ` (Part ${i + 1})` : '';
      const title = `${sourceTitle}${sectionLabel}${partLabel}`;
      const hash = contentHash(title, content);
      const id = `${idBase}_${hash.slice(0, 8)}`;
      if (seen.has(id)) return; // exact duplicate passage
      seen.add(id);
      out.push({ id, title, content, section: section.heading ?? null, contentHash: hash });
    });
  }
  return out;
}

module.exports = {
  CHUNK_WORDS,
  OVERLAP_WORDS,
  MIN_CHUNK_WORDS,
  MIN_SECTION_WORDS,
  normalise,
  isHeading,
  splitIntoSections,
  mergeSmallSections,
  windowSplit,
  contentHash,
  chunkDocument,
};
