import React, { useEffect, useRef, useState } from 'react';
import * as S from '../data/services.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { go } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';
import { AvatarBust } from '../avatar/AvatarStage.jsx';

const Dots = () => (
  <div
    style={{
      alignSelf: 'flex-start',
      background: 'var(--surface)',
      border: 'var(--bw) solid var(--border)',
      borderRadius: '18px 18px 18px 4px',
      padding: '16px 20px',
      display: 'flex',
      gap: '6px',
      boxShadow: 'var(--shadow)',
    }}
  >
    {[0, 0.15, 0.3].map((d) => (
      <span
        key={d}
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--primary)',
          animation: `dgBounce 1.2s ${d}s infinite`,
        }}
      />
    ))}
  </div>
);

export default function Chat({ isDesktop, isMobile }) {
  const { settings, effDark } = useSettings();
  const { messages, typing, chatError, chatErrorMsg, send, retry, newConvo, setDrawer, scrollCb } =
    useChat();
  const [chatInput, setChatInput] = useState('');
  const [panel, setPanel] = useState(true);
  const chatEl = useRef(null);

  useEffect(() => {
    scrollCb.current = () => {
      if (chatEl.current) chatEl.current.scrollTop = chatEl.current.scrollHeight;
    };
    scrollCb.current();
    return () => {
      scrollCb.current = null;
    };
  }, [scrollCb]);
  useEffect(() => {
    scrollCb.current && scrollCb.current();
  }, [messages, typing, scrollCb]);

  const submit = () => {
    if (chatInput.trim()) {
      send(chatInput);
      setChatInput('');
    }
  };
  const chatEmpty = messages.length === 0 && !typing;
  const showPanel = panel && isDesktop;

  return (
    <section
      style={{
        display: 'flex',
        gap: '20px',
        height: isMobile ? 'calc(100vh - 100px)' : 'calc(100vh - 16px)',
        padding: '14px 0',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flex: '1',
          minWidth: '0',
          maxWidth: '760px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <h1 style={{ margin: '0', fontSize: '1.35rem' }}>Chat with Aria</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isDesktop && !panel && (
              <button
                onClick={() => setPanel(true)}
                style={{
                  minHeight: '44px',
                  padding: '0 14px',
                  borderRadius: '12px',
                  border: 'var(--bw) solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text2)',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                className="hv3"
              >
                Show Aria panel
              </button>
            )}
            <button
              onClick={newConvo}
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '12px',
                border: 'var(--bw) solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text2)',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              className="hv4"
            >
              New conversation
            </button>
          </div>
        </div>
        <div
          ref={chatEl}
          style={{
            flex: '1',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '6px 4px 16px',
          }}
        >
          {chatEmpty && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
                padding: '36px 16px',
                textAlign: 'center',
              }}
            >
              <AvatarBust size={90} />
              <div style={{ fontWeight: '700', fontSize: '1.15rem' }}>Kia ora, I'm Aria</div>
              <p
                style={{ margin: '0', color: 'var(--text2)', maxWidth: '30em', textWrap: 'pretty' }}
              >
                Ask me anything about dementia care — I'll answer in plain language, with sources
                from the trusted library.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '100%',
                  maxWidth: '420px',
                }}
              >
                {S.QUICK_QUESTIONS.slice(0, 3).map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{
                      minHeight: '48px',
                      padding: '10px 16px',
                      borderRadius: '14px',
                      border: 'var(--bw) solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    className="hv8"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--text2)',
                fontSize: '.82rem',
              }}
            >
              <span style={{ flex: '1', height: '1px', background: 'var(--border)' }} />
              Today
              <span style={{ flex: '1', height: '1px', background: 'var(--border)' }} />
            </div>
          )}
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const chips = (m.citations || []).map((c) => {
              const y = catStyle(c.cat, effDark);
              return { ...c, dot: y.dot };
            });
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {isUser ? (
                  <>
                    <div
                      title={m.time}
                      style={{
                        alignSelf: 'flex-end',
                        maxWidth: '82%',
                        background: 'var(--primary)',
                        color: '#fff',
                        borderRadius: '18px 18px 4px 18px',
                        padding: '12px 16px',
                        lineHeight: '1.55',
                      }}
                    >
                      {m.text}
                    </div>
                    <div
                      style={{
                        alignSelf: 'flex-end',
                        color: 'var(--text2)',
                        fontSize: '.75rem',
                        paddingRight: '4px',
                      }}
                    >
                      {m.time}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      title={m.time}
                      style={{
                        alignSelf: 'flex-start',
                        maxWidth: '86%',
                        background: 'var(--surface)',
                        border: 'var(--bw) solid var(--border)',
                        borderLeft: m.safety
                          ? '4px solid var(--amber)'
                          : 'var(--bw) solid var(--border)',
                        borderRadius: '18px 18px 18px 4px',
                        padding: '14px 18px',
                        lineHeight: '1.6',
                        boxShadow: 'var(--shadow)',
                      }}
                    >
                      {m.text}
                      {m.safety && (
                        <div
                          style={{
                            marginTop: '12px',
                            background: 'var(--amber-bg)',
                            border: 'var(--bw) solid var(--amber-bd)',
                            borderLeft: '4px solid var(--amber)',
                            borderRadius: '12px',
                            padding: '12px 14px',
                            color: 'var(--text)',
                          }}
                        >
                          <strong>If you need help now:</strong> {S.SAFETY_NOTE}
                        </div>
                      )}
                    </div>
                    {chips.length > 0 && !m.streaming && (
                      <div
                        style={{
                          alignSelf: 'flex-start',
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '8px',
                          maxWidth: '86%',
                        }}
                      >
                        <span
                          style={{
                            color: 'var(--text2)',
                            fontSize: '.8rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '.05em',
                          }}
                        >
                          Sources
                        </span>
                        {chips.map((c, j) => (
                          <button
                            key={j}
                            onClick={() => setDrawer(c)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '7px',
                              minHeight: '36px',
                              padding: '4px 14px',
                              borderRadius: '999px',
                              border: 'var(--bw) solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              fontSize: '.85rem',
                              cursor: 'pointer',
                            }}
                            className="hv8"
                          >
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: c.dot,
                              }}
                            />
                            {c.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        color: 'var(--text2)',
                        fontSize: '.75rem',
                        paddingLeft: '4px',
                      }}
                    >
                      {m.time}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {typing && <Dots />}
          {chatError && (
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '86%',
                background: 'var(--surface)',
                border: 'var(--bw) solid var(--border)',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span>{chatErrorMsg || "I couldn't reach the knowledge base — try again."}</span>
              <button
                onClick={retry}
                style={{
                  minHeight: '44px',
                  padding: '0 18px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                className="hv2"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '.8rem' }}>
            General information only — not medical advice.
          </div>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              background: 'var(--surface)',
              border: 'var(--bw) solid var(--border)',
              borderRadius: '18px',
              padding: '8px',
              boxShadow: 'var(--shadow)',
            }}
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="Type your question…"
              aria-label="Type your question"
              style={{
                flex: '1',
                minWidth: '0',
                minHeight: '44px',
                padding: '0 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                fontSize: '1rem',
                outlineOffset: '-2px',
              }}
            />
            <button
              onClick={go('#/app/voice')}
              aria-label="Switch to voice"
              style={{
                width: '44px',
                height: '44px',
                flexShrink: '0',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--tint)',
                color: 'var(--primary-d)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hv7"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M6 11a6 6 0 0 0 12 0" />
                <path d="M12 17v4" />
              </svg>
            </button>
            <button
              onClick={submit}
              aria-label="Send"
              style={{
                width: '44px',
                height: '44px',
                flexShrink: '0',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hv2"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {showPanel && (
        <aside
          style={{
            width: '230px',
            flexShrink: '0',
            alignSelf: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--surface)',
            border: 'var(--bw) solid var(--border)',
            borderRadius: '20px',
            padding: '22px',
            boxShadow: 'var(--shadow)',
            textAlign: 'center',
          }}
        >
          {settings.showAvatar && (
            <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
              <AvatarBust size={96} />
            </div>
          )}
          <div style={{ fontWeight: '700' }}>Aria</div>
          <div style={{ color: 'var(--text2)', fontSize: '.9rem' }}>
            {typing ? 'Aria is thinking…' : 'Aria is listening'}
          </div>
          <button
            onClick={() => setPanel(false)}
            style={{
              minHeight: '40px',
              padding: '0 14px',
              borderRadius: '10px',
              border: 'none',
              background: 'none',
              color: 'var(--text2)',
              fontSize: '.85rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
            className="hv4"
          >
            Hide panel
          </button>
        </aside>
      )}
    </section>
  );
}
