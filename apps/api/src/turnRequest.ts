// The body of a turn request, checked. Everything a caller sends is validated
// against a fixed set of values or a size limit before it reaches the model:
// the limits bound what one request can cost, and the fixed sets mean no
// caller-supplied text ends up in the instructions.
import type {
  HistoryMessage,
  Modality,
  TurnSettings,
} from '../../../packages/core/rag/pipeline/types.ts';
import { TURN_LIMITS } from '../../../packages/core/rag/client/turnStream.ts';

/** The assistant's name comes from the avatar chosen, never from the request as text. */
export const AVATAR_NAMES = { aaron: 'Aaron', ariana: 'Ariana' } as const;

/** The request's size limits, shared with the clients so they can stay within them. */
export const LIMITS = TURN_LIMITS;

export interface TurnRequest {
  message: string;
  history: HistoryMessage[];
  modality: Modality;
  settings: TurnSettings;
}

export type Parsed = { ok: true; value: TurnRequest } | { ok: false; error: string };

const RESPONSE_STYLES = ['brief', 'balanced', 'detailed', 'step-by-step'] as const;
const JARGON_MODES = ['explain', 'avoid', 'ok'] as const;
const PERSONALITIES = ['warm', 'calm', 'friendly', 'practical'] as const;

const fail = (error: string): Parsed => ({ ok: false, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One of the allowed values, or the default when the field is absent. Anything else is an error. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T | null {
  if (value === undefined) return fallback;
  return allowed.includes(value as T) ? (value as T) : null;
}

function flag(value: unknown, fallback: boolean): boolean | null {
  if (value === undefined) return fallback;
  return typeof value === 'boolean' ? value : null;
}

export function parseTurnRequest(raw: unknown): Parsed {
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return fail('the request body is not valid JSON');
    }
  }
  if (!isRecord(body)) return fail('the request body must be a JSON object');

  if (typeof body.message !== 'string' || !body.message.trim()) return fail('message is required');
  const message = body.message.trim();
  if (message.length > LIMITS.messageChars)
    return fail(`message is longer than ${LIMITS.messageChars} characters`);

  const rawHistory = body.history ?? [];
  if (!Array.isArray(rawHistory)) return fail('history must be a list');
  if (rawHistory.length > LIMITS.historyMessages)
    return fail(`history has more than ${LIMITS.historyMessages} messages`);
  const history: HistoryMessage[] = [];
  let historyChars = 0;
  for (const item of rawHistory) {
    if (
      !isRecord(item) ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.content !== 'string'
    ) {
      return fail('each history message needs a role of "user" or "assistant" and text content');
    }
    if (item.content.length > LIMITS.historyMessageChars) {
      return fail(`a history message is longer than ${LIMITS.historyMessageChars} characters`);
    }
    historyChars += item.content.length;
    history.push({ role: item.role, content: item.content });
  }
  if (historyChars > LIMITS.historyChars)
    return fail(`history is longer than ${LIMITS.historyChars} characters in total`);

  const modality = oneOf(body.modality, ['text', 'voice'] as const, 'text');
  if (!modality) return fail('modality must be "text" or "voice"');

  const avatar = oneOf(
    body.avatar,
    Object.keys(AVATAR_NAMES) as (keyof typeof AVATAR_NAMES)[],
    'aaron'
  );
  if (!avatar) return fail('avatar is not one of the available avatars');

  const chosen = body.settings ?? {};
  if (!isRecord(chosen)) return fail('settings must be an object');
  const responseStyle = oneOf(chosen.responseStyle, RESPONSE_STYLES, 'balanced');
  const jargonMode = oneOf(chosen.jargonMode, JARGON_MODES, 'explain');
  const personality = oneOf(chosen.personality, PERSONALITIES, 'warm');
  const conciseMode = flag(chosen.conciseMode, false);
  const isCaregiverSetup = flag(chosen.isCaregiverSetup, false);
  if (!responseStyle) return fail('settings.responseStyle is not a known value');
  if (!jargonMode) return fail('settings.jargonMode is not a known value');
  if (!personality) return fail('settings.personality is not a known value');
  if (conciseMode === null) return fail('settings.conciseMode must be true or false');
  if (isCaregiverSetup === null) return fail('settings.isCaregiverSetup must be true or false');

  return {
    ok: true,
    value: {
      message,
      history,
      modality,
      settings: {
        assistantName: AVATAR_NAMES[avatar],
        responseStyle,
        jargonMode,
        personality,
        conciseMode,
        isCaregiverSetup,
      },
    },
  };
}
