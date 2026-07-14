// Shared domain types for the integration/service layer.

/** A single knowledge-base passage as stored in Supabase `knowledge_chunks`. */
export interface KnowledgeChunk {
  id: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  source_url: string | null;
  source_org: string | null;
  /** Cosine similarity, present only on RAG search results. */
  similarity?: number;
}

/** A source citation surfaced with a chat answer. */
export interface Source {
  title: string;
  url: string | null;
  org: string | null;
}

/** Viseme timeline produced by the TTS providers and consumed by the avatar WebView. */
export interface VisemeTimeline {
  frames: unknown[];
}

export interface TtsOptions {
  speechRate?: number;
  voice?: string | null;
  visemeWeights?: Record<string, number> | null;
}

export interface TtsResult {
  /** base64 data URI of the audio. */
  audio: string;
  /** Alignment data for lip-sync, or null when the provider gives none. */
  visemeTimeline: VisemeTimeline | null;
}

/** Raw output of a single alignment-capable TTS provider (Azure / ElevenLabs). */
export interface TtsProviderResult {
  audioBase64: string;
  visemeTimeline: VisemeTimeline | null;
}

// Contracts for the provider modules that are still authored in JS (staged for a
// later TS wave). ttsService casts the imported singletons to these so its own
// types stay sound without waiting on the provider conversions.
export interface AzureTtsService {
  hasCredentials(): Promise<boolean>;
  ttsWithAlignment(
    text: string,
    speechRate: number,
    visemeWeights: Record<string, number> | null,
    voice: string | null
  ): Promise<TtsProviderResult>;
}

export interface ElevenLabsService {
  hasApiKey(): Promise<boolean>;
  ttsWithAlignment(
    text: string,
    voice: string | null | undefined,
    speechRate: number,
    visemeWeights: Record<string, number> | null
  ): Promise<TtsProviderResult>;
}

export interface OpenAITtsService {
  tts(text: string, voice?: string): Promise<string>;
}
