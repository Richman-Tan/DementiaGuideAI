// One evaluation answer: a labelled question run through the real pipeline and
// recorded in the shape the existing checkers and judges read
// (scripts/eval/safety-checks.mjs, judge.mjs, grade-groundedness.mjs). A run of
// the new pipeline can then be scored by the same tools, on the same questions,
// as the saved runs of the old one.
//
// It calls runTurn, the function the server calls, so nothing here can make an
// evaluated answer differ from a shipped one except the providers and config
// the caller passes in.
import { retrieve } from '../pipeline/retrieve.ts';
import { runTurn } from '../pipeline/runTurn.ts';
import type {
  Chunk,
  Modality,
  PipelineConfig,
  Providers,
  SafetyLevel,
  StopReason,
  Timings,
  TurnSettings,
  Usage,
} from '../pipeline/types.ts';

export interface EvalQuestion {
  id: string;
  set: string;
  category?: string;
  /** Poisoned passages appended to the retrieved ones (the indirect-injection set). */
  injectedPassages?: { title: string; content: string; source_org?: string }[];
}

/** What the old harness used: the app's default answer settings, not set up as a carer. */
export const EVAL_SETTINGS: TurnSettings = {
  assistantName: 'Aaron',
  responseStyle: 'balanced',
  jargonMode: 'explain',
  personality: 'warm',
  conciseMode: false,
  isCaregiverSetup: false,
};

export interface EvalRow {
  id: string;
  set: string;
  category: string | null;
  question: string;
  sample: number;
  retrievalMode: 'pipeline' | 'none';
  injected: boolean;
  /** The passages supplied, in the order they were labelled [S1]…: the checkers count markers against this. */
  retrieved: { id: string; similarity: number | null }[];
  /** The whole answer with the model's own [S#] markers. Empty after a refusal. */
  answer: string;
  /** The part that would be spoken. */
  lead: string;
  finishReason: 'stop' | 'length' | 'refusal';
  promptTokens: number | null;
  completionTokens: number | null;
  /** Kept for the old file format; Claude reports none. */
  systemFingerprint: null;
  safety: { level: SafetyLevel; categories: string[]; source: 'triage' | 'keywords' } | null;
  timings: Timings | null;
  usage: Usage | null;
}

export interface EvalRunOptions {
  question: EvalQuestion;
  /** The wording to ask (a question can have more than one). */
  text: string;
  sample?: number;
  providers: Providers;
  config: PipelineConfig;
  settings?: TurnSettings;
  modality?: Modality;
  /** False runs the question with no passages at all (the no-retrieval ablation). */
  useRetrieval?: boolean;
  includeInjected?: boolean;
}

const FINISH: Record<Exclude<StopReason, 'aborted'>, EvalRow['finishReason']> = {
  end_turn: 'stop',
  max_tokens: 'length',
  refusal: 'refusal',
};

export async function runEvalQuestion({
  question,
  text,
  sample = 0,
  providers,
  config,
  settings = EVAL_SETTINGS,
  modality = 'text',
  useRetrieval = true,
  includeInjected = true,
}: EvalRunOptions): Promise<EvalRow> {
  // Retrieval runs here, not inside the turn, so that a failure stops the run.
  // In the product a failed search degrades to an answer without passages; in
  // an evaluation that would be scored as if retrieval had found nothing.
  const found = useRetrieval ? await retrieve(text, providers, config.retrieval) : [];
  const injected: Chunk[] = includeInjected
    ? (question.injectedPassages ?? []).map((passage, k) => ({
        id: `INJECT:${question.id}:${k}`,
        title: passage.title,
        content: passage.content,
        source_org: passage.source_org ?? 'Injected test passage',
      }))
    : [];
  const passages = [...found, ...injected];

  const row: EvalRow = {
    id: question.id,
    set: question.set,
    category: question.category ?? null,
    question: text,
    sample,
    retrievalMode: useRetrieval ? 'pipeline' : 'none',
    injected: injected.length > 0,
    retrieved: passages.map((c) => ({ id: c.id, similarity: c.similarity ?? null })),
    answer: '',
    lead: '',
    finishReason: 'stop',
    promptTokens: null,
    completionTokens: null,
    systemFingerprint: null,
    safety: null,
    timings: null,
    usage: null,
  };

  for await (const event of runTurn(
    { message: text, history: [], modality, settings, retrieved: passages },
    providers,
    config
  )) {
    if (event.type === 'final') {
      row.answer = event.marked;
      row.lead = event.lead;
    } else if (event.type === 'safety') {
      row.safety = { level: event.level, categories: event.categories, source: event.source };
    } else if (event.type === 'usage') {
      const { type: _type, ...usage } = event;
      row.usage = usage;
      row.promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
      row.completionTokens = usage.outputTokens;
    } else if (event.type === 'timings') {
      const { type: _type, ...timings } = event;
      row.timings = timings;
    } else if (event.type === 'done') {
      if (event.stopReason === 'aborted') throw new Error(`${question.id}: the turn was aborted`);
      row.finishReason = FINISH[event.stopReason];
    } else if (event.type === 'error') {
      throw new Error(`${question.id}: ${event.message}`);
    }
  }
  return row;
}

// Prices and the cost of an answer live with the pipeline now; re-exported so
// the evaluation tools keep one import.
export { costUsd } from '../prices.ts';
export type { Price } from '../prices.ts';
