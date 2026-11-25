// The words being said, as they are said: the browser's speech recogniser, run
// continuously for as long as the conversation's microphone is open.
//
// `onText` receives everything heard since the last `reset()`. The recogniser
// ends its own sessions now and then (after a silence, or a minute or so);
// each time, a new one is started, so listening carries on.
//
// The recogniser is not available in every browser. Where it is missing the
// conversational mode is not offered and the tap-to-talk voice mode is used.
const Recogniser = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const liveWordsAvailable = () => typeof window !== 'undefined' && !!Recogniser();

// 'no-speech' and 'aborted' are how the recogniser reports silence and a reset.
const ROUTINE = ['no-speech', 'aborted'];
const DENIED = ['not-allowed', 'service-not-allowed'];

export function startLiveWords({ onText, onError, lang = 'en-NZ' }) {
  let active = true;
  let current = null;

  const begin = () => {
    const rec = new (Recogniser())();
    current = rec;
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (event) => {
      if (rec !== current) return; // from a session that has been reset
      let text = '';
      for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript;
      onText(text.trim());
    };
    rec.onerror = (event) => {
      if (rec !== current || ROUTINE.includes(event.error)) return;
      if (DENIED.includes(event.error)) {
        active = false;
        const e = new Error('Microphone permission denied');
        e.code = 'permission-denied';
        onError?.(e);
      } else {
        onError?.(new Error(`speech recognition error: ${event.error}`));
      }
    };
    // Each session's ending starts the next: its own, or the one a reset asked for.
    rec.onend = () => {
      if (active && (rec === current || current === null)) begin();
    };
    try {
      rec.start();
    } catch (err) {
      active = false;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };
  begin();

  const end = (rec) => {
    try {
      rec.abort();
    } catch {
      /* not started */
    }
  };

  return {
    /** Forget what has been heard: later text starts from here. */
    reset() {
      if (!active || !current) return;
      const old = current;
      current = null; // its results are dropped from now; its ending starts the next
      end(old);
    },
    stop() {
      if (!active) return;
      active = false;
      const old = current;
      current = null;
      if (old) end(old);
    },
  };
}
