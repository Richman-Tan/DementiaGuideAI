// Single source of truth for RAG pipeline configuration.
//
// Plain CommonJS on purpose: this module is consumed by the React Native app
// (Metro), by Jest, and by the Node .mjs scripts under scripts/ (via CJS
// named-export interop) — so it must not import React Native modules and must
// not use ESM syntax. Change values here, never in per-script copies.

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims — must match knowledge_chunks.embedding
const CHAT_MODEL = 'gpt-4o';
const MIN_SIMILARITY = 0.25;
const TOP_K = 5;
const MAX_HISTORY = 6;

// Retrieval rebalance: the knowledge base is dominated by one bulk source (the
// WHO/NZ iSupport chunks), which can monopolise the top-K and crowd out
// hand-authored chunks. Over-fetch, then cap that source family before taking K.
// See docs/report/rag_retrieval_rebalance_plan.md.
const RETRIEVAL_OVERSAMPLE = 10; // fetch TOP_K * this many candidates
const MAX_PER_SOURCE_FAMILY = 2; // max chunks from a single bulk source in the final K

// Prompt/pipeline behaviour flags. Flipping PROMPT_VERSION back to 'v1' is the
// one-line rollback for the NZ/safety prompt.
const PROMPT_VERSION = 'v2-nz-safety';
const CITATION_MODE = 'trailing'; // 'trailing' (Sources: list) | 'inline' ([S1] markers)
const RERANK_MODE = 'none'; // 'none' | 'llm' (experimental, eval-gated)

// Valid knowledge-base category slugs (as they exist in the live DB).
const CATEGORIES = [
  'caregiving',
  'clinical',
  'communication',
  'best-practices',
  'home-safety',
  'prevention',
  'wellbeing',
  'isupport-course',
];

const GENERATION_TEMPERATURE = 0.7;

function maxTokensForStyle(responseStyle, conciseMode) {
  return conciseMode || responseStyle === 'brief' ? 300
       : responseStyle === 'detailed' ? 900
       : responseStyle === 'step-by-step' ? 700
       : 600;
}

module.exports = {
  EMBEDDING_MODEL,
  CHAT_MODEL,
  MIN_SIMILARITY,
  TOP_K,
  MAX_HISTORY,
  RETRIEVAL_OVERSAMPLE,
  MAX_PER_SOURCE_FAMILY,
  PROMPT_VERSION,
  CITATION_MODE,
  RERANK_MODE,
  CATEGORIES,
  GENERATION_TEMPERATURE,
  maxTokensForStyle,
};
