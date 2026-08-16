// App-level overlays: citation/source drawer, confirm dialog, toast.
import React from 'react';
import * as S from '../data/services.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useUi } from '../state/UiContext.jsx';
import { navigate } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';

// Drawer content: in mock mode citations ARE library articles ({id,title,cat});
// in real mode (phase b) they are KB source objects ({title,org,excerpt,url,
// articleId?}) — both shapes render truthfully here.
export function SourceDrawer({ isMobile }) {
  const { effDark } = useSettings();
  const { drawer, setDrawer } = useChat();
  if (!drawer) return null;

  const art = drawer.id ? S.getArticle(drawer.id) : null;
  const articleId = drawer.articleId || (art ? art.id : null);
  const cat = art ? art.cat : drawer.cat;
  const y = cat ? catStyle(cat, effDark) : null;
  const chipLabel = art ? S.getCat(art.cat).name : drawer.org || 'Source';
  const title = drawer.title || (art ? art.title : '');
  const excerpt = art ? S.excerptFor(art) : drawer.excerpt || '';
  const metaLine = art ? `Reviewed content · ${art.mins} min read` : drawer.org ? `Source: ${drawer.org}` : 'Knowledge base source';
  const close = () => setDrawer(null);

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: '0', background: 'rgba(15,25,32,.45)', zIndex: '60' }} />
      <div role="dialog" aria-label="Source preview" style={{ position: 'fixed', zIndex: '61', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', boxShadow: '0 8px 40px rgba(10,20,28,.3)', display: 'flex', flexDirection: 'column', gap: '14px', padding: '26px', boxSizing: 'border-box', top: isMobile ? 'auto' : '0', bottom: '0', right: '0', left: isMobile ? '0' : 'auto', width: isMobile ? 'auto' : 'min(440px,92vw)', borderRadius: isMobile ? '22px 22px 0 0' : '0', maxHeight: '100vh', overflowY: 'auto' }}>
        <button onClick={close} aria-label="Close preview" style={{ alignSelf: 'flex-end', width: '44px', height: '44px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text2)', cursor: 'pointer', fontSize: '1.1rem' }} className="hv3">✕</button>
        <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '.82rem', fontWeight: '600', background: y ? y.bg : 'var(--tint)', color: y ? y.fg : 'var(--primary-d)' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: y ? y.dot : 'var(--primary)' }} />{chipLabel}
        </span>
        <h2 style={{ margin: '0', fontSize: '1.35rem', lineHeight: '1.3' }}>{title}</h2>
        <p style={{ margin: '0', color: 'var(--text2)', lineHeight: '1.65' }}>{excerpt}</p>
        <p style={{ margin: '0', color: 'var(--text2)', fontSize: '.88rem' }}>{metaLine}</p>
        {articleId && (
          <button onClick={() => { close(); navigate('#/app/library/' + articleId); }} style={{ minHeight: '50px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', fontSize: '1rem', cursor: 'pointer' }} className="hv2">
            {art ? 'Read full article →' : 'Read related article →'}
          </button>
        )}
        {!articleId && drawer.url && (
          <a href={drawer.url} target="_blank" rel="noreferrer" style={{ minHeight: '50px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} className="hv2">View original source ↗</a>
        )}
      </div>
    </>
  );
}

export function ConfirmDialog() {
  const { confirm, confirmNo, confirmAccept } = useUi();
  if (!confirm) return null;
  return (
    <div style={{ position: 'fixed', inset: '0', background: 'rgba(15,25,32,.45)', zIndex: '70', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div role="alertdialog" style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', boxShadow: '0 8px 40px rgba(10,20,28,.3)', padding: '28px', maxWidth: '420px', width: '100%' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: '1.25rem' }}>{confirm.title}</h2>
        <p style={{ margin: '0 0 22px', color: 'var(--text2)' }}>{confirm.message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={confirmNo} style={{ minHeight: '48px', padding: '0 20px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: '600', cursor: 'pointer' }} className="hv3">Keep history</button>
          <button onClick={confirmAccept} style={{ minHeight: '48px', padding: '0 20px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: 'pointer' }} className="hv2">{confirm.yesLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const { toast } = useUi();
  if (!toast) return null;
  return (
    <div role="status" style={{ position: 'fixed', bottom: '88px', left: '50%', transform: 'translateX(-50%)', zIndex: '80', background: 'var(--text)', color: 'var(--bg)', padding: '12px 22px', borderRadius: '999px', fontWeight: '600', boxShadow: '0 4px 18px rgba(10,20,28,.3)', maxWidth: '90vw' }}>{toast}</div>
  );
}
