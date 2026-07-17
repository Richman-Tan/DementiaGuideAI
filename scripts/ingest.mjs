/**
 * =============================================================================
 * INGEST SCRIPT — Add knowledge base content from PDFs or URLs
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Extracts text from a local PDF file or a public URL, splits it into chunks,
 * generates embeddings via OpenAI, and upserts them into the Supabase
 * knowledge_chunks table — exactly the same format as the existing chunks.
 *
 * -----------------------------------------------------------------------------
 * USAGE
 * -----------------------------------------------------------------------------
 *
 *   # Ingest a PDF file
 *   SUPABASE_URL=https://jxfzuzgwaomvpvobcyri.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   OPENAI_API_KEY=sk-... \
 *   node scripts/ingest.mjs \
 *     --source "/path/to/document.pdf" \
 *     --category caregiving \
 *     --org "Dementia Australia" \
 *     --url "https://dementia.org.au/source-page"
 *
 *   # Ingest a public URL
 *   SUPABASE_URL=https://jxfzuzgwaomvpvobcyri.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   OPENAI_API_KEY=sk-... \
 *   node scripts/ingest.mjs \
 *     --source "https://www.dementia.org.au/some-article" \
 *     --category clinical \
 *     --org "Dementia Australia"
 *
 * -----------------------------------------------------------------------------
 * ARGUMENTS
 * -----------------------------------------------------------------------------
 *
 *   --source    (required) Local path to a PDF OR a public https:// URL
 *   --category  (required) One of the following slugs:
 *                          caregiving | clinical | communication |
 *                          prevention | best-practices | home-safety | well-being
 *   --org       (required) Name of the source organisation (e.g. "NHS UK")
 *   --url       (optional) Canonical URL to attribute as source_url.
 *                          Defaults to --source if source is a URL.
 *   --prefix    (optional) ID prefix for generated chunks (default: derived from source name)
 *   --chunking  (optional) generic | manual (default: generic)
 *   --country   (optional) Source jurisdiction/country metadata (e.g. NZ, global)
 *   --source-version (optional) Source variant/version label (e.g. who-original, nz-adapted)
 *   --audience  (optional) Intended audience metadata (e.g. carer)
 *   --document-id (optional) Stable document identifier tag (e.g. isupport-nz)
 *   --preserve-layout (optional) Keep line breaks to better preserve PDF structure
 *   --dry-run   (optional) Print chunks without uploading to Supabase
 *
 * -----------------------------------------------------------------------------
 * CHUNKING STRATEGY
 * -----------------------------------------------------------------------------
 *
 * Text is split into chunks of ~500 words with ~50 word overlap.
 * Each paragraph boundary is preferred as a split point.
 * Short sections (< 40 words) are merged into the previous chunk.
 *
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse =
  typeof pdfParseModule === 'function'
    ? pdfParseModule
    : typeof pdfParseModule?.default === 'function'
      ? pdfParseModule.default
      : null;
const PDFParseClass =
  typeof pdfParseModule?.PDFParse === 'function'
    ? pdfParseModule.PDFParse
    : null;

function loadDotEnvIfPresent() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnvIfPresent();

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}
const hasDryRun = args.includes('--dry-run');

const source   = getArg('source');
const category = getArg('category');
const org      = getArg('org');
const urlArg   = getArg('url');
const prefix   = getArg('prefix');
const chunkingMode = (getArg('chunking') ?? 'generic').toLowerCase();
const preserveLayout = args.includes('--preserve-layout');
const keepFrontMatter = args.includes('--keep-front-matter');
const skipTags = args.includes('--skip-tags');
const country = getArg('country');
const sourceVersion = getArg('source-version');
const audience = getArg('audience');
const documentId = getArg('document-id');

const VALID_CATEGORIES = ['caregiving', 'clinical', 'communication', 'prevention', 'best-practices', 'home-safety', 'well-being'];

if (!source || !category || !org) {
  console.error(
    'Usage: node scripts/ingest.mjs --source <path|url> --category <slug> --org <name> [--url <url>] [--prefix <id_prefix>] [--country <name>] [--source-version <label>] [--audience <name>] [--document-id <id>] [--chunking generic|manual] [--preserve-layout] [--dry-run]'
  );
  process.exit(1);
}

if (!VALID_CATEGORIES.includes(category)) {
  console.error(`Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(' | ')}`);
  process.exit(1);
}

if (!['generic', 'manual'].includes(chunkingMode)) {
  console.error('Invalid --chunking mode. Use "generic" or "manual".');
  process.exit(1);
}

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY            = process.env.OPENAI_API_KEY;

if (!hasDryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY)) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const OPENAI_BASE      = 'https://api.openai.com/v1';
const EMBEDDING_MODEL  = 'text-embedding-3-small';
const CHAT_MODEL       = 'gpt-4o-mini';
const CHUNK_WORDS      = 500;
const OVERLAP_WORDS    = 50;
const MIN_CHUNK_WORDS  = 40;
const BATCH_SIZE       = 20;

const SECTION_MARKERS = [
  { regex: /^learning objectives?\b[:\s-]*/i, type: 'learning-objectives' },
  { regex: /^case vignette\b[:\s-]*/i, type: 'case-vignette' },
  { regex: /^case study\b[:\s-]*/i, type: 'case-vignette' },
  { regex: /^keep in mind\b[:\s-]*/i, type: 'keep-in-mind' },
  { regex: /^activity\b[:\s-]*/i, type: 'activity' },
  { regex: /^reflection\b[:\s-]*/i, type: 'activity' },
  { regex: /^practice exercise\b[:\s-]*/i, type: 'activity' },
];

// In the NZ edition of this manual, a real module-divider page and a
// running page footer both extract as "MODULE" + a page number, often
// split across separate lines — the two are textually indistinguishable,
// so matching on "Module N" there causes more false headings (e.g. from
// wrapped mid-sentence references like "...refer to Module 2.") than it
// resolves. There the module number is derived from section numbering
// resets instead (see currentModuleNum below). The WHO original edition
// prints "Module N. Title" cleanly and reliably, so it's safe to match
// there. "Lesson" is the WHO edition's name for what NZ calls "Section".
const HEADING_MARKERS = [
  ...(documentId === 'isupport-nz' ? [] : [/^module\s+\d+\b/i]),
  /^section\s+\d+\b/i,
  /^lesson\s+\d+\b/i,
  /^session\s+\d+\b/i,
  /^chapter\s+\d+\b/i,
  /^unit\s+\d+\b/i,
];

// Extracts a section number tag from a heading line, e.g. "Section 3" → ["section:3"]
function extractStructuralTags(headingLine) {
  const tags = [];
  const moduleMatch = headingLine.match(/^module\s+(\d+)\b/i);
  if (moduleMatch) tags.push(`module:${moduleMatch[1]}`);
  // "Lesson" (the WHO original edition's term) maps onto the same
  // section:N tag as "Section" (the NZ edition's term) for schema
  // consistency — the two editions are otherwise structured identically.
  const sectionMatch = headingLine.match(/^(?:section|lesson)\s+(\d+)\b/i);
  if (sectionMatch) tags.push(`section:${sectionMatch[1]}`);
  return tags;
}

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractFromUrl(url) {
  console.log(`Fetching URL: ${url}`);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DementiaGuideAI-Ingest/1.0)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const html = await resp.text();
  const dom  = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) throw new Error('Readability could not parse the page — it may be a JavaScript-heavy SPA');
  console.log(`Extracted article: "${article.title}"`);
  return { text: article.textContent, title: article.title };
}

async function extractFromPdf(filePath) {
  console.log(`Reading PDF: ${filePath}`);
  if (!pdfParse && !PDFParseClass) {
    throw new Error('pdf-parse import failed. Reinstall with: npm install pdf-parse');
  }
  const buffer = fs.readFileSync(filePath);

  let data;
  if (pdfParse) {
    data = await pdfParse(buffer);
  } else {
    const parser = new PDFParseClass({ data: buffer });
    await parser.load();
    const textResult = await parser.getText();
    const info = await parser.getInfo();
    await parser.destroy();
    data = {
      text: textResult?.text ?? '',
      numpages: info?.total ?? 0,
    };
  }

  const title  = path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, ' ');
  console.log(`Extracted ${data.numpages} pages from "${title}"`);
  return { text: data.text, title };
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

// Strips PDF running headers/footers before chunking: page markers
// ("-- 13 of 232 --"), bare page numbers left standalone on their own line,
// and short lines (e.g. a running "MODULE" footer, page branding like
// "iSupport for Dementia Aotearoa-NZ") that repeat often enough across the
// document to be layout furniture rather than unique content. Lines that
// match a genuine section/heading or activity/keep-in-mind marker are never
// stripped, even if they recur legitimately throughout the document.
function stripRunningHeaderFooterNoise(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const pageMarkerRe = /^--+\s*\d+\s+of\s+\d+\s*--+$/i;
  const barePageNumberRe = /^\d{1,4}$/;

  const isProtected = (line) =>
    HEADING_MARKERS.some(re => re.test(line)) ||
    SECTION_MARKERS.some(m => m.regex.test(line));

  const counts = new Map();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isProtected(line)) continue;
    if (line.split(/\s+/).length > 8) continue;
    const key = line.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeatedNoiseLines = new Set(
    [...counts.entries()].filter(([, count]) => count >= 4).map(([key]) => key)
  );

  const cleaned = lines.filter(raw => {
    const line = raw.trim();
    if (!line) return true; // keep blank lines — they mark paragraph breaks
    if (isProtected(line)) return true;
    if (pageMarkerRe.test(line)) return false;
    if (barePageNumberRe.test(line)) return false;
    if (repeatedNoiseLines.has(line.toLowerCase())) return false;
    return true;
  });

  return cleaned.join('\n');
}

function normalizeText(text, keepLayout = false) {
  const denoised = stripRunningHeaderFooterNoise(text);

  if (keepLayout) {
    return denoised
      .replace(/[\t\f\v]+/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return denoised
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildMetadataTags() {
  const out = [];
  if (country) out.push(`country:${String(country).trim().toLowerCase()}`);
  if (sourceVersion) out.push(`source_version:${String(sourceVersion).trim().toLowerCase()}`);
  if (audience) out.push(`audience:${String(audience).trim().toLowerCase()}`);
  if (documentId) out.push(`document_id:${String(documentId).trim().toLowerCase()}`);
  return out;
}

function detectSectionType(line) {
  for (const marker of SECTION_MARKERS) {
    if (marker.regex.test(line.trim())) {
      return marker.type;
    }
  }
  return null;
}

function isHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // A genuine heading names exactly one section/module. A cross-reference
  // sentence that got isolated onto its own wrapped line can name two
  // ("Section 2. Memory loss and Section 3. Repetitive behaviour...") —
  // reject those outright.
  const totalMarkerMentions = HEADING_MARKERS.reduce(
    (sum, re) => sum + (trimmed.match(new RegExp(re.source.replace(/^\^/, ''), 'gi')) ?? []).length,
    0
  );
  if (totalMarkerMentions > 1) return false;

  for (const re of HEADING_MARKERS) {
    const match = trimmed.match(re);
    if (!match) continue;

    // A real heading either ends right after the number ("MODULE 2") or is
    // followed by punctuation/title-case text ("Section 4. Planning for...").
    // A table-of-contents blurb continues straight into lowercase prose
    // ("Module 1 provides an introduction to...") — reject those so they
    // don't get mistaken for a genuine section/module boundary.
    const rest = trimmed.slice(match[0].length).replace(/^\s+/, '');
    if (rest && /^[a-z]/.test(rest)) continue;

    return true;
  }

  return false;
}

function splitLongContentByWords(content, maxWords = CHUNK_WORDS) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const out = [];
  let current = [];
  let currentWords = 0;

  for (const p of paragraphs) {
    const words = p.split(/\s+/).length;
    if (currentWords > 0 && currentWords + words > maxWords) {
      out.push(current.join('\n\n').trim());
      current = [p];
      currentWords = words;
    } else {
      current.push(p);
      currentWords += words;
    }
  }

  if (current.length > 0) {
    out.push(current.join('\n\n').trim());
  }

  return out.filter(Boolean);
}

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildExtractiveSummary(text, maxWords = 120) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const picked = [];
  let words = 0;
  for (const sentence of sentences) {
    const wc = sentence.split(/\s+/).length;
    if (words > 0 && words + wc > maxWords) break;
    picked.push(sentence);
    words += wc;
    if (picked.length >= 3) break;
  }

  if (picked.length > 0) return picked.join(' ');
  return clean.split(/\s+/).slice(0, maxWords).join(' ');
}

function detectLowValueReason(content, title = '') {
  const text = String(content ?? '').replace(/\s+/g, ' ').trim();
  const lc = text.toLowerCase();
  const words = lc ? lc.split(/\s+/).length : 0;

  if (!text) return 'empty';

  // Frequent page-number artifact from PDF extraction.
  if (/--\s*\d+\s+of\s+\d+\s*--/i.test(text) && words <= 140) {
    return 'page-marker';
  }

  // Keep content-focused chunks, skip front matter and legal boilerplate.
  if (/(^|\s)(table of contents|contents)($|\s|:)/i.test(text) && words <= 220) {
    return 'table-of-contents';
  }

  const copyrightMatch = text.match(/(©|copyright|all rights reserved|world health organization\s+20\d{2})/i);
  if (copyrightMatch && (words <= 220 || copyrightMatch.index <= 40)) {
    // Short mentions anywhere, or a match right at the top of the chunk
    // (i.e. the chunk opens with a licence/copyright notice), are front
    // matter regardless of how long the rest of the chunk runs on.
    return 'copyright-disclaimer';
  }

  // Staff/acknowledgement lists are pure front matter, regardless of length.
  if (/^(who staff|acknowledgements?|administrative support|production team|editorial (team|group|support))\b/i.test(lc)) {
    return 'acknowledgements';
  }

  // "About this manual" front matter (preface, how-it's-organized, how to
  // use it) explains the book itself rather than giving caregiving guidance.
  if (
    text.slice(0, 30).match(/\bpreface\b/i) ||
    /how to use this (i\s*support )?manual/i.test(text) ||
    /(this |the )?manual is organi[sz]ed into/i.test(text) ||
    // A generic walkthrough of what an Activity/tip section looks like
    // ("here you will be asked to...", "here you will find some helpful
    // hints...") — explains the manual's format, not real guidance.
    (/here you will be asked/i.test(text) && /here you will find/i.test(text))
  ) {
    return 'manual-front-matter';
  }

  // A dense block of short, unpunctuated lines (module/section name lists,
  // figure captions) reads as a diagram or index dump, not prose guidance.
  if (words <= 160) {
    const contentLines = String(content ?? '').split('\n').map(l => l.trim()).filter(Boolean);
    if (contentLines.length >= 8) {
      const shortLineRatio = contentLines.filter(l => l.split(/\s+/).length <= 5).length / contentLines.length;
      const punctuatedRatio = contentLines.filter(l => /[.!?]$/.test(l)).length / contentLines.length;
      if (shortLineRatio >= 0.85 && punctuatedRatio <= 0.1) {
        return 'diagram-or-index-dump';
      }
    }
  }

  // Very short module-only heading fragments are not useful retrieval units.
  if (/^module\s+\d+\b/i.test(lc) && words <= 24) {
    return 'module-heading-fragment';
  }

  if (/^(i\s*support|isupport)\b/i.test(lc) && words <= 24) {
    return 'cover-fragment';
  }

  const headingLike = words <= 12 && /^[a-z0-9][a-z0-9 \-]{0,79}[:\-]?\s*$/i.test(text);
  if (headingLike && words <= 12) {
    return 'short-heading-only';
  }

  return null;
}

function filterLowValueChunks(chunks, { enabled = true } = {}) {
  if (!enabled) return chunks;

  const removed = [];
  const kept = [];

  for (const chunk of chunks) {
    const reason = detectLowValueReason(chunk.content, chunk.title);
    if (reason) {
      removed.push({ id: chunk.id, title: chunk.title, reason });
      continue;
    }
    kept.push(chunk);
  }

  if (removed.length > 0) {
    console.log(`\nFiltered out ${removed.length} low-value chunk(s):`);
    for (const item of removed) {
      console.log(`  - ${item.id} (${item.reason}) ${item.title}`);
    }
  }

  if (kept.length === 0) {
    throw new Error('All chunks were filtered out as low-value. Use --keep-front-matter to bypass this filter if needed.');
  }

  return kept;
}

function chunkManualText(text, sourceTitle) {
  const clean = normalizeText(text, preserveLayout);
  const lines = clean.split(/\n/).map(l => l.trimRight());
  const blocks = [];

  let currentHeading = sourceTitle;
  let currentType = 'body';
  let currentLines = [];
  let currentStructuralTags = [];
  let lastModuleTags = [];   // carry module tags into sections that don't reset them
  let currentModuleNum = 0;  // incremented whenever a section-1 heading is reached with real content
  let lastAppliedSectionTag = null; // guards against re-counting the same still-active section across repeated flushes
  // The running header for a given real section isn't always printed
  // identically — this manual sometimes drops trailing words partway
  // through a section's own pages ("Section 1. The journey together" vs.
  // later "Section 1. The journey"). The section *number* stays reliable
  // even when the trailing title text doesn't, so that's what dedup keys
  // off; the heading's non-numbered marker types fall back to text.
  let lastCommittedSectionNum = null;
  let lastCommittedModuleNum = null; // only set where "Module N" text itself is reliable (see isHeadingLine)
  let lastAppliedModuleTag = null; // guards against re-counting the same still-active module across repeated flushes
  const HEADING_DEDUP_PREFIX_LEN = 20;

  // A heading is only tentative until real content is seen behind it — a
  // module's rapid-fire index of its own section titles is all headings
  // with nothing in between, and none of those should overwrite
  // currentHeading (that would break dedup continuity for the *real*
  // running header re-appearing right after the index).
  let pendingHeading = null;
  let pendingStructuralTags = null;
  const commitPendingHeading = () => {
    if (pendingHeading === null) return;
    currentHeading = pendingHeading;
    currentStructuralTags = pendingStructuralTags;
    currentType = 'body';
    const moduleTag = pendingStructuralTags.find(t => t.startsWith('module:'));
    if (moduleTag) lastCommittedModuleNum = moduleTag.split(':')[1];
    const sectionTag = pendingStructuralTags.find(t => t.startsWith('section:'));
    if (sectionTag) lastCommittedSectionNum = sectionTag.split(':')[1];
    pendingHeading = null;
    pendingStructuralTags = null;
  };

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;

    // When "Module N" text is reliable in this document (see isHeadingLine),
    // a real module heading names the module directly — prefer that over
    // inferring it from section resets. Both paths defer to real content:
    // each module opens with a rapid-fire index of its own section titles
    // (all headings back-to-back, no content between them), and those
    // contentless headings return above and never reach here, so only a
    // heading that actually has content behind it gets to update the
    // module — this is what keeps it from racing ahead of the real count.
    const moduleTagFromHeading = currentStructuralTags.find(t => t.startsWith('module:'));
    if (moduleTagFromHeading && moduleTagFromHeading !== lastAppliedModuleTag) {
      currentModuleNum = parseInt(moduleTagFromHeading.split(':')[1], 10);
      lastModuleTags = [moduleTagFromHeading];
      lastAppliedModuleTag = moduleTagFromHeading;
      lastAppliedSectionTag = null; // a new module also resets what counts as "already applied" for its section:1
    } else if (!moduleTagFromHeading) {
      const sectionTag = currentStructuralTags.find(t => t.startsWith('section:'));
      if (sectionTag && sectionTag !== lastAppliedSectionTag) {
        if (sectionTag === 'section:1') currentModuleNum += 1;
        if (currentModuleNum > 0) lastModuleTags = [`module:${currentModuleNum}`];
        lastAppliedSectionTag = sectionTag;
      }
    }

    const mergedStructuralTags = [...new Set([...lastModuleTags, ...currentStructuralTags])];
    const parentKeyCore = [
      ...mergedStructuralTags.filter(t => t.startsWith('module:') || t.startsWith('section:')),
      `heading:${slugify(currentHeading)}`,
    ].join('|');

    blocks.push({
      sectionHeading: currentHeading,
      sectionType: currentType,
      structuralTags: mergedStructuralTags,
      parentKey: slugify(parentKeyCore),
      content,
    });
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (currentLines.length > 0) {
        currentLines.push('');
      }
      continue;
    }

    if (isHeadingLine(line)) {
      const moduleMatch = line.match(/^module\s+(\d+)\b/i);
      const sectionMatch = line.match(/^(?:section|lesson)\s+(\d+)\b/i);
      const isRepeatOfCommittedModule = moduleMatch && moduleMatch[1] === lastCommittedModuleNum;
      const isRepeatOfCommittedSection = sectionMatch && sectionMatch[1] === lastCommittedSectionNum;

      // Non-numbered heading types (session/chapter/unit) have no reliable
      // number to key off, so fall back to comparing a leading text prefix
      // against whichever heading is currently "in effect" (a still-pending
      // one takes priority over the last committed one).
      const effectiveHeading = pendingHeading ?? currentHeading;
      const headingPrefix = line.toLowerCase().slice(0, HEADING_DEDUP_PREFIX_LEN);
      const effectivePrefix = effectiveHeading.toLowerCase().slice(0, HEADING_DEDUP_PREFIX_LEN);
      const isRepeatOfCommittedText = !moduleMatch && !sectionMatch && headingPrefix === effectivePrefix;

      if (isRepeatOfCommittedModule || isRepeatOfCommittedSection || isRepeatOfCommittedText) continue;

      flush();
      pendingHeading = line;
      pendingStructuralTags = extractStructuralTags(line);
      continue;
    }

    const sectionType = detectSectionType(line);
    if (sectionType) {
      commitPendingHeading();
      flush();
      currentType = sectionType;
      currentLines.push(line);
      continue;
    }

    commitPendingHeading();
    currentLines.push(line);
  }

  flush();

  // A heading falsely detected mid-sentence (or a genuine but tiny trailing
  // fragment) leaves behind a block of only a few words. Reattach these to
  // the previous block rather than shipping them as their own near-empty,
  // untaggable chunk.
  const mergedBlocks = [];
  for (const block of blocks) {
    const wordCount = block.content.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_CHUNK_WORDS && mergedBlocks.length > 0) {
      const prev = mergedBlocks[mergedBlocks.length - 1];
      prev.content = `${prev.content}\n\n${block.content}`.trim();
    } else {
      mergedBlocks.push({ ...block });
    }
  }

  const expandedChildren = [];
  for (const block of mergedBlocks) {
    const wordCount = block.content.split(/\s+/).filter(Boolean).length;
    if (wordCount <= CHUNK_WORDS) {
      expandedChildren.push(block);
    } else {
      const parts = splitLongContentByWords(block.content, CHUNK_WORDS);
      parts.forEach((content, idx) => {
        expandedChildren.push({
          ...block,
          sectionPart: idx + 1,
          content,
        });
      });
    }
  }

  const idBase = (prefix ?? path.basename(source, path.extname(source)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);

  const metadataTags = buildMetadataTags();
  const parentBlocks = new Map();

  for (const block of mergedBlocks) {
    if (!block.parentKey) continue;
    if (!parentBlocks.has(block.parentKey)) {
      parentBlocks.set(block.parentKey, {
        sectionHeading: block.sectionHeading,
        structuralTags: block.structuralTags,
        summaryText: buildExtractiveSummary(block.content),
      });
    }
  }

  const parentChunks = Array.from(parentBlocks.entries()).map(([parentKey, parent], idx) => ({
    id: `${idBase}_p${String(idx + 1).padStart(3, '0')}`,
    category,
    title: `${parent.sectionHeading} — section summary`,
    content: parent.summaryText,
    tags: [
      'source:manual',
      'chunk_level:parent',
      'chunk_type:section-summary',
      `parent_key:${parentKey}`,
      ...(parent.structuralTags ?? []),
      ...metadataTags,
    ],
    source_url: urlArg ?? (source.startsWith('http') ? source : null),
    source_org: org,
    embedding: null,
  }));

  const childChunks = expandedChildren.map((block, idx) => {
    const label = block.sectionType === 'body'
      ? block.sectionHeading
      : `${block.sectionHeading} — ${block.sectionType}`;
    const partSuffix = block.sectionPart ? ` (Part ${block.sectionPart})` : '';

    return {
      id: `${idBase}_c${String(idx + 1).padStart(3, '0')}`,
      category,
      title: `${label}${partSuffix}`,
      content: block.content,
      tags: [
        'source:manual',
        'chunk_level:child',
        `chunk_type:${block.sectionType}`,
        `parent_key:${block.parentKey}`,
        ...(block.structuralTags ?? []),
        ...metadataTags,
      ],
      source_url: urlArg ?? (source.startsWith('http') ? source : null),
      source_org: org,
      embedding: null,
    };
  });

  const all = [...parentChunks, ...childChunks];
  applyKnownDocumentStructure(all, documentId);
  console.log(`Split into ${childChunks.length} child chunks + ${parentChunks.length} parent summaries`);
  return all;
}

// This manual's running headers and page layout are noisy enough (rapid-fire
// per-module section indexes, inconsistent header truncation, stray
// cross-references) that streaming inference alone can still misfire on a
// handful of edge cases. The document's own printed contents page (verified
// against the extracted PDF text) is ground truth, so for known documents we
// use it to correct any block whose title unambiguously matches a known
// section, overriding whatever module number the streaming pass guessed.
// Fragments are kept short (but still distinctive) because this manual's
// running headers are sometimes truncated mid-title from page to page —
// a fragment has to survive matching against the shortest truncation seen.
const KNOWN_DOCUMENT_STRUCTURE = {
  'isupport-nz': [
    [1, 'types of dementia'],
    [1, 'optimising brain health'],
    [1, 'person centred care'],
    [1, 'planning for the future'],
    [2, 'the journey'],
    [2, 'improving communication'],
    [2, 'supported decision'],
    [2, 'involving others'],
    [3, 'reducing stress'],
    [3, 'making time for'],
    [3, 'thinking differently'],
    [4, 'an enjoyable day'],
    [4, 'eating drinking and preventing'],
    [4, 'eating and drinking'],
    [4, 'personal care'],
    [4, 'toileting and continence'],
    [5, 'introduction to changes'],
    [5, 'memory loss'],
    [5, 'repetitive behaviour'],
    [5, 'depression anxiety'],
    [5, 'difficulty sleeping'],
    [5, 'walking and getting lost'],
    [5, 'changes in judgement'],
    [5, 'aggression'],
    [5, 'delusions and hallucinations'],
    [5, 'putting it all'],
  ],
  // WHO original edition — same 23 sections ("lessons") as the NZ edition,
  // just reordered within modules 4 and 5 and printed under "Lesson N."
  // instead of "Section N.". Verified against this PDF's own CONTENTS page.
  'isupport-who': [
    [1, 'types of dementia'],
    [1, 'optimising brain health'],
    [1, 'person centred care'],
    [1, 'planning for the future'],
    [2, 'the journey'],
    [2, 'improving communication'],
    [2, 'supported decision'],
    [2, 'involving others'],
    [3, 'reducing stress'],
    [3, 'making time for'],
    [3, 'thinking differently'],
    [4, 'an enjoyable day'],
    [4, 'eating drinking and preventing'],
    [4, 'eating and drinking'],
    [4, 'personal care'],
    [4, 'toileting and continence'],
    [5, 'introduction to behaviour changes'],
    [5, 'memory loss'],
    [5, 'repetitive behaviour'],
    [5, 'depression anxiety'],
    [5, 'difficulty sleeping'],
    [5, 'walking and getting lost'],
    [5, 'changes in judgement'],
    [5, 'aggression'],
    [5, 'delusions and hallucinations'],
    [5, 'putting it all'],
  ],
};

function normalizeForMatch(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function applyKnownDocumentStructure(chunks, docId) {
  const structure = KNOWN_DOCUMENT_STRUCTURE[String(docId ?? '').toLowerCase()];
  if (!structure) return;

  for (const chunk of chunks) {
    // Title carries the section heading text (plus a " — type"/"(Part N)"
    // suffix for child chunks, or " — section summary" for parents); either
    // way the heading itself is a prefix, which is all we need to match.
    const normalizedTitle = normalizeForMatch(chunk.title);
    const match = structure.find(([, titleFragment]) => normalizedTitle.includes(titleFragment));
    if (!match) continue;

    const [correctModule] = match;
    chunk.tags = [
      ...chunk.tags.filter(t => !t.startsWith('module:')),
      `module:${correctModule}`,
    ];
  }
}

function chunkText(text, sourceTitle) {
  // Normalise whitespace
  const clean = normalizeText(text, preserveLayout);

  // Split on paragraph breaks first, then fall back to sentences
  const paragraphs = clean
    .split(/\n{2,}/)
    .map(p => preserveLayout ? p.trim() : p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);

  const chunks = [];
  let current  = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(' ');
    if (wordCount + words.length > CHUNK_WORDS && wordCount > 0) {
      // Save current chunk
      const text = current.join(' ').trim();
      if (text.split(' ').length >= MIN_CHUNK_WORDS) {
        chunks.push(text);
      } else if (chunks.length > 0) {
        // Too short — merge into previous
        chunks[chunks.length - 1] += ' ' + text;
      }
      // Start new chunk with overlap from end of previous
      const overlapWords = current.join(' ').split(' ').slice(-OVERLAP_WORDS);
      current   = [overlapWords.join(' '), para];
      wordCount = overlapWords.length + words.length;
    } else {
      current.push(para);
      wordCount += words.length;
    }
  }

  // Push last chunk
  if (current.length > 0) {
    const text = current.join(' ').trim();
    if (text.split(' ').length >= MIN_CHUNK_WORDS) {
      chunks.push(text);
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1] += ' ' + text;
    } else {
      chunks.push(text); // Only chunk — keep regardless of length
    }
  }

  console.log(`Split into ${chunks.length} chunks`);

  // Derive ID prefix from source arg or --prefix
  const idBase = (prefix ?? path.basename(source, path.extname(source)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);

  const metadataTags = buildMetadataTags();

  return chunks.map((content, idx) => ({
    id:         `${idBase}_${String(idx + 1).padStart(3, '0')}`,
    category,
    title:      chunks.length === 1 ? sourceTitle : `${sourceTitle} (Part ${idx + 1})`,
    content,
    tags:       [...metadataTags],  // enriched by autoTagChunks()
    source_url: urlArg ?? (source.startsWith('http') ? source : null),
    source_org: org,
    embedding:  null,
  }));
}

// ─── Auto-tagging via GPT-4o-mini ─────────────────────────────────────────────
// Sends each chunk's title + content to GPT and asks for 4-6 relevant tags.
// Tags match the style of the existing knowledge base (lowercase, 1-3 words each).

async function autoTagChunks(chunks) {
  console.log('\nGenerating tags...');
  for (const chunk of chunks) {
    const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 220,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a specialist tagger for a dementia care knowledge base used by caregivers and clinicians. ' +
              'Given a chunk of text, produce ONLY a JSON array of lowercase tags that are SPECIFIC to the ' +
              'exact content — not generic dementia labels. Include as many tags as are genuinely useful for retrieval; ' +
              'do not pad with vague or repetitive tags. ' +
              'Rules: ' +
              '(1) Tags must reflect the specific condition, symptom, technique, medication, risk factor, or situation discussed — not just "dementia" or "caregiving". ' +
              '(2) Include the specific disease type if mentioned (e.g. "alzheimer\'s disease", "vascular dementia", "lewy body dementia"). ' +
              '(3) Include specific symptoms or behaviours mentioned (e.g. "sundowning", "repetitive questioning", "dysphagia", "incontinence"). ' +
              '(4) Include specific interventions or strategies if present (e.g. "prompted toileting", "cognitive stimulation therapy", "reminiscence therapy"). ' +
              '(5) Include specific medications if named (e.g. "donepezil", "memantine", "risperidone"). ' +
              '(6) Include the target audience if clear (e.g. "family carer", "clinician", "aged care worker"). ' +
              '(7) Use 1-5 words per tag, all lowercase. ' +
              '(8) No explanation, no markdown — return ONLY the JSON array. ' +
              '(9) Prefer concrete terms from the text over abstract umbrella terms. ' +
              'Bad example (too generic): ["dementia","memory","caregiving","brain"] ' +
              'Good example: ["alzheimer\'s disease","amyloid plaques","tau tangles","early diagnosis","MCI","atypical alzheimer\'s","risk factors","family carer"]',
          },
          {
            role: 'user',
            content: `Title: ${chunk.title}\n\nContent: ${chunk.content.slice(0, 800)}`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.warn(`  Warning: tagging failed for "${chunk.title}" — leaving tags empty`);
      continue;
    }
    const data = await resp.json();
    const raw  = data.choices[0].message.content.trim();
    try {
      const generated = JSON.parse(raw);
      const sanitize = (list) => {
        if (!Array.isArray(list)) return [];
        const bad = new Set(['dementia', 'caregiving', 'brain', 'memory']);
        const unique = new Set();
        const out = [];

        for (const item of list) {
          if (typeof item !== 'string') continue;
          const tag = item.trim().toLowerCase();
          if (!tag) continue;
          if (tag.length < 3 || tag.length > 60) continue;
          if (bad.has(tag)) continue;
          if (unique.has(tag)) continue;

          unique.add(tag);
          out.push(tag);

          // Keep a high safety ceiling to avoid runaway token/noise issues.
          if (out.length >= 40) break;
        }
        return out;
      };

      const combined = sanitize([...(chunk.tags ?? []), ...(generated ?? [])]);
      chunk.tags = combined;
      console.log(`  "${chunk.title}" → [${chunk.tags.join(', ')}]`);
    } catch {
      console.warn(`  Warning: could not parse tags for "${chunk.title}": ${raw}`);
    }
  }
}

// ─── OpenAI embedding ─────────────────────────────────────────────────────────

async function batchEmbed(texts) {
  const resp = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (resp.status === 401) throw new Error('Invalid OpenAI API key');
  if (resp.status === 429) throw new Error('OpenAI rate limit — wait and retry');
  if (!resp.ok) {
    const err = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`OpenAI embed error: ${err}`);
  }
  const data = await resp.json();
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Extract text
  let text, title;
  if (source.startsWith('http://') || source.startsWith('https://')) {
    ({ text, title } = await extractFromUrl(source));
  } else if (source.toLowerCase().endsWith('.pdf')) {
    ({ text, title } = await extractFromPdf(source));
  } else {
    // Plain text file
    text  = fs.readFileSync(source, 'utf8');
    title = path.basename(source, path.extname(source)).replace(/[-_]/g, ' ');
  }

  // 2. Chunk
  let chunks = chunkingMode === 'manual'
    ? chunkManualText(text, title)
    : chunkText(text, title);

  chunks = filterLowValueChunks(chunks, { enabled: !keepFrontMatter });

  // 3. Auto-tag unless explicitly disabled
  if (skipTags) {
    console.log('\nSkipping auto-tagging (--skip-tags enabled)');
  } else if (OPENAI_API_KEY) {
    await autoTagChunks(chunks);
  } else {
    console.log('\nSkipping auto-tagging (no OPENAI_API_KEY set)');
  }

  if (hasDryRun) {
    console.log('\n── DRY RUN — chunks that would be uploaded ──\n');
    chunks.forEach((c, i) => {
      console.log(`[${i + 1}] id:       ${c.id}`);
      console.log(`    title:    ${c.title}`);
      console.log(`    words:    ${c.content.split(' ').length}`);
      console.log(`    tags:     [${c.tags.join(', ')}]`);
      console.log(`    content:\n`);
      // Print full content indented so it can be reviewed for accuracy
      c.content.split('\n').forEach(line => console.log(`      ${line}`));
      console.log();
    });
    console.log(`Total: ${chunks.length} chunks. Run without --dry-run to upload.`);
    return;
  }

  // 4. Embed in batches
  console.log('\nGenerating embeddings...');
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => `${c.title}. ${c.content}`);
    process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} ...`);
    const embeddings = await batchEmbed(texts);
    embeddings.forEach((emb, idx) => { batch[idx].embedding = emb; });
    console.log(' done');
  }

  // 5. Upsert to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\nUploading to Supabase...');
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('knowledge_chunks')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Upsert failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks uploaded`);
  }

  console.log('\nIngestion complete!');
  console.log(`Added ${chunks.length} chunks from "${title}" under category "${category}"`);
  console.log('\nIDs added:');
  chunks.forEach(c => console.log(`  ${c.id}`));
}

main().catch(err => {
  console.error('\nIngestion failed:', err.message);
  process.exit(1);
});
