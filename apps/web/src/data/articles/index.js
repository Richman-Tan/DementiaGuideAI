// Lazy-loaded library article bodies, one module (and one build chunk) per
// category so the eagerly-loaded app bundle stays small for study participants.
// Each category module exports BODIES: { [articleId]: { updated, sources, blocks } }
// where sources is [{ org, title, url }] and blocks use the ArticleBody schema.

const LOADERS = {
  caregiving: () => import('./caregiving.js'),
  clinical: () => import('./clinical.js'),
  best: () => import('./best.js'),
  communication: () => import('./communication.js'),
  safety: () => import('./safety.js'),
  wellbeing: () => import('./wellbeing.js'),
  prevention: () => import('./prevention.js'),
};

const loaded = {};
const searchText = {};

const blockText = (b) => (Array.isArray(b.x) ? b.x.join(' ') : b.x);

export async function loadCategory(cat) {
  const loader = LOADERS[cat];
  if (!loader) return {};
  if (!loaded[cat]) {
    const mod = await loader();
    loaded[cat] = mod.BODIES;
    for (const [id, body] of Object.entries(mod.BODIES)) {
      searchText[id] = body.blocks.map(blockText).join(' ').toLowerCase();
    }
  }
  return loaded[cat];
}

export async function loadBody(id, cat) {
  const bodies = await loadCategory(cat);
  return bodies[id] || null;
}

// Warm every category chunk (fired from the Library screen on mount) so search
// can match body text by the time anyone has typed a query. Failures are
// swallowed — search then simply falls back to title/summary matching.
export function warmAll() {
  return Promise.all(Object.keys(LOADERS).map((cat) => loadCategory(cat).catch(() => {})));
}

export const searchTextOf = (id) => searchText[id] || '';
