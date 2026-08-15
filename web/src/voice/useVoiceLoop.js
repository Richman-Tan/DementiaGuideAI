// Voice conversation state machine. Phase (a): the prototype's simulated loop
// (canned questions typed out word-by-word, timer-driven thinking/speaking).
// Phase (c) swaps the internals for real STT + streaming TTS behind the SAME
// interface: { vState, vTranscript, vDone, vSubtitle, micTap, repeatLast, stop }.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as S from '../data/services.js';

export function useVoiceLoop({ settings, appendMessage, messages, muted }) {
  const [vState, setVState] = useState('idle'); // idle|listening|thinking|speaking
  const [vTranscript, setVTranscript] = useState('');
  const [vDone, setVDone] = useState(false);
  const [vSubtitle, setVSubtitle] = useState('');
  const timers = useRef([]);
  const stateRef = useRef('idle');
  const qRef = useRef('');
  const qiRef = useRef(0);
  stateRef.current = vState;

  const T = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    setVState('idle');
    setVTranscript('');
    setVSubtitle('');
  }, [clearTimers]);

  useEffect(() => stop, [stop]); // teardown on unmount / route change

  const speak = useCallback((text) => {
    const sents = text.replace(/\s*\[\d+\]/g, '').split(/(?<=[.!?])\s+/).filter(Boolean);
    setVState('speaking');
    setVSubtitle(sents[0] || '');
    sents.forEach((sn, i) => T(() => { if (stateRef.current === 'speaking') setVSubtitle(sn); }, i * 2400));
    T(() => {
      if (stateRef.current === 'speaking') { setVState('idle'); setVSubtitle(''); }
    }, sents.length * 2400 + 500);
  }, [T]);

  const finishListening = useCallback(() => {
    const q = qRef.current;
    if (!q) return;
    setVState('thinking');
    setVDone(true);
    appendMessage({ role: 'user', text: q });
    T(() => {
      if (stateRef.current !== 'thinking') return;
      const r = S.mockReply(q, settings);
      appendMessage({ role: 'aria', text: r.text, citations: r.citations, safety: r.safety });
      speak(r.text);
    }, settings.fasterVoice ? 650 : 1700);
  }, [T, appendMessage, settings, speak]);

  const startListening = useCallback(() => {
    const qs = S.VOICE_QUESTIONS;
    const q = qs[qiRef.current % qs.length];
    qRef.current = q;
    qiRef.current += 1;
    setVState('listening');
    setVTranscript('');
    setVDone(false);
    const words = q.split(' ');
    words.forEach((w, i) => T(() => {
      if (stateRef.current !== 'listening') return;
      setVTranscript(words.slice(0, i + 1).join(' '));
      setVDone(i === words.length - 1);
      if (i === words.length - 1 && settings.handsFree) {
        T(() => { if (stateRef.current === 'listening') finishListening(); }, 1200);
      }
    }, 300 * (i + 1)));
  }, [T, settings.handsFree, finishListening]);

  const micTap = useCallback(() => {
    const st = stateRef.current;
    if (st === 'idle') startListening();
    else if (st === 'listening') finishListening();
    else if (st === 'speaking') { clearTimers(); setVState('idle'); setVSubtitle(''); }
  }, [startListening, finishListening, clearTimers]);

  const repeatLast = useCallback(() => {
    if (stateRef.current !== 'idle') return;
    const last = messages.slice().reverse().find((m) => m.role === 'aria');
    if (last) speak(last.text);
  }, [messages, speak]);

  return { vState, vTranscript, vDone, vSubtitle, micTap, repeatLast, stop, muted };
}
