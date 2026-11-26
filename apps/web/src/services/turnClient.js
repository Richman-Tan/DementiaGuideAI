// The assistant, on the server.
//
// With VITE_TURN_ENDPOINT=on a chat turn is one request to POST /api/turn: the
// server retrieves, writes and cites the answer on its own keys and streams the
// result back. Nothing here holds a model key or builds a prompt, and a visitor
// needs nothing but the anonymous session the app already gives them.
//
// serverGenerate has the same contract as the client-side realGenerate it
// replaces, so the chat screen does not know which one answered.
import {
  fitHistory,
  streamTurn,
  TURN_LIMITS,
  TurnRequestError,
} from '@core/rag/client/turnStream.ts';
import { mapSettingsToRag } from '../state/mapSettingsToRag.js';
import { apiUrl } from './apiBase.js';
import { mapSourcesToCitations } from './sourceCitations.js';
import { supabase } from './supabase.js';

export const serverPipelineEnabled = () => import.meta.env.VITE_TURN_ENDPOINT === 'on';

// What is shown when the model declines to answer. The help callout does not
// depend on it: that comes from the server's own safety verdict.
export const DECLINED_TEXT =
  'I was not able to answer that. You could try asking it in a different way.';

const AVATARS = ['aaron', 'ariana'];
const PERSONALITIES = ['warm', 'calm', 'friendly', 'practical'];

/**
 * The app's settings in the words the endpoint accepts. It refuses any value it
 * does not know, so anything unexpected in stored settings becomes the default.
 */
export function turnOptions(settings = {}) {
  const rag = mapSettingsToRag(settings);
  return {
    avatar: AVATARS.includes(settings.avatarId) ? settings.avatarId : 'aaron',
    settings: {
      responseStyle: rag.responseStyle,
      jargonMode: rag.jargonMode,
      personality: PERSONALITIES.includes(rag.ariaPersonality) ? rag.ariaPersonality : 'warm',
      conciseMode: rag.conciseMode,
      isCaregiverSetup: rag.isCaregiversSetup,
    },
  };
}

/** Earlier turns as the endpoint wants them, without the question being asked now. */
function earlierTurns(history, question) {
  const turns = (history || [])
    .filter((m) => m.text && !m.streaming)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  // The chat appends the new question before asking; it travels as `message`.
  const last = turns[turns.length - 1];
  if (last && last.role === 'user' && last.content === question) turns.pop();
  return fitHistory(turns);
}

export async function serverGenerate({
  question,
  settings,
  history,
  signal,
  onToken,
  onLeadToken,
  onLeadEnd,
  onStage,
  modality = 'text',
}) {
  if (question.length > TURN_LIMITS.messageChars) {
    throw new TurnRequestError('the message is too long', 400, 'message_too_long');
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new TurnRequestError('no session', 401, 'no_session');

  let lead = '';
  let detail = '';
  let final = null;
  let safety = 'none';
  // Tells a caller that speaks the lead that it has all of it, as soon as that
  // is known: the detail has begun, or the answer has ended without any. The
  // lead's last sentence has nothing after it to mark its end otherwise, and
  // would wait for the whole answer.
  let leadOpen = true;
  const endLead = () => {
    if (!leadOpen) return;
    leadOpen = false;
    onLeadEnd?.();
  };
  const events = streamTurn({
    url: apiUrl('/api/turn'),
    token,
    signal,
    body: {
      message: question,
      history: earlierTurns(history, question),
      modality,
      ...turnOptions(settings),
    },
  });
  for await (const event of events) {
    if (event.type === 'retrieval') {
      // The server retrieves and then calls the model at once, so one event
      // marks both stage boundaries on this side of the network.
      onStage?.('ragDone');
      onStage?.('llmSend');
    } else if (event.type === 'token') {
      onStage?.('firstToken');
      if (event.section === 'lead') {
        lead += event.text;
        // The part worth saying aloud, piece by piece, for a caller that speaks it.
        onLeadToken?.(event.text);
      } else {
        endLead();
        detail += event.text;
      }
      onToken(detail ? `${lead.trimEnd()}\n\n${detail}` : lead);
    } else if (event.type === 'safety') {
      safety = event.level;
    } else if (event.type === 'final') {
      endLead();
      final = event;
    } else if (event.type === 'error') {
      throw new TurnRequestError(event.message, 0, event.code);
    }
  }

  // No final answer means the model declined. The person keeps the safety
  // verdict, so the help callout still shows when it should.
  return {
    text: final ? final.text : DECLINED_TEXT,
    lead: final ? final.lead : '',
    citations: mapSourcesToCitations(final?.sources),
    sources: final?.sources || [],
    safety: safety !== 'none',
    safetyLevel: safety,
  };
}
