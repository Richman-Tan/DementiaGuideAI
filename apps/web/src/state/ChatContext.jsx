// Conversation store shared by Chat, Voice and Home. In mock mode it replicates
// the prototype's timer-driven behaviour (word-streamed canned replies); in real
// mode (phase b) generateReply() streams gpt-4o tokens through the same surface.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as S from '../data/services.js';
import { loadHistory, saveHistory, clearHistory } from './historyStore.js';
import { navigate } from './router.js';
import { useSettings } from './SettingsContext.jsx';
import { isMockMode, generateReply } from '../services/chatService.js';

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
  const [messages, setMessages] = useState(() => {
    const saved = loadHistory();
    return saved && saved.length ? saved : S.seedThread();
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
  const scrollCb = useRef(null); // Chat screen registers its scroll-to-bottom here

  const persist = useCallback((msgs) => {
    setMessages(msgs);
    saveHistory(msgs);
    queueMicrotask(() => scrollCb.current && scrollCb.current());
  }, []);

  useEffect(() => () => abortRef.current && abortRef.current.abort(), []);

  const send = useCallback((q) => {
    q = (q || '').trim();
    if (!q || busyRef.current) return; // one turn at a time
    const withUser = messagesRef.current.concat([{ role: 'user', text: q, time: now() }]);
    persist(withUser);
    run(q, withUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(
    async (q, base) => {
      busyRef.current = true;
      setTyping(true);
      setChatError(false);
      const ac = new AbortController();
      abortRef.current = ac;
      const msg = {
        role: 'aria',
        text: '',
        citations: [],
        safety: false,
        streaming: true,
        time: now(),
      };
      let started = false;
      try {
        const result = await generateReply({
          question: q,
          settings: settingsRef.current,
          history: base,
          signal: ac.signal,
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
      } catch (err) {
        if (ac.signal.aborted) return;
        console.warn('[chat] turn failed:', err?.message || err);
        failedQ.current = q;
        setTyping(false);
        setChatError(true);
        setChatErrorMsg(
          err?.name === 'OpenAIAuthError'
            ? 'Your OpenAI API key looks invalid — check it in Settings → Advanced.'
            : err?.name === 'OpenAIRateLimitError'
              ? 'The AI service is rate-limited right now — wait a moment and retry.'
              : "I couldn't reach the knowledge base — try again."
        );
        setMessages(base); // drop the empty streaming bubble if any
      } finally {
        busyRef.current = false;
      }
    },
    [persist]
  );

  const retry = useCallback(() => {
    const q = failedQ.current;
    if (!q || busyRef.current) return;
    setChatError(false);
    run(q, messagesRef.current);
  }, [run]);

  const askNow = useCallback(
    (q) => {
      navigate('#/app/chat');
      setTimeout(() => send(q), 450);
    },
    [send]
  );

  const newConvo = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setTyping(false);
    setChatError(false);
    clearHistory();
    setMessages([]);
  }, []);

  // Voice appends fully-formed messages (its own streaming lives in the voice loop)
  const appendMessage = useCallback((m) => {
    setMessages((prev) => {
      const next = prev.concat([{ time: now(), ...m }]);
      saveHistory(next);
      return next;
    });
  }, []);

  const value = {
    messages,
    typing,
    chatError,
    chatErrorMsg,
    send,
    retry,
    askNow,
    newConvo,
    appendMessage,
    drawer,
    setDrawer,
    scrollCb,
    mock: isMockMode(),
  };
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export const useChat = () => useContext(ChatCtx);
