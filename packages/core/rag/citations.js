// Structured citation extraction. The model cites passages inline as [S1],
// [S2]… (matching the [S#] headers buildUserContent gives each passage).
// extractCitations() validates every marker against the passages actually
// supplied, renumbers used ones to contiguous [1]…[n] (the format the
// ChatScreen CitationText UI renders as tappable badges), and STRIPS markers
// that don't correspond to any supplied passage — a hallucinated citation must
// never render as a real source. No platform imports (see ragConfig.js header).

const EXCERPT_CHARS = 200;

// Matches [S1], [ S2 ], [S1, S3], [S1][S2] single tokens handled per-bracket.
const MARKER_RE = /\[\s*S(\d+)(?:\s*,\s*S(\d+))*\s*\]/g;

function excerptOf(chunk) {
  const text = (chunk.content || '').trim();
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…` : text;
}

// rawText: model output containing [S#] markers.
// chunks:  the passages supplied to the model, in [S1..Sn] order.
// Returns { text, sources } where text has markers rewritten to [1]…[n] and
// sources = [{ num, id, title, org, url, excerpt }] in first-use order.
function extractCitations(rawText, chunks = []) {
  const supplied = chunks.length;
  const numByS = new Map(); // S-index (1-based) → renumbered citation number
  const sources = [];

  const text = rawText
    .replace(MARKER_RE, (match) => {
      // A bracket may contain several refs: [S1, S3]
      const sIndexes = [...match.matchAll(/S(\d+)/g)].map((m) => parseInt(m[1], 10));
      const nums = [];
      for (const s of sIndexes) {
        if (s < 1 || s > supplied) continue; // hallucinated marker — drop
        if (!numByS.has(s)) {
          const chunk = chunks[s - 1];
          const num = sources.length + 1;
          numByS.set(s, num);
          sources.push({
            num,
            id: chunk.id,
            // display_title is the caregiver-facing plain-language title
            // (2026-09-16_display_title.sql); `title` itself stays technical
            // because it also feeds the embedding.
            title: chunk.display_title ?? chunk.title,
            org: chunk.source_org ?? null,
            url: chunk.source_url ?? null,
            excerpt: excerptOf(chunk),
          });
        }
        nums.push(numByS.get(s));
      }
      return nums.length ? nums.map((n) => `[${n}]`).join('') : '';
    })
    // Collapse doubled spaces left by stripped markers, but keep newlines.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;!?])/g, '$1')
    .trim();

  return { text, sources };
}

// Streaming-safe marker stripper: text shown or spoken while the answer is
// still arriving must never contain "[S1]". Feed each streamed chunk through
// write(); it holds back any text that could be the start of a marker until it
// can be resolved. flush() releases whatever remains at end of stream.
//
// Removing a marker leaves the space that stood in front of it, so the stream
// would read "calm ." where the final answer reads "calm.". To match the final
// answer, whitespace at the end of each emission is held until the next text
// arrives, and dropped if that text starts with punctuation.
function createMarkerStripper() {
  let buf = '';
  let heldSpace = '';
  const PARTIAL_TAIL = /\[[^\]]*$/; // an unclosed '[' at the end of the buffer

  const clean = (s, end) => {
    let out = (heldSpace + s.replace(MARKER_RE, ''))
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([.,;!?])/g, '$1');
    heldSpace = '';
    if (!end) {
      const tail = out.match(/[ \t]+$/);
      if (tail) {
        heldSpace = tail[0];
        out = out.slice(0, -tail[0].length);
      }
    }
    return out;
  };

  return {
    write(chunk) {
      buf += chunk;
      const partial = buf.match(PARTIAL_TAIL);
      let emit;
      if (partial) {
        emit = buf.slice(0, partial.index);
        buf = buf.slice(partial.index);
      } else {
        emit = buf;
        buf = '';
      }
      return clean(emit, false);
    },
    flush() {
      // An unclosed marker at end of stream ("… [S2") is clearly a citation
      // fragment — drop it rather than speak it. Ordinary bracket text stays.
      const out = clean(buf.replace(/\[\s*S\d[\d\s,S]*$/, ''), true);
      buf = '';
      return out;
    },
  };
}

export { extractCitations, createMarkerStripper, MARKER_RE };
