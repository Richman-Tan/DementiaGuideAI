// The pipeline's model calls, made through the Anthropic SDK.
//
// Three providers: `generate` writes the answer, `triage` judges whether the
// message describes an emergency, `rewrite` turns a follow-up into a
// stand-alone search query. Each takes the SDK client as an argument, so this
// module imports only its types: the server and the eval harness construct the
// client (and hold the key), and nothing here ends up in an app bundle.
import type Anthropic from '@anthropic-ai/sdk';
import type {
  GenerateEvent,
  GenerateRequest,
  HistoryMessage,
  Providers,
  SafetyLevel,
  StopReason,
  TriageResult,
  Usage,
} from '../pipeline/types.ts';

// A safety classifier can decline a request (stop_reason "refusal"). On these
// models the API can retry a declined request on another model inside the same
// call; "default" lets Anthropic choose the model for the refusal category. A
// care assistant gets questions about medication, self-harm and injury, which
// is exactly where a false positive would otherwise leave a carer with nothing.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const SERVER_SIDE_FALLBACK = new Set([
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/** The small, fast model used for the two helper calls. */
export const HELPER_MODEL = 'claude-haiku-5-5';

// Thinking can be switched off on Haiku, and a one-line classification or
// rewrite has no use for it. Opus 5.5 and Sonnet 5.5 reject the setting.
const withoutThinking = (model: string) =>
  model.startsWith('claude-haiku-') ? { thinking: { type: 'disabled' as const } } : {};

const mapStop = (reason: string | null): Exclude<StopReason, 'aborted'> => {
  if (reason === 'refusal') return 'refusal';
  if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'max_tokens';
  return 'end_turn';
};

interface AttemptUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Tokens for the whole request. After a fallback the top-level usage covers
 * only the attempt that produced the answer; `iterations` lists every attempt,
 * and each one is billed.
 */
function totalUsage(
  model: string,
  usage: AttemptUsage & { iterations?: AttemptUsage[] | null }
): Usage {
  const attempts = usage.iterations?.length ? usage.iterations : [usage];
  const sum = (pick: (u: AttemptUsage) => number | null | undefined) =>
    attempts.reduce((total, attempt) => total + (pick(attempt) ?? 0), 0);
  return {
    model,
    inputTokens: sum((u) => u.input_tokens),
    outputTokens: sum((u) => u.output_tokens),
    cacheReadTokens: sum((u) => u.cache_read_input_tokens),
    cacheWriteTokens: sum((u) => u.cache_creation_input_tokens),
  };
}

export function createClaudeGenerate(client: Anthropic): Providers['generate'] {
  return async function* generate(request: GenerateRequest): AsyncGenerator<GenerateEvent> {
    const stream = client.beta.messages.stream(
      {
        model: request.model,
        max_tokens: request.maxTokens,
        // The stable instructions come first and carry the cache breakpoint; the
        // per-turn ones follow it, so changing them does not invalidate the cache.
        system: [
          { type: 'text', text: request.system.stable, cache_control: { type: 'ephemeral' } },
          ...(request.system.perTurn
            ? [{ type: 'text' as const, text: request.system.perTurn }]
            : []),
        ],
        messages: [
          ...request.history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: request.userText },
        ],
        ...(request.effort ? { output_config: { effort: request.effort } } : {}),
        ...(SERVER_SIDE_FALLBACK.has(request.model)
          ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const }
          : {}),
      },
      request.signal ? { signal: request.signal } : undefined
    );

    // After a fallback the same stream carries on from the other model, and
    // text already received stays valid, so deltas are simply passed through.
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }
    const message = await stream.finalMessage();
    yield { type: 'usage', ...totalUsage(message.model, message.usage) };
    yield { type: 'stop', reason: mapStop(message.stop_reason) };
  };
}

// ─── Helper calls ────────────────────────────────────────────────────────────

const HISTORY_TURNS = 6;
const HISTORY_CHARS = 600;

/** The recent conversation and the new message, as one block of text for a helper call. */
function conversationText(message: string, history: HistoryMessage[]): string {
  const recent = history.slice(-HISTORY_TURNS).map((m) => {
    const who = m.role === 'user' ? 'Carer' : 'Assistant';
    const text =
      m.content.length > HISTORY_CHARS ? `${m.content.slice(0, HISTORY_CHARS)}…` : m.content;
    return `${who}: ${text}`;
  });
  const earlier = recent.length ? `<conversation>\n${recent.join('\n')}\n</conversation>\n\n` : '';
  return `${earlier}<latest_message>\n${message}\n</latest_message>`;
}

function textOf(response: {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}): string {
  if (response.stop_reason === 'refusal') throw new Error('the model declined the request');
  return response.content.find((block) => block.type === 'text')?.text ?? '';
}

export const TRIAGE_CATEGORIES = [
  'stroke',
  'unresponsive',
  'breathing',
  'chest_pain',
  'fall_injury',
  'poisoning',
  'self_harm',
  'missing_person',
  'violence',
  'other',
] as const;

const LEVELS: readonly SafetyLevel[] = ['none', 'caution', 'emergency'];

export const TRIAGE_PROMPT_VERSION = 'triage-v1';

const TRIAGE_SYSTEM = `You are the safety check for DementiaGuide, an assistant for people in New Zealand who care for someone living with dementia. Another model writes the answer to the carer. Your only job is to judge, from the carer's latest message, whether someone may be in danger right now, so that the app can show a help card with the right phone numbers beside the answer. Earlier messages are context for understanding the latest one.

Choose one level:

- emergency: the message describes something that may need emergency services now. That covers signs of a stroke (sudden facial droop, arm weakness, slurred speech), a person who is unresponsive or hard to wake, trouble breathing or choking, chest pain, a fall with a possible injury, swallowing something harmful or taking too much medication, and thoughts of suicide or self-harm, whether the carer's or the person's they care for.
- caution: a serious situation that is not clearly an emergency in progress. The person is missing or has wandered off, there is aggression or violence or the carer feels unsafe, there is a sudden change such as new severe confusion, or the carer sounds at the end of their tether.
- none: everything else. That includes general questions about these topics, things that happened in the past and are over, and hypotheticals such as "what should I do if he falls?".

Judge what is happening, not which words appear. "She only eats white bread" is none. "Mum is on the floor and can't get up" is an emergency although it names no condition. When you cannot tell whether something is happening now, choose the higher level: a help card shown unnecessarily costs little, and a missed emergency costs a great deal.

For categories, list each that applies from: ${TRIAGE_CATEGORIES.join(', ')}. Use an empty list when the level is none.`;

const TRIAGE_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      level: { type: 'string', enum: [...LEVELS] },
      categories: { type: 'array', items: { type: 'string', enum: [...TRIAGE_CATEGORIES] } },
    },
    required: ['level', 'categories'],
    additionalProperties: false,
  },
};

/** Reads the model's JSON, refusing anything outside the schema rather than guessing. */
export function parseTriage(text: string): TriageResult {
  const value: unknown = JSON.parse(text);
  const { level, categories } = (value ?? {}) as { level?: unknown; categories?: unknown };
  if (
    typeof level !== 'string' ||
    !LEVELS.includes(level as SafetyLevel) ||
    !Array.isArray(categories)
  ) {
    throw new Error('triage reply did not match the expected shape');
  }
  const known = new Set<string>(TRIAGE_CATEGORIES);
  return {
    level: level as SafetyLevel,
    categories: categories.filter((c): c is string => typeof c === 'string' && known.has(c)),
  };
}

export function createClaudeTriage(
  client: Anthropic,
  { model = HELPER_MODEL }: { model?: string } = {}
): NonNullable<Providers['triage']> {
  return async (message, history, { signal, timeoutMs }) => {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        ...withoutThinking(model),
        output_config: { effort: 'low', format: TRIAGE_FORMAT },
        system: TRIAGE_SYSTEM,
        messages: [{ role: 'user', content: conversationText(message, history) }],
      },
      // One attempt, inside the time the pipeline allows: a late verdict is no
      // better than none, and the keyword floor covers a failure.
      { timeout: timeoutMs, maxRetries: 0, ...(signal ? { signal } : {}) }
    );
    return parseTriage(textOf(response));
  };
}

export const REWRITE_PROMPT_VERSION = 'rewrite-v1';

const REWRITE_SYSTEM = `You turn the latest message in a conversation between a carer and a dementia-care assistant into a search query for a library of dementia-care guidance.

Write one stand-alone question that says what the carer is asking, filling in whatever the earlier conversation makes clear: who it is about, which symptom or situation, what time of day. Keep the carer's own words where you can. If the latest message already stands on its own, return it unchanged.

Reply with the question only.`;

const REWRITE_TIMEOUT_MS = 4000;

export function createClaudeRewrite(
  client: Anthropic,
  { model = HELPER_MODEL }: { model?: string } = {}
): NonNullable<Providers['rewrite']> {
  return async (message, history, { signal }) => {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        ...withoutThinking(model),
        output_config: { effort: 'low' },
        system: REWRITE_SYSTEM,
        messages: [{ role: 'user', content: conversationText(message, history) }],
      },
      { timeout: REWRITE_TIMEOUT_MS, maxRetries: 0, ...(signal ? { signal } : {}) }
    );
    return textOf(response).trim();
  };
}
