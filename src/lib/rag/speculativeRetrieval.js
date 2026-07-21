// Speculative RAG: start retrieval on a stabilized live-STT partial WHILE the
// user is still talking, so the embedding + vector-search round trips are done
// (or in flight) by the time the final transcript arrives.
//
// Reuse is decided LEXICALLY (token Jaccard / prefix growth), not by embedding
// similarity — an embedding comparison would itself cost the round trip we're
// saving, and since the speculative query and the final transcript come from
// the same utterance, token overlap is a faithful proxy. Retrieval is
// chunk-level and robust to a trailing clause.
//
// The retrieved chunks flow into the EXACT same prompt construction
// (buildUserContent / citations) via chatStream's preRetrievedChunks option —
// safety and citation behaviour are byte-identical to a normal turn.

import {
  SPECULATIVE_STABLE_MS,
  SPECULATIVE_MIN_WORDS,
  SPECULATIVE_MAX_FIRES,
  SPECULATIVE_REUSE_JACCARD,
} from '@/lib/voice/voiceConfig';

const tokenize = (text) =>
  text.toLowerCase().replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean);

function jaccard(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Speculative text still "covers" the final if it's a token-prefix that grew ≤25%. */
function isPrefixWithinGrowth(specText, finalText) {
  const spec = tokenize(specText);
  const fin = tokenize(finalText);
  if (!spec.length || spec.length > fin.length) return false;
  for (let i = 0; i < spec.length; i++) {
    if (spec[i] !== fin[i]) return false;
  }
  return finalText.length <= specText.length * 1.25;
}

/**
 * @param {{ search: (query: string) => Promise<Array> }} deps
 *   search — bound retrieval function (openaiService.search). Its own
 *   timeouts (embed 5s / RPC 4s) bound the cost of a wasted fire.
 */
export function createSpeculativeRag({ search }) {
  let cancelled = false;
  let fires = 0;
  let timer = null;
  let lastText = '';
  let current = null; // { queryText, promise } — promise resolves to chunks|null

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  const fire = (text) => {
    if (cancelled || fires >= SPECULATIVE_MAX_FIRES) return;
    // Don't refire when the stabilized text is still close to the in-flight
    // query — the existing result will pass the reuse gate anyway.
    if (current && jaccard(tokenize(current.queryText), tokenize(text)) >= SPECULATIVE_REUSE_JACCARD) return;
    fires++;
    const startedAt = Date.now();
    current = {
      queryText: text,
      promise: search(text)
        .then((chunks) => {
          console.log(`[RAG] speculative fire #${fires} done ms=${Date.now() - startedAt} chunks=${chunks?.length ?? 0}`);
          return chunks;
        })
        .catch((err) => {
          console.warn(`[RAG] speculative fire failed: ${err?.message ?? err}`);
          return null; // a failed fire is just a miss
        }),
    };
  };

  return {
    /** Feed every live-STT partial. Fires after the text stops changing. */
    onPartial(text) {
      if (cancelled || !text || text === lastText) return;
      lastText = text;
      clearTimer();
      if (tokenize(text).length < SPECULATIVE_MIN_WORDS) return;
      timer = setTimeout(() => fire(lastText), SPECULATIVE_STABLE_MS);
    },

    /**
     * Decide reuse against the final transcript.
     * @returns {Promise<{ chunks: Array|null, status: 'hit'|'miss'|'none' }>}
     *   chunks is null unless status === 'hit'.
     */
    async resolve(finalText) {
      clearTimer();
      if (cancelled || !current) return { chunks: null, status: 'none' };
      const specTokens = tokenize(current.queryText);
      const finalTokens = tokenize(finalText);
      const overlap = jaccard(specTokens, finalTokens);
      const reusable =
        overlap >= SPECULATIVE_REUSE_JACCARD || isPrefixWithinGrowth(current.queryText, finalText);
      if (!reusable) {
        console.log(`[RAG] speculative miss (jaccard=${overlap.toFixed(2)})`);
        return { chunks: null, status: 'miss' };
      }
      const chunks = await current.promise;
      if (!chunks) return { chunks: null, status: 'miss' };
      console.log(`[RAG] speculative hit (jaccard=${overlap.toFixed(2)}) — retrieval off the hot path`);
      return { chunks, status: 'hit' };
    },

    cancel() {
      cancelled = true;
      clearTimer();
      current = null;
    },
  };
}
