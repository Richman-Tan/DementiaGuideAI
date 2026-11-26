// Home — a no-scroll, viewport-fit dashboard: full-height avatar tile on the
// left (video-call style), everything else in a flexible right column. Wide
// rows that can't fit (featured resources, mobile quick questions) scroll
// horizontally INSIDE their strip; the page itself never scrolls.
import React, { useState } from 'react';
import * as S from '../data/services.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useWidth } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';
import { AvatarBust, AvatarHomeStage } from '../avatar/AvatarStage.jsx';
import { getAvatarProfile } from '../avatar/avatarProfiles.js';
import { GrowTextArea } from '../components/GrowTextArea.jsx';
import { Button } from '../components/ui/Button.jsx';

// A card that goes somewhere. It is a link, so it is in a screen reader's list
// of links and can be opened in a new tab; it used to be a button that changed
// the address when pressed.
//
// Two things a button did by itself and a link does not: `leading-tight`,
// because a link inherits the page's line height, which is set for paragraphs
// (each card came out a third taller); and `box-border`, because a link's
// width does not include its padding (each came out 30px wider).
const CARD =
  'box-border rounded-lg border-(length:--bw) border-solid border-border bg-surface text-left leading-tight text-text no-underline shadow-card transition-colors hover:border-primary';

// The name of a group of things on the page: small, quiet, and a heading.
const GROUP = 'm-0 mb-2 text-sm font-semibold tracking-wider text-text-muted uppercase';

const MicIcon = () => (
  <svg
    width="20"
    height="20"
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
);

export default function Home() {
  const { settings, effDark } = useSettings();
  const { askNow } = useChat();
  const [homeQ, setHomeQ] = useState('');
  const who = getAvatarProfile(settings.avatarId).name;
  const width = useWidth();
  const isMobile = width < 768;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const submit = () => {
    if (!homeQ.trim()) return;
    const q = homeQ;
    setHomeQ('');
    askNow(q);
  };
  const featured = S.FEATURED.map((f) => {
    const a = S.getArticle(f.id);
    const y = catStyle(a.cat, effDark);
    return {
      title: a.title,
      mins: f.mins + ' min',
      catName: S.getCat(a.cat).name,
      chipBg: y.bg,
      chipFg: y.fg,
      href: '#/app/library/' + a.id,
    };
  });

  const card = {
    background: 'var(--surface)',
    border: 'var(--bw) solid var(--border)',
    borderRadius: '16px',
    boxShadow: 'var(--shadow)',
  };

  return (
    <section
      style={{
        height: isMobile ? 'calc(100dvh - 96px)' : '100dvh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '10px' : '14px',
        padding: isMobile ? '12px 0 4px' : '20px 0 18px',
        overflow: 'hidden',
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <h1
          style={{ fontSize: 'clamp(1.25rem, 2.4vw, 1.8rem)', margin: 0, letterSpacing: '-.01em' }}
        >
          {greeting}
        </h1>
        {!isMobile && (
          <p
            style={{
              margin: '4px 0 0',
              color: 'var(--text2)',
              fontSize: 'clamp(.9rem, 1.3vw, 1.02rem)',
              textWrap: 'pretty',
            }}
          >
            Ask a question, explore resources, or start a conversation about dementia care.
          </p>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '10px' : '18px',
        }}
      >
        {/* Avatar tile — full height on desktop, top band on mobile */}
        <div
          style={{
            flex: isMobile ? '0 0 32%' : '0 0 clamp(250px, 26vw, 380px)',
            minHeight: 0,
            borderRadius: '22px',
            border: 'var(--bw) solid var(--border)',
            background:
              'radial-gradient(circle at 50% 28%, var(--tint) 0%, transparent 75%), linear-gradient(160deg, var(--tint), var(--surface))',
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {settings.showAvatar ? (
            <AvatarHomeStage />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
                <AvatarBust size={110} />
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? '10px' : '14px',
            overflowY: 'auto',
          }}
        >
          <div style={{ ...card, padding: isMobile ? '12px 14px' : '16px 18px', flexShrink: 0 }}>
            {!isMobile && (
              <label
                htmlFor="dg-ask"
                style={{ display: 'block', fontWeight: 600, marginBottom: '10px' }}
              >
                What would you like to know?
              </label>
            )}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <GrowTextArea
                id="dg-ask"
                value={homeQ}
                onChange={setHomeQ}
                onSubmit={submit}
                maxLength={500}
                placeholder="Type your question…"
                aria-label="What would you like to know?"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: '48px',
                  padding: '12px 16px',
                  borderRadius: '13px',
                  border: 'var(--bw) solid var(--border)',
                  background: 'var(--elev)',
                }}
              />
              <Button icon aria-label="Send question" className="shrink-0" onClick={submit}>
                <svg
                  width="20"
                  height="20"
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
              </Button>
              <Button
                icon
                variant="secondary"
                href="#/app/voice"
                aria-label={`Ask ${who} by voice`}
                className="shrink-0"
              >
                <MicIcon />
              </Button>
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <h2 className={GROUP}>Quick questions</h2>
            <div
              style={
                isMobile
                  ? { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }
                  : { display: 'flex', flexWrap: 'wrap', gap: '8px' }
              }
            >
              {S.QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => askNow(q)}
                  className={`min-h-10 shrink-0 cursor-pointer rounded-pill border-(length:--bw) border-solid border-border bg-surface px-3.5 py-1.5 text-left text-[length:clamp(.85rem,1.2vw,.95rem)] text-text transition-colors hover:border-primary hover:bg-tint ${
                    isMobile ? 'whitespace-nowrap' : ''
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`,
              gap: '10px',
              flexShrink: 0,
            }}
          >
            {[
              ['Chat', 'Ask questions', '#/app/chat'],
              ['Voice', `Talk with ${who}`, '#/app/voice'],
              ['Library', `${S.ARTICLES.length} curated articles`, '#/app/library'],
              ['Settings', 'Make it yours', '#/app/settings'],
            ].map(([t, sub, r]) => (
              <a
                key={t}
                href={r}
                className={`${CARD} block min-w-0 hover:bg-tint ${
                  isMobile ? 'px-3 py-2.5' : 'px-3.5 py-3'
                }`}
              >
                <div className="mb-0.5 text-[length:clamp(.92rem,1.3vw,1.02rem)] font-bold">
                  {t}
                </div>
                <div className="truncate text-[length:clamp(.78rem,1.1vw,.9rem)] text-text-muted">
                  {sub}
                </div>
              </a>
            ))}
          </div>

          <div style={{ flexShrink: 0, marginTop: 'auto', minHeight: 0 }}>
            <h2 className={GROUP}>Featured resources</h2>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
              {featured.map((f) => (
                <a
                  key={f.title}
                  href={f.href}
                  className={`${CARD} flex flex-none flex-col items-start gap-2 px-3.5 py-3 ${
                    isMobile ? 'w-45' : 'w-[clamp(190px,21vw,250px)]'
                  }`}
                >
                  {/* The chip's colours are its category's, worked out per theme. */}
                  <span
                    className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: f.chipBg, color: f.chipFg }}
                  >
                    {f.catName}
                  </span>
                  <span className="line-clamp-2 text-[length:clamp(.85rem,1.2vw,.95rem)] leading-[1.3] font-bold">
                    {f.title}
                  </span>
                  <span className="text-sm text-text-muted">{f.mins} read</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
