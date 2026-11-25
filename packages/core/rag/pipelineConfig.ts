// The pipeline's configuration, in one place. The server and the eval harness
// both build their config here, so a setting cannot differ between what is
// evaluated and what ships without the pipeline version changing.
import {
  MAX_HISTORY,
  MAX_PER_SOURCE_FAMILY,
  MIN_SIMILARITY,
  RETRIEVAL_OVERSAMPLE,
  TOP_K,
} from './ragConfig.js';
import { promptV3 } from './pipeline/promptV3.ts';
import type { Effort, PipelineConfig, PromptAdapter } from './pipeline/types.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export interface PipelineOptions {
  model?: string;
  /** How hard the model works on a written answer. */
  textEffort?: Effort;
  /** Lower for speech: the wait before the first word matters more than polish. */
  voiceEffort?: Effort;
  prompt?: PromptAdapter;
  topK?: number;
  /**
   * The similarity floor for a passage to count as a match. The default was
   * chosen for OpenAI's vectors and has to be re-tuned for Voyage's.
   */
  minSimilarity?: number;
}

// A ceiling, not a target. Thinking counts as output, so a tight limit cuts
// answers off mid-thought; how long an answer is comes from the prompt.
const TEXT_MAX_TOKENS = 16000;
const VOICE_MAX_TOKENS = 8000;
const TRIAGE_TIMEOUT_MS = 4000;

/** A short, stable fingerprint of a string (FNV-1a, 32 bits, in base 36). */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function pipelineConfig({
  model = DEFAULT_MODEL,
  textEffort = 'medium',
  voiceEffort = 'low',
  prompt = promptV3,
  topK = TOP_K,
  minSimilarity = MIN_SIMILARITY,
}: PipelineOptions = {}): PipelineConfig {
  const settings = {
    generation: {
      text: { model, maxTokens: TEXT_MAX_TOKENS, effort: textEffort },
      voice: { model, maxTokens: VOICE_MAX_TOKENS, effort: voiceEffort },
    },
    retrieval: {
      topK,
      oversample: RETRIEVAL_OVERSAMPLE,
      minSimilarity,
      maxPerSourceFamily: MAX_PER_SOURCE_FAMILY,
    },
    maxHistory: MAX_HISTORY,
    triageTimeoutMs: TRIAGE_TIMEOUT_MS,
  };
  return {
    ...settings,
    prompt,
    // The prompt's version, then a fingerprint of every other setting: two runs
    // with the same version were configured identically.
    pipelineVersion: `${prompt.version}@${fingerprint(JSON.stringify(settings))}`,
  };
}
