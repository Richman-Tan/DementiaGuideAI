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
import { createTurnTimer } from '../lib/latency.js';
import { shouldAdoptServerThread } from './threadAdoption.js';
import { credentialErrorCopy } from '../services/credentialErrorCopy.js';

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
    return S.seedThread();
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
  const scrollCb = useRef(null); // Chat screen registers its scroll-to-bottom here

  // One conversation per user.
  useEffect(() => {
    if (authStatus !== 'ready' || !userId) return undefined;
    let cancelled = false;
    (async () => {
      // Captured before setConversationId below: whether we are SWITCHING
      // threads decides if an empty server copy may replace the screen.
      const prevId = convIdRef.current;
      const id = await getOrCreateConversation(userId, { surface: 'chat' });
      if (cancelled || !id) return;
      setConversationId(id);
      await migrateLegacyHistory(userId, id);
      const server = await loadMessages(id);
      if (cancelled) return;
      // A different thread replaces the screen even when its server copy is
      // empty. Same-thread emptiness still keeps the cached render (a hiccup
      // must not blank a real conversation). See threadAdoption.js.
      if (!shouldAdoptServerThread(prevId, id, server.length)) return;
      setMessages(server);
      saveCached(server);
    })();
    return () => { cancelled = true; };
  }, [authStatus, userId]);

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
    // No STT or TTS stage here, so the turn timer records retrieval and
    // time-to-first-token only.
    const turn = createTurnTimer();
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
      turn.finish();
    } catch (err) {
      if (ac.signal.aborted) return;
      console.warn('[chat] turn failed:', err?.message || err);
      failedQ.current = q;
      setTyping(false);
      setChatError(true);
      setChatErrorMsg(credentialErrorCopy(err) ?? "I couldn't reach the knowledge base — try again.");
      setMessages(base); // drop the empty streaming bubble if any
    } finally {
      busyRef.current = false;
    }
  }, [persist]);

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
    const id = await startNewConversation(userId, { surface: 'chat' });
    if (id) setConversationId(id);
  }, [userId]);

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
    const id = await startNewConversation(userId, { surface: 'chat' });
    if (id) setConversationId(id);
    return result;
  }, [userId]);

  const value = {
    messages, typing, chatError, chatErrorMsg, send, retry, askNow, newConvo, clearHistory, appendMessage,
    drawer, setDrawer, scrollCb, mock: isMockMode(), conversationId,
  };
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export const useChat = () => useContext(ChatCtx);
