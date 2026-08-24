// Conversation store shared by Chat, Voice and Home. In mock mode it replicates
// the prototype's timer-driven behaviour (word-streamed canned replies); in real
// mode (phase b) generateReply() streams gpt-4o tokens through the same surface.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as S from '../data/services.js';
import {
  loadCached, saveCached, clearCached,
  getOrCreateConversation, loadMessages, appendMessage as persistMessage,
  startNewConversation, migrateLegacyHistory, deleteAllConversations,
} from './conversationStore.js';
import { useAuth } from './AuthContext.jsx';
import { navigate } from './router.js';
import { useSettings } from './SettingsContext.jsx';
import { isMockMode, generateReply } from '../services/chatService.js';
import { isStudyMode, currentArm, currentTaskId, transcriptFields } from '../study/studyStore.js';
import { useStudy } from '../study/StudyContext.jsx';
import { createTurnTimer } from '../study/latency.js';
import { emit } from '../study/events.js';
import { MODALITY_TYPED } from '@core/study/studyConfig.mjs';

const ChatCtx = createContext(null);

const now = () => {
  const d = new Date();
  let h = d.getHours();
  const m = ('0' + d.getMinutes()).slice(-2);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
};

export function ChatProvider({ children }) {
  const { settings } = useSettings();
  const { userId, status: authStatus } = useAuth();
  const [messages, setMessages] = useState(() => {
    // Render the cache immediately; the server copy replaces it once the session
    // resolves. Waiting on the network would show an empty screen every load.
    const saved = loadCached();
    if (saved && saved.length) return saved;
    // The demo seed opens on a distressing exchange ("he lashes out at me and I
    // get scared"). Fine as prototype furniture; not acceptable as the first
    // thing a study participant sees, and it would contaminate turn counts.
    return isStudyMode() ? [] : S.seedThread();
  });
  const [typing, setTyping] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [chatErrorMsg, setChatErrorMsg] = useState('');
  const [drawer, setDrawer] = useState(null); // mock: article id · real: source object
  const failedQ = useRef('');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const abortRef = useRef(null);
  const busyRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [conversationId, setConversationId] = useState(null);
  // Read by the fire-and-forget writes without re-creating the callbacks, which
  // would abort an in-flight turn.
  const convIdRef = useRef(null);
  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);
  const studyArm = currentArm();
  const scrollCb = useRef(null); // Chat screen registers its scroll-to-bottom here

  // The guard in the initialiser above runs once, at mount — which on a fresh
  // browser is before the participant has entered their code, so isStudyMode()
  // is still false and the demo seed wins. StudyProvider is a *parent* of this
  // provider, so begin() re-renders us but never remounts, and the initialiser
  // cannot re-run. Without this the seed survives into task 1: on screen, fed to
  // the model as history, and counted as turns.
  //
  // Clearing on the transition rather than on `studyOn` itself is deliberate. A
  // reload mid-task mounts with isStudyMode() already true, and must keep the
  // messages the participant has legitimately accumulated.
  //
  // Read through the context, NOT straight from the store. This provider is
  // handed to StudyProvider as `children`, so a study state change re-renders
  // StudyProvider and then bails out before re-rendering us — the element is
  // referentially identical. A localStorage read during render therefore stayed
  // false right through begin(), the effect below never saw the transition, and
  // the seed reached task 1. Context consumption is exempt from that bail-out.
  // The same staleness applied to currentArm() below, which decides which
  // conversation an arm's messages are written to.
  const studyOn = useStudy().active;
  const wasStudyOn = useRef(studyOn);
  useEffect(() => {
    const entering = studyOn && !wasStudyOn.current;
    wasStudyOn.current = studyOn;
    if (!entering) return;
    // Also covers a device where someone used the app before the session: the
    // participant starts from an empty screen either way.
    setMessages([]);
    clearCached();
  }, [studyOn]);

  // One conversation per (user, study arm). The arm key is what stops a
  // within-subjects participant carrying arm A's answers into arm B, where they
  // could re-read them instead of searching — measuring memory of the first arm
  // rather than the second interface.
  useEffect(() => {
    if (authStatus !== 'ready' || !userId) return undefined;
    let cancelled = false;
    (async () => {
      const id = await getOrCreateConversation(userId, { surface: 'chat', studyArm: studyArm || null });
      if (cancelled || !id) return;
      setConversationId(id);
      // Not during a study: importing a participant's own prior history into an
      // arm would contaminate it.
      if (!isStudyMode()) await migrateLegacyHistory(userId, id);
      const server = await loadMessages(id);
      if (cancelled || !server.length) return;
      setMessages(server);
      saveCached(server);
    })();
    return () => { cancelled = true; };
  }, [authStatus, userId, studyArm]);

  const persist = useCallback((msgs) => {
    setMessages(msgs);
    saveCached(msgs);
    queueMicrotask(() => scrollCb.current && scrollCb.current());
  }, []);

  useEffect(() => () => abortRef.current && abortRef.current.abort(), []);

  const send = useCallback((q) => {
    q = (q || '').trim();
    if (!q || busyRef.current) return; // one turn at a time
    const withUser = messagesRef.current.concat([{ role: 'user', text: q, time: now() }]);
    persist(withUser);
    persistMessage(convIdRef.current, { role: 'user', text: q });
    run(q, withUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async (q, base) => {
    busyRef.current = true;
    setTyping(true);
    setChatError(false);
    const ac = new AbortController();
    abortRef.current = ac;
    const msg = { role: 'aria', text: '', citations: [], safety: false, streaming: true, time: now() };
    let started = false;
    // Text arm of the study. No STT or TTS stage here, so the turn timer records
    // retrieval and time-to-first-token only — which is the fair comparison
    // against the voice arm's to-first-audio.
    const arm = studyArm;
    const taskId = currentTaskId();
    const turn = createTurnTimer(arm, taskId);
    // Always typed: this screen has no microphone. Recorded explicitly rather
    // than inferred from the arm, so that "how did they ask?" is one field in
    // both arms and neither has to be reconstructed from which code path ran.
    emit('turn_start', { arm, taskId, modality: MODALITY_TYPED, chars: q.length });
    try {
      const result = await generateReply({
        question: q,
        settings: settingsRef.current,
        history: base,
        signal: ac.signal,
        onStage: (stage) => turn.mark(stage),
        onToken: (fullText) => {
          if (ac.signal.aborted) return;
          if (!started) {
            started = true;
            setTyping(false);
            setMessages(base.concat([msg]));
          }
          msg.text = fullText;
          setMessages(base.concat([{ ...msg }]));
          queueMicrotask(() => scrollCb.current && scrollCb.current());
        },
      });
      if (ac.signal.aborted) return;
      Object.assign(msg, {
        text: result.text,
        citations: result.citations || [],
        sources: result.sources || null,
        safety: !!result.safety,
        streaming: false,
      });
      setTyping(false);
      persist(base.concat([{ ...msg }]));
      persistMessage(convIdRef.current, {
        role: 'aria', text: result.text, citations: result.citations || [],
      });
      turn.finish({ arm, taskId, modality: MODALITY_TYPED });
      emit('turn', {
        arm,
        taskId,
        modality: MODALITY_TYPED,
        // A participant who declines has their words withheld here, not at
        // export: declining means the text never reaches the database. The turn
        // is still recorded — turn count is a primary effectiveness measure and
        // carries no content of its own.
        ...transcriptFields({ question: q, answer: result.text }),
        sourceIds: (result.sources || []).map((c) => c.id ?? c.num ?? null),
      });
    } catch (err) {
      if (ac.signal.aborted) return;
      console.warn('[chat] turn failed:', err?.message || err);
      emit('turn_error', {
        arm,
        taskId,
        modality: MODALITY_TYPED,
        ...transcriptFields({ question: q }),
        error: err?.name || 'Error',
        message: String(err?.message ?? err).slice(0, 300),
      });
      failedQ.current = q;
      setTyping(false);
      setChatError(true);
      setChatErrorMsg(
        err?.name === 'StudyAccessError'
          ? 'Your study access code was not accepted — check the code in your invitation email.'
          : err?.name === 'OpenAIAuthError'
          ? 'Your OpenAI API key looks invalid — check it in Settings → Advanced.'
          : err?.name === 'OpenAIRateLimitError'
            ? 'The AI service is rate-limited right now — wait a moment and retry.'
            : "I couldn't reach the knowledge base — try again."
      );
      setMessages(base); // drop the empty streaming bubble if any
    } finally {
      busyRef.current = false;
    }
  }, [persist, studyArm]);

  const retry = useCallback(() => {
    const q = failedQ.current;
    if (!q || busyRef.current) return;
    setChatError(false);
    run(q, messagesRef.current);
  }, [run]);

  const askNow = useCallback((q) => {
    navigate('#/app/chat');
    setTimeout(() => send(q), 450);
  }, [send]);

  const newConvo = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    setTyping(false);
    setChatError(false);
    clearCached();
    setMessages([]);
    // A new thread server-side too, or the screen clears while the next message
    // appends to the old conversation.
    const id = await startNewConversation(userId, { surface: 'chat', studyArm: studyArm || null });
    if (id) setConversationId(id);
  }, [userId, studyArm]);

  // Voice appends fully-formed messages (its own streaming lives in the voice loop)
  const appendMessage = useCallback((m) => {
    setMessages((prev) => {
      const next = prev.concat([{ time: now(), ...m }]);
      saveCached(next);
      return next;
    });
    persistMessage(convIdRef.current, m);
  }, []);

  /**
   * Delete every stored conversation, not just the one on screen.
   *
   * newConvo() starts a fresh thread and leaves the old rows where they are,
   * which is right for "New conversation" and wrong for "Clear history". The
   * screen is only emptied once the delete has actually succeeded, so a failure
   * cannot look like a success.
   */
  const clearHistory = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    setTyping(false);
    setChatError(false);
    const result = await deleteAllConversations(userId);
    if (!result.deleted) return result;
    setMessages([]);
    setConversationId(null);
    const id = await startNewConversation(userId, { surface: 'chat', studyArm: studyArm || null });
    if (id) setConversationId(id);
    return result;
  }, [userId, studyArm]);

  const value = {
    messages, typing, chatError, chatErrorMsg, send, retry, askNow, newConvo, clearHistory, appendMessage,
    drawer, setDrawer, scrollCb, mock: isMockMode(), conversationId,
  };
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export const useChat = () => useContext(ChatCtx);
