// The library's data layer: the article index and its search, the lazily
// loaded article bodies, the mock-mode reply table, the category chip colours,
// and the matcher that turns a knowledge-base source into "Read related
// article". All pure; exercised through their exports.
import { describe, it, expect } from 'vitest';
import * as idx from '../src/data/articles/index.js';
import {
  CATS,
  ARTICLES,
  getArticle,
  getCat,
  relatedTo,
  searchArticles,
  tagsFor,
  excerptFor,
  mockReply,
  seedThread,
  FEATURED,
  QUICK_QUESTIONS,
  VOICE_QUESTIONS,
} from '../src/data/services.js';
import { catStyle } from '../src/lib/catStyle.js';
import { matchSourceToArticle } from '../src/services/kbToLibrary.js';

describe('article bodies (data/articles/index.js)', () => {
  // Runs first: nothing has been loaded yet in this module instance.
  it('loads a category once, caches it, and indexes the body text for search', async () => {
    expect(idx.searchTextOf('respite')).toBe(''); // not loaded yet
    const bodies = await idx.loadCategory('wellbeing');
    expect(Object.keys(bodies)).toContain('respite');
    expect(await idx.loadCategory('wellbeing')).toBe(bodies); // cached object
    const text = idx.searchTextOf('respite');
    expect(text.length).toBeGreaterThan(100);
    expect(text).toBe(text.toLowerCase());
  });

  it('joins list blocks into the search text as well as paragraphs', async () => {
    const bodies = await idx.loadCategory('best');
    const list = bodies.repetitive.blocks.find((b) => Array.isArray(b.x));
    expect(idx.searchTextOf('repetitive')).toContain(list.x[0].toLowerCase());
  });

  it('loadBody returns one article, or null for an unknown id', async () => {
    const body = await idx.loadBody('stages', 'clinical');
    expect(body.blocks.length).toBeGreaterThan(0);
    expect(body.sources.length).toBeGreaterThan(0);
    expect(await idx.loadBody('no-such-article', 'clinical')).toBeNull();
  });

  it('an unknown category yields nothing rather than throwing', async () => {
    expect(await idx.loadCategory('astrology')).toEqual({});
    expect(await idx.loadBody('stages', 'astrology')).toBeNull();
  });

  it('warmAll loads every category, so every article becomes searchable by body text', async () => {
    const results = await idx.warmAll();
    expect(results).toHaveLength(CATS.length);
    for (const a of ARTICLES) expect(idx.searchTextOf(a.id), a.id).not.toBe('');
  });
});

describe('library index (data/services.js)', () => {
  it('looks articles and categories up by id', () => {
    expect(getArticle('respite').cat).toBe('wellbeing');
    expect(getArticle('nope')).toBeUndefined();
    expect(getCat('safety').name).toBe('Home Safety');
  });

  it('relatedTo gives up to three other articles from the same category', () => {
    const a = getArticle('wandering');
    const rel = relatedTo(a);
    expect(rel).toHaveLength(3);
    for (const r of rel) {
      expect(r.cat).toBe('safety');
      expect(r.id).not.toBe('wandering');
    }
  });

  it('a blank query returns the whole library', () => {
    expect(searchArticles('   ')).toBe(ARTICLES);
  });

  it('matches on title, summary, tags and category name, case-insensitively', () => {
    expect(searchArticles('SUNDOWNING').map((a) => a.id)).toContain('managing-sundowning');
    expect(searchArticles('nasc').map((a) => a.id)).toContain('respite'); // a tag
    // The category name: every Home Safety article matches through it.
    const home = searchArticles('home safety').map((a) => a.id);
    for (const a of ARTICLES.filter((x) => x.cat === 'safety')) expect(home).toContain(a.id);
  });

  it('matches body text once the bodies are warm', async () => {
    await idx.warmAll();
    // A phrase that appears only inside an article body.
    const hits = searchArticles('whiteboard showing the day').map((a) => a.id);
    expect(hits).toContain('repetitive');
    expect(searchArticles('zzzz-no-such-phrase')).toEqual([]);
  });

  it('tagsFor uses the article tags, with a category fallback; excerptFor is the summary', () => {
    const a = getArticle('falls');
    expect(tagsFor(a)).toEqual(['Falls', 'Mobility']);
    expect(tagsFor({ cat: 'clinical' })).toEqual(['Clinical Guidelines', 'Practical guide']);
    expect(excerptFor(a)).toBe(a.sum);
  });

  it('featured articles carry their reading time; voice reuses the quick questions', () => {
    expect(FEATURED).toEqual(FEATURED.map((f) => ({ id: f.id, mins: getArticle(f.id).mins })));
    expect(VOICE_QUESTIONS).toBe(QUICK_QUESTIONS);
  });
});

describe('mock replies', () => {
  it('answers a known topic with the long or concise text and its citations', () => {
    const long = mockReply('My dad wanders at night', {});
    const short = mockReply('My dad wanders at night', { concise: true });
    expect(long.text).toMatch(/^Wandering usually has a reason/);
    expect(short.text.length).toBeLessThan(long.text.length);
    expect(long.citations.map((c) => c.id)).toEqual(['wandering', 'wayfinding']);
    expect(long.citations[0]).toEqual({
      id: 'wandering',
      title: getArticle('wandering').title,
      cat: 'safety',
    });
    expect(long.safety).toBe(false);
  });

  it('flags the aggression topic as a safety reply', () => {
    expect(mockReply('He gets aggressive and hits me', null).safety).toBe(true);
  });

  it('falls back to the generic person-centred reply for anything else', () => {
    const r = mockReply('Tell me about gardening', null);
    expect(r.text).toMatch(/^That's a good question/);
    expect(r.citations.map((c) => c.id)).toEqual(['person-centred']);
    expect(r.safety).toBe(false);
    expect(mockReply('Tell me about gardening', { concise: true }).text).toMatch(
      /^Look for the need/
    );
  });

  it('can simulate a knowledge-base outage', () => {
    expect(mockReply('anything', null, { fail: true })).toEqual({ error: true });
  });

  it('seeds the demo thread with two exchanges', () => {
    const t = seedThread();
    expect(t.map((m) => m.role)).toEqual(['user', 'aria', 'user', 'aria']);
    expect(t[3].safety).toBe(true);
  });

  it('marks every message of it as an example, not something the visitor said', () => {
    expect(seedThread().every((m) => m.demo === true)).toBe(true);
  });
});

describe('catStyle', () => {
  it('uses pale background + deep text in light mode and tint + accent in dark mode', () => {
    const c = getCat('clinical');
    expect(catStyle('clinical', false)).toEqual({ bg: c.pale, fg: '#2D5F70', dot: c.accent });
    expect(catStyle('clinical', true)).toEqual({ bg: c.dk, fg: c.accent, dot: c.accent });
  });

  it('falls back to the theme tokens for an unknown category', () => {
    expect(catStyle('unknown', false)).toEqual({
      bg: 'var(--tint)',
      fg: 'var(--primary-d)',
      dot: 'var(--primary)',
    });
  });
});

describe('matchSourceToArticle', () => {
  it('maps known bulk sources through the alias table', () => {
    expect(matchSourceToArticle({ title: 'Module 3', org: 'WHO iSupport' }).id).toBe(
      'person-centred'
    );
    expect(matchSourceToArticle({ title: 'Respite care in NZ' }).id).toBe('respite');
  });

  it('matches by title words when at least 60% of them appear in an article', () => {
    // "kitchen", "bathroom", "safety" → all in "Kitchen and Bathroom Safety".
    expect(
      matchSourceToArticle({ title: 'Kitchen and bathroom safety', org: 'Dementia NZ' }).id
    ).toBe('kitchen-bathroom');
  });

  it('refuses a weak overlap rather than linking the wrong article', () => {
    // Only one of four meaningful words ("falls") overlaps.
    expect(matchSourceToArticle({ title: 'Quarterly finance report falls short' })).toBeNull();
  });

  it('needs at least two meaningful title words to try', () => {
    expect(matchSourceToArticle({ title: 'Falls' })).toBeNull();
    expect(matchSourceToArticle({ org: 'Unknown org' })).toBeNull();
  });
});
