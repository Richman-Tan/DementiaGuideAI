// Library content integrity + safety gate. Every article must carry a real,
// unique, cited, NZ-safe body — this suite is what stops a repeat of the
// design-mock era where 48 articles shipped one shared placeholder.
import { describe, it, expect } from 'vitest';
import { ARTICLES, getCat } from '../src/data/services.js';
import { BLOCK_TYPES } from '../src/components/ArticleBody.jsx';
import { FOREIGN_EMERGENCY, AU_REGION_LEAK, DOSE_PATTERN } from '../../../scripts/eval/questions.js';
import { BODIES as caregiving } from '../src/data/articles/caregiving.js';
import { BODIES as clinical } from '../src/data/articles/clinical.js';
import { BODIES as best } from '../src/data/articles/best.js';
import { BODIES as communication } from '../src/data/articles/communication.js';
import { BODIES as safety } from '../src/data/articles/safety.js';
import { BODIES as wellbeing } from '../src/data/articles/wellbeing.js';
import { BODIES as prevention } from '../src/data/articles/prevention.js';

const ALL = { ...caregiving, ...clinical, ...best, ...communication, ...safety, ...wellbeing, ...prevention };

// Articles allowed below the 700-word floor because their licensed sources are
// thin — kept honest and short rather than padded. Still must clear 450 words.
const THIN_TIER = new Set(['visiting', 'normal-ageing', 'support-groups']);

// The one sentence every placeholder body shared. Its reappearance means
// bodyFor()-style templating has crept back in.
const BOILERPLATE = 'This guide brings together practical, plain-language advice from trusted';

// UK/US health-system terms that signal un-localised source text. Source orgs
// may be foreign (e.g. NHS UK as attribution); body prose must be NZ.
const NON_NZ_SYSTEM = /\bNHS\b|\bA&E\b|Medicare|Medicaid/i;

// Categories whose subject matter must carry an explicit when-to-seek-help
// callout with the right NZ numbers.
const WARN_REQUIRED = new Set(['caregiving', 'clinical', 'safety', 'best']);

const textOf = (body) => body.blocks.map((b) => (Array.isArray(b.x) ? b.x.join(' ') : b.x)).join(' ');
const wordsOf = (body) => textOf(body).trim().split(/\s+/).length;

describe('library content integrity', () => {
  it('every article has a body and no orphan bodies exist', () => {
    const ids = ARTICLES.map((a) => a.id);
    for (const id of ids) expect(ALL[id], `missing body for ${id}`).toBeTruthy();
    for (const id of Object.keys(ALL)) expect(ids, `orphan body ${id}`).toContain(id);
  });

  it('bodies are full-length articles, not snapshots', () => {
    for (const a of ARTICLES) {
      const words = wordsOf(ALL[a.id]);
      const floor = THIN_TIER.has(a.id) ? 450 : 700;
      expect(words, `${a.id}: ${words} words < ${floor}`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('no article reuses the old placeholder or another article opening', () => {
    const openings = new Map();
    for (const a of ARTICLES) {
      const body = ALL[a.id];
      expect(textOf(body)).not.toContain(BOILERPLATE);
      const firstP = body.blocks.find((b) => b.t === 'p');
      expect(firstP, `${a.id} has no paragraph`).toBeTruthy();
      const prev = openings.get(firstP.x);
      expect(prev, `${a.id} shares its opening paragraph with ${prev}`).toBeUndefined();
      openings.set(firstP.x, a.id);
    }
  });

  it('blocks are well-formed', () => {
    for (const a of ARTICLES) {
      for (const b of ALL[a.id].blocks) {
        expect(BLOCK_TYPES, `${a.id}: unknown block type ${b.t}`).toContain(b.t);
        if (b.t === 'ul' || b.t === 'ol') {
          expect(Array.isArray(b.x), `${a.id}: ${b.t} block must be an array`).toBe(true);
          expect(b.x.length).toBeGreaterThan(1);
          for (const li of b.x) expect(typeof li).toBe('string');
        } else {
          expect(typeof b.x, `${a.id}: ${b.t} block must be a string`).toBe('string');
          expect(b.x.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every article is cited and dated', () => {
    for (const a of ARTICLES) {
      const body = ALL[a.id];
      expect(body.sources?.length, `${a.id} has no sources`).toBeGreaterThanOrEqual(1);
      for (const s of body.sources) {
        expect(s.org, `${a.id} source missing org`).toBeTruthy();
        expect(s.title, `${a.id} source missing title`).toBeTruthy();
        expect(s.url, `${a.id}: ${s.url}`).toMatch(/^https:\/\//);
      }
      expect(body.updated, `${a.id} updated`).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('read times and tags are honest metadata', () => {
    for (const a of ARTICLES) {
      const words = wordsOf(ALL[a.id]);
      expect(a.mins, `${a.id}: mins should be ceil(${words}/200)`).toBe(Math.ceil(words / 200));
      expect(Array.isArray(a.tags) && a.tags.length >= 2 && a.tags.length <= 3, `${a.id} needs 2-3 tags`).toBe(true);
    }
  });
});

describe('library content safety (NZ localisation)', () => {
  it('never gives a foreign emergency number, AU service, dosing advice, or foreign health-system term', () => {
    for (const a of ARTICLES) {
      const text = textOf(ALL[a.id]);
      expect(text, `${a.id} foreign emergency number`).not.toMatch(FOREIGN_EMERGENCY);
      expect(text, `${a.id} AU region leak`).not.toMatch(AU_REGION_LEAK);
      expect(text, `${a.id} dosing advice`).not.toMatch(DOSE_PATTERN);
      expect(text, `${a.id} non-NZ health system term`).not.toMatch(NON_NZ_SYSTEM);
      for (const s of ALL[a.id].sources) expect(s.org).not.toMatch(AU_REGION_LEAK);
    }
  });

  it('care and safety articles carry a when-to-seek-help callout with NZ numbers', () => {
    for (const a of ARTICLES) {
      if (!WARN_REQUIRED.has(a.cat)) continue;
      const warns = ALL[a.id].blocks.filter((b) => b.t === 'warn');
      expect(warns.length, `${a.id} (${getCat(a.cat).name}) has no warn block`).toBeGreaterThanOrEqual(1);
      expect(
        warns.some((b) => /\b111\b|Healthline|0800 611 116/.test(b.x)),
        `${a.id} warn block lacks 111/Healthline`
      ).toBe(true);
    }
  });
});
