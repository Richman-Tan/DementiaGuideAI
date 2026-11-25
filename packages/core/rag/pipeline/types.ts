// The contract of the answering pipeline: what goes in, the events that come
// out, and the services it needs. Everything here is plain data and interfaces,
// so the pipeline can run in a server function, in the eval harness or under a
// unit test with nothing but different providers plugged in.

export type Modality = 'text' | 'voice';

/** Why generation ended. `aborted` is the caller cancelling (a barge-in, a closed tab). */
export type StopReason = 'end_turn' | 'max_tokens' | 'refusal' | 'aborted';

export type SafetyLevel = 'none' | 'caution' | 'emergency';

/** The spoken part of an answer, and the rest of it. */
export type Section = 'lead' | 'detail';

/** A knowledge-base passage, as the database search returns it. */
export interface Chunk {
  id: string;
  title: string;
  /** Carer-facing title; `title` stays technical because it also feeds the embedding. */
  display_title?: string | null;
  content: string;
  category?: string | null;
  tags?: string[] | null;
  source_org?: string | null;
  source_url?: string | null;
  document_id?: string | null;
  chunk_level?: string | null;
  similarity?: number;
}

/** A passage the answer actually cited, numbered in order of first use. */
export interface Source {
  num: number;
  id: string;
  title: string;
  org: string | null;
  url: string | null;
  excerpt: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The answer preferences a person chose, in the pipeline's own vocabulary. */
export interface TurnSettings {
  /** The selected avatar's name: who the assistant says it is. */
  assistantName: string;
  responseStyle: 'brief' | 'balanced' | 'detailed' | 'step-by-step';
  jargonMode: 'explain' | 'avoid' | 'ok';
  personality: 'warm' | 'calm' | 'friendly' | 'practical';
  conciseMode: boolean;
  isCaregiverSetup: boolean;
}

export interface TurnInput {
  message: string;
  /** Earlier turns, oldest first. The pipeline keeps only the most recent ones. */
  history: HistoryMessage[];
  modality: Modality;
  settings: TurnSettings;
  /**
   * Passages already retrieved for this message (a prefetch made while the
   * person was still speaking). When present, the retrieval stage is skipped.
   */
  retrieved?: Chunk[] | null;
  signal?: AbortSignal;
}

export type RetrievalMode = 'fresh' | 'prefetched' | 'none' | 'failed';

/** What a client may know about a retrieved passage before the answer cites it. */
export interface RetrievedSummary {
  id: string;
  title: string;
  org: string | null;
  url: string | null;
  similarity: number | null;
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Milliseconds from the start of the turn to each stage boundary that was reached. */
export interface Timings {
  retrievalDone?: number;
  llmSend?: number;
  firstToken?: number;
  streamEnd?: number;
  total: number;
}

export type TurnEvent =
  | {
      type: 'meta';
      pipelineVersion: string;
      promptVersion: string;
      model: string;
      modality: Modality;
    }
  | {
      type: 'retrieval';
      mode: RetrievalMode;
      /** The text that was searched for: the message, or its rewritten stand-alone form. */
      query: string;
      chunks: RetrievedSummary[];
      ms: number;
    }
  | { type: 'safety'; level: SafetyLevel; categories: string[]; source: 'triage' | 'keywords' }
  | { type: 'token'; text: string; section: Section }
  | {
      type: 'final';
      /** The whole answer, with citation markers renumbered [1]…[n] in order of first use. */
      text: string;
      /** The part meant to be spoken, without markers. */
      lead: string;
      sources: Source[];
    }
  | ({ type: 'usage' } & Usage)
  | ({ type: 'timings' } & Timings)
  | { type: 'done'; stopReason: StopReason }
  | { type: 'error'; code: 'generation_failed'; message: string; retryable: boolean };

// ─── Providers ───────────────────────────────────────────────────────────────

export interface SearchRequest {
  embedding: number[];
  /** The query in words, for the keyword half of the hybrid search. */
  queryText: string;
  matchCount: number;
  minSimilarity: number;
  signal?: AbortSignal;
}

/** How hard the model works on an answer; the lever for speed against thoroughness. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface GenerateRequest {
  model: string;
  maxTokens: number;
  effort?: Effort;
  /**
   * Instructions, in two parts so a provider can cache the first: `stable` is
   * the same on every turn of a conversation, `perTurn` may change.
   */
  system: { stable: string; perTurn: string };
  history: HistoryMessage[];
  /** The person's own words. */
  question: string;
  /** The question together with the labelled passages, as one user message. */
  userText: string;
  passages: Chunk[];
  signal?: AbortSignal;
}

export type GenerateEvent =
  | { type: 'text'; text: string }
  | ({ type: 'usage' } & Usage)
  | { type: 'stop'; reason: Exclude<StopReason, 'aborted'> };

export interface TriageResult {
  level: SafetyLevel;
  categories: string[];
}

export interface Providers {
  embed(
    text: string,
    opts: { inputType: 'query' | 'document'; signal?: AbortSignal }
  ): Promise<number[]>;
  search(request: SearchRequest): Promise<Chunk[]>;
  generate(request: GenerateRequest): AsyncIterable<GenerateEvent>;
  /** Reorders candidates by relevance to the query. Optional. */
  rerank?(query: string, chunks: Chunk[], opts: { signal?: AbortSignal }): Promise<Chunk[]>;
  /** Turns a follow-up ("what about at night?") into a stand-alone question. Optional. */
  rewrite?(
    message: string,
    history: HistoryMessage[],
    opts: { signal?: AbortSignal }
  ): Promise<string>;
  /**
   * Judges whether the message describes an emergency. Optional; it must
   * enforce `timeoutMs` itself, because the pipeline waits for it.
   */
  triage?(
    message: string,
    history: HistoryMessage[],
    opts: { signal?: AbortSignal; timeoutMs: number }
  ): Promise<TriageResult>;
  /** A clock in milliseconds; injected so tests control time. */
  now(): number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** How a prompt version presents instructions and passages to the model. */
export interface PromptAdapter {
  version: string;
  system(settings: TurnSettings, modality: Modality): { stable: string; perTurn: string };
  user(question: string, passages: Chunk[]): string;
  /** True when answers separate a spoken lead from the detail with SECTION_DELIMITER. */
  sections: boolean;
}

export interface RetrievalConfig {
  topK: number;
  /** Fetch topK × this many candidates before the source-family cap is applied. */
  oversample: number;
  minSimilarity: number;
  maxPerSourceFamily: number;
}

export interface GenerationConfig {
  model: string;
  maxTokens: number;
  effort?: Effort;
}

export interface PipelineConfig {
  /** Stamped on every trace and eval result, so a number can be tied to the code that produced it. */
  pipelineVersion: string;
  generation: Record<Modality, GenerationConfig>;
  retrieval: RetrievalConfig;
  maxHistory: number;
  prompt: PromptAdapter;
  triageTimeoutMs: number;
}
