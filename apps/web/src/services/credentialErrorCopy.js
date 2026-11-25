// One wording for credential and quota failures, wherever a turn fails (chat or
// voice), keyed on the error's name. Returns null for anything else, so callers
// keep their own fallback copy.
import { markAccessRejected } from '../state/accessStore.js';

// A turn the server refused (services/turnClient.js), by its reason code. The
// limits reset at 00:00 UTC, which is midday or 1 pm in New Zealand.
const TURN_COPY = {
  visitor_limit:
    'You have reached today’s limit for the live demo. It resets around midday NZ time.',
  demo_limit: 'The live demo has reached today’s limit. It resets around midday NZ time.',
  unavailable: 'The assistant is temporarily unavailable. Please try again shortly.',
  message_too_long: 'That message is too long to send. Please shorten it and try again.',
  no_session: 'Your session could not be started. Reload the page and try again.',
};

function turnErrorCopy(err) {
  if (TURN_COPY[err.code]) return TURN_COPY[err.code];
  if (err.status === 401) return 'Your session has expired. Reload the page and try again.';
  if (err.status === 503) return TURN_COPY.unavailable;
  return null;
}

export function credentialErrorCopy(err) {
  switch (err?.name) {
    case 'TurnRequestError':
      return turnErrorCopy(err);
    case 'StudyAccessError':
      // A 401 only comes back from the proxy, which is only used with a guest code.
      markAccessRejected();
      return 'Your access code is no longer accepted — update it in Settings.';
    case 'StudyLimitError':
      // The proxy's meter resets at 00:00 UTC, which is midday or 1 pm in New Zealand.
      return 'Today’s limit for this access code has been reached. It resets around midday NZ time.';
    case 'OpenAIAuthError':
      return 'Your OpenAI API key looks invalid — check it in Settings → Advanced.';
    case 'OpenAIRateLimitError':
      return 'The AI service is rate-limited right now — wait a moment and retry.';
    default:
      return null;
  }
}
