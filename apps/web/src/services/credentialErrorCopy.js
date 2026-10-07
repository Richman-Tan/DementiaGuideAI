// One wording for credential and quota failures, wherever a turn fails (chat or
// voice), keyed on the error's name and on which credential was in use. Returns
// null for anything else, so callers keep their own fallback copy.
import { markAccessRejected } from '../state/accessStore.js';

export function credentialErrorCopy(err, kind) {
  switch (err?.name) {
    case 'StudyAccessError':
      if (kind === 'guest') {
        markAccessRejected();
        return 'Your access code is no longer accepted — update it in Settings.';
      }
      return 'Your study access code was not accepted — check the code in your invitation email.';
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
