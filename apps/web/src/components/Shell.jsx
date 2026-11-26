// The app's frame: the navigation, and the screen inside it. The navigation is
// a sidebar on a desktop, a rail of icons on a tablet and a bar of tabs along
// the bottom of a phone.
//
// In each of the three it is the same thing to a screen reader: a navigation
// landmark of links, one of which says it is the current page. That used to be
// shown by colour alone, on buttons, and on a desktop or tablet not inside a
// landmark at all.
import React from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { getAvatarProfile } from '../avatar/avatarProfiles.js';
import BrandMark from './BrandMark.jsx';
import { Button } from './ui/Button.jsx';

const I = {
  home: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  ),
  chat: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  ),
  mic: (s = 22) => (
    <svg
      width={s}
      height={s}
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
  ),
  lib: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h7v14H4z" />
      <path d="M13 5h7v14h-7z" />
    </svg>
  ),
  set: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="2" fill="var(--surface)" />
      <circle cx="15" cy="12" r="2" fill="var(--surface)" />
      <circle cx="9" cy="17" r="2" fill="var(--surface)" />
    </svg>
  ),
};

const NAV = [
  ['home', 'Home', '#/app/home', I.home],
  ['chat', 'Chat', '#/app/chat', I.chat],
  ['lib', 'Library', '#/app/library', I.lib],
  ['set', 'Settings', '#/app/settings', I.set],
];

const VOICE = '#/app/voice';

const LINK = 'no-underline transition-colors';
// The current page is tinted; the others take the tint under the pointer.
const tone = (on) => (on ? 'bg-tint text-primary-dark' : 'text-text-muted hover:bg-tint');

/**
 * One destination, in the shape its layout needs: a row with its name
 * (desktop), an icon alone (tablet) or a tab (phone).
 */
function NavItem({ item: [key, label, route, icon], active, shape }) {
  const on = active === key;
  const current = on ? 'page' : undefined;
  if (shape === 'row') {
    return (
      <a
        href={route}
        aria-current={current}
        className={`${LINK} flex min-h-12 items-center gap-3 rounded-md px-3.5 font-semibold ${tone(on)}`}
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  if (shape === 'icon') {
    return (
      <a
        href={route}
        aria-current={current}
        aria-label={label}
        title={label}
        className={`${LINK} flex size-12 items-center justify-center rounded-md ${tone(on)}`}
      >
        {icon}
      </a>
    );
  }
  // A tab has no fill; the current one is darker and carries a dot.
  // (`leading-tight`: a link inherits the page's paragraph line height, a button did not.)
  return (
    <a
      href={route}
      aria-current={current}
      className={`${LINK} flex min-h-12 min-w-14 flex-col items-center gap-0.5 text-xs leading-tight font-semibold ${
        on ? 'text-primary-dark' : 'text-text-muted'
      }`}
    >
      {icon}
      {label}
      <span className={`size-1.5 rounded-pill ${on ? 'bg-primary' : 'bg-transparent'}`} />
    </a>
  );
}

const SIDE =
  'sticky top-0 box-border flex h-screen shrink-0 flex-col border-0 border-r-(length:--bw) border-solid border-border bg-surface';

export default function Shell({ active, isDesktop, isTablet, isMobile, children }) {
  const { settings, setSetting, effDark } = useSettings();
  const talkTo = `Talk to ${getAvatarProfile(settings.avatarId).name}`;
  const items = (shape, from, to) =>
    NAV.slice(from, to).map((item) => (
      <NavItem key={item[0]} item={item} active={active} shape={shape} />
    ));

  return (
    <div className="flex min-h-screen">
      {isDesktop && (
        <aside className={`${SIDE} w-65 gap-1 px-3.5 pt-5.5 pb-4`}>
          <div className="flex items-center gap-2.5 px-2.5 pb-4.5">
            <BrandMark size={34} tile />
            <strong>DementiaGuide AI</strong>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {items('row')}
            <Button href={VOICE} size="lg" className="mt-3.5 shadow-card">
              {I.mic(20)}
              {talkTo}
            </Button>
          </nav>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSetting('darkMode', !effDark)}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border-(length:--bw) border-solid border-border bg-elevated px-3.5 font-semibold text-text-muted transition-colors hover:bg-tint"
          >
            <span className="box-border size-4 rounded-pill border-2 border-solid border-text-muted bg-[linear-gradient(90deg,var(--text2)_50%,transparent_50%)]" />
            {effDark ? 'Light theme' : 'Dark theme'}
          </button>
          <div className="px-2.5 pt-3 text-xs text-text-muted">v1.0 · Made in Aotearoa NZ</div>
        </aside>
      )}
      {isTablet && (
        <aside className={`${SIDE} w-18 items-center pt-5 pb-4`}>
          <BrandMark size={36} tile style={{ marginBottom: '14px' }} />
          <nav aria-label="Main" className="flex flex-col items-center gap-1.5">
            {items('icon', 0, 2)}
            <Button
              href={VOICE}
              icon
              size="lg"
              className="shadow-card"
              aria-label={talkTo}
              title={talkTo}
            >
              {I.mic()}
            </Button>
            {items('icon', 2)}
          </nav>
        </aside>
      )}
      <main className={`min-w-0 flex-1 ${isMobile ? 'pb-24' : ''}`}>
        <div className="mx-auto box-border max-w-300 px-5">{children}</div>
      </main>
      {isMobile && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-0 border-t-(length:--bw) border-solid border-border bg-surface px-1 pt-1.5 pb-2.5"
        >
          {items('tab', 0, 2)}
          {/* The one thing raised above the bar: its own shape and shadow. */}
          <a
            href={VOICE}
            aria-label={talkTo}
            className={`${LINK} flex size-14 -translate-y-4.5 items-center justify-center rounded-pill bg-primary text-on-primary shadow-[0_4px_14px_rgba(45,95,112,.4)] hover:bg-primary-dark`}
          >
            {I.mic(24)}
          </a>
          {items('tab', 2)}
        </nav>
      )}
    </div>
  );
}
