// The spoken conversation as a React hook: the open-microphone, turn-taking
// voice mode. It returns what the voice screen already reads from the
// tap-to-talk hook (useVoiceConversation), so the screen can use either, plus
// the controls only a conversation has.
import { useCallback, useEffect, useRef, useState } from 'react';
import { serverGenerate } from '../services/turnClient.js';
import { tts } from '../services/ttsClient.js';
import { createConversation, INITIAL_SNAPSHOT } from './conversationController.js';
import { startLiveWords } from './liveWords.js';
import { openMicInput } from './micInput.js';

const SERVICES = { openMicInput, startLiveWords, serverGenerate, tts };

/** The screen's four states, from the machine's eight phases. */
export function screenState(snapshot) {
  switch (snapshot.phase) {
    case 'listening':
    case 'userSpeaking':
    case 'endOfTurnCheck':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'bargeInCheck':
      // A sound over a reply: the screen stays as it was until it is known what it is.
      return snapshot.subtitle ? 'speaking' : 'thinking';
    default:
      return 'idle';
  }
}

export function useConversation({ enabled, avatar, settings, messages, appendMessage, muted }) {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const controller = useRef(null);
  // What the controller reads when it needs them, kept current after each render.
  const latest = useRef({ avatar, settings, messages, muted });
  useEffect(() => {
    latest.current = { avatar, settings, messages, muted };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const c = createConversation({
      getAvatar: () => latest.current.avatar,
      getSettings: () => latest.current.settings,
      getMessages: () => latest.current.messages,
      getMuted: () => latest.current.muted,
      appendMessage,
      onChange: setSnapshot,
      services: SERVICES,
    });
    controller.current = c;
    return () => {
      controller.current = null;
      c.dispose();
      setSnapshot(INITIAL_SNAPSHOT);
    };
  }, [enabled, appendMessage]);

  const vState = screenState(snapshot);

  // One button: start talking, say "I'm done", or stop the avatar.
  const micTap = useCallback(() => {
    const c = controller.current;
    if (!c) return;
    const { phase } = c.snapshot;
    if (phase === 'idle' || phase === 'paused') c.start();
    else if (phase === 'userSpeaking' || phase === 'endOfTurnCheck') c.done();
    else if (phase === 'listening') c.stop();
    else c.interrupt();
  }, []);

  const askText = useCallback((text) => controller.current?.ask(text ?? ''), []);
  const repeatLast = useCallback(() => controller.current?.repeat(), []);
  const stop = useCallback(() => controller.current?.stop(), []);
  const clearError = useCallback(() => controller.current?.clearError(), []);

  return {
    vState,
    vTranscript: snapshot.heard || snapshot.pending,
    vDone: !!snapshot.pending,
    vSubtitle: snapshot.subtitle,
    micTap,
    askText,
    repeatLast,
    stop,
    error: snapshot.error || null,
    clearError,
    // Only a conversation has these.
    phase: snapshot.phase,
    micLive: snapshot.micLive,
    notice: snapshot.notice,
  };
}
