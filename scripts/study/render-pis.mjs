#!/usr/bin/env node
// Render the participant information sheets to static HTML for the study app.
//
// Protocol §6 promises participants the information sheet "on screen and
// downloadable"; the study's info step only summarised it. These pages are what
// the consent screens link to. Print-to-PDF is the download route, so the
// template is styled for paper as well as screen.
//
// Placeholders ([...], [UAHPEC #]) are rendered verbatim on purpose — filling
// them is the supervisor's step, and a sheet that silently hid its own gaps
// would be worse than one that shows them. Re-run this after they are filled.
//
//   node scripts/study/render-pis.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'docs', 'study', 'ethics');
const OUT = join(ROOT, 'apps', 'web', 'public', 'study');

const SHEETS = [
  ['participant-information-sheet-caregiver.md', 'pis-caregiver.html', 'Information Sheet — Family Carers'],
  ['participant-information-sheet-careworker.md', 'pis-careworker.html', 'Information Sheet — Care and Health Workers'],
  ['participant-information-sheet-plwd.md', 'pis-plwd.html', 'Information Sheet — Taking Part'],
  ['participant-information-sheet-supporter.md', 'pis-supporter.html', 'Information Sheet — Support People'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline: **bold**, *italic*, `code`, [text](url). Applied after escaping.
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');

// Block-level markdown limited to what these four documents actually use:
// headings, paragraphs, bullet lists, ordered lists, blockquotes and rules.
// The sources are hard-wrapped at ~85 columns, so consecutive text lines are
// buffered and joined — one <p> per source line would shred every sentence.
function toHtml(md) {
  const out = [];
  let list = null; // 'ul' | 'ol'
  let quote = false;
  let buf = []; // pending text lines for the current paragraph or list item
  let bufKind = null; // 'p' | 'li'

  const flush = () => {
    if (!buf.length) return;
    // Wrapped lines join with a space, but a continuation line that starts its
    // own bold label is a separate line in intent (the "Project title: /
    // Researcher: / Supervisor:" headers), so keep the break.
    const html = buf
      .map((l, i) => (i && /^\*\*/.test(l) ? `<br />${inline(l)}` : inline(l)))
      .join(' ');
    out.push(bufKind === 'li' ? `<li>${html}</li>` : `<p>${html}</p>`);
    buf = [];
    bufKind = null;
  };
  const closeList = () => { flush(); if (list) { out.push(`</${list}>`); list = null; } };
  const closeQuote = () => { flush(); if (quote) { out.push('</blockquote>'); quote = false; } };

  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) { flush(); if (!list) closeQuote(); continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList(); closeQuote();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) { closeList(); closeQuote(); out.push('<hr />'); continue; }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      if (list) closeList();
      if (!quote) { flush(); out.push('<blockquote>'); quote = true; }
      buf.push(quoted[1].trim());
      bufKind = 'p';
      continue;
    }
    if (quote) closeQuote();

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      buf.push(bullet[1].trim());
      bufKind = 'li';
      continue;
    }

    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flush();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      buf.push(numbered[1].trim());
      bufKind = 'li';
      continue;
    }

    // A wrapped continuation of whatever block is open.
    buf.push(line.trim());
    if (!bufKind) bufKind = 'p';
  }

  closeList();
  closeQuote();
  return out.join('\n');
}

const page = (title, body) => `<!doctype html>
<html lang="en-NZ">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · DementiaGuide AI study</title>
<style>
  :root { color-scheme: light; }
  body { max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; background: #fff; color: #1c1b1a;
         font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  h1 { font-size: 1.7rem; line-height: 1.25; margin: 0 0 .4rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 .6rem; }
  h3 { font-size: 1.05rem; margin: 1.5rem 0 .5rem; }
  p, li { text-wrap: pretty; }
  ul, ol { padding-left: 1.35rem; }
  li { margin-bottom: .4rem; }
  hr { border: none; border-top: 1px solid #e0dcd6; margin: 2rem 0; }
  blockquote { margin: 1.25rem 0; padding: .75rem 1rem; background: #f6f3ee;
               border-left: 4px solid #c9c2b6; border-radius: 8px; }
  blockquote p { margin: .3rem 0; font-size: .95rem; color: #4a453e; }
  code { background: #f3f0ea; padding: .1em .35em; border-radius: 4px; font-size: .92em; }
  a { color: #1c5f7a; }
  .save { margin: 0 0 1.75rem; padding: .75rem 1rem; background: #eef4f7; border: 1px solid #cfe0e8;
          border-radius: 10px; font-size: .95rem; }
  @media print { .save { display: none; } body { padding: 0; font-size: 12pt; } }
</style>
</head>
<body>
<p class="save">To keep a copy, use your browser's Print option and choose “Save as PDF”.</p>
${body}
</body>
</html>
`;

mkdirSync(OUT, { recursive: true });
for (const [src, dest, title] of SHEETS) {
  const md = readFileSync(join(SRC, src), 'utf8');
  writeFileSync(join(OUT, dest), page(title, toHtml(md)));
  console.log(`${src} → apps/web/public/study/${dest}`);
}
