import React, { useState } from 'react';
import { useSettings, isSystemDark } from '../state/SettingsContext.jsx';
import { useUi } from '../state/UiContext.jsx';
import { navigate } from '../state/router.js';
import { AvatarBust } from '../avatar/AvatarStage.jsx';

// Steps 2–8 are plain option pickers; 1/9/10/11/12 have bespoke layouts.
const OBDEFS = {
  2: { key: 'setupType', title: 'Who is setting up this app today?', sub: 'This helps Aria speak to you in the right way.', opts: [['caring', "I'm caring for someone"], ['professional', 'I work in care professionally'], ['someone-else', "I'm setting it up for someone else"], ['exploring', "I'm exploring for myself"]] },
  3: { key: 'supportLevel', title: 'How comfortable are you with using apps like this?', sub: '', opts: [['very', 'Very comfortable'], ['somewhat', 'Somewhat comfortable'], ['guidance', "I'd like extra guidance", "We'll add a little more explanation throughout the app"]] },
  4: { key: 'ariaStyle', title: 'What kind of helper feels right for you?', sub: 'You can always change this later.', opts: [['warm', 'Warm & encouraging'], ['calm', 'Calm & steady'], ['practical', 'Straightforward & practical']] },
  5: { key: 'responseStyle', title: 'When you ask a question, how much detail would you like?', sub: '', opts: [['short', 'Short and simple'], ['balanced', 'Balanced'], ['thorough', 'Thorough with explanations']] },
  6: { key: 'jargon', title: 'When medical words come up, what would you prefer?', sub: '', opts: [['plain', 'Plain language only'], ['explained', 'Medical terms with a short explanation'], ['fine', 'Medical terms are fine']] },
  7: { key: 'communication', title: 'How would you like to talk with Aria?', sub: '', opts: [['speak', 'Speak my questions', 'Hold a button and ask your question out loud'], ['type', 'Type my questions', 'Use the keyboard to write your questions'], ['both', 'Both']] },
  8: { key: 'voiceSpeed', title: 'How fast would you like Aria to speak?', sub: 'You can change this in Settings at any time.', opts: [['slower', 'Slower'], ['normal', 'Normal'], ['faster', 'Faster']] },
};

const L = (map, v) => map[v] || v || '—';

export default function Onboarding({ step }) {
  const { settings, setSetting, setMany, effDark } = useSettings();
  const { showToast } = useUi();
  const [previewing, setPreviewing] = useState(false);

  const obStep = Math.min(12, Math.max(1, step || 1));
  const obGo = (n) => navigate('#/onboarding/' + n);
  const obNext = () => (obStep >= 12 ? finish() : obGo(obStep + 1));
  const finish = () => {
    setSetting('onboarded', true);
    navigate('#/app/home');
    showToast("You're all set — welcome");
  };
  const skip = () => {
    setSetting('onboarded', true);
    navigate('#/app/home');
    showToast('Setup skipped — you can redo it in Settings');
  };
  const preview = () => {
    setPreviewing(true);
    setTimeout(() => setPreviewing(false), 2800);
  };

  const def = OBDEFS[obStep];
  const showContinue = obStep >= 2 && obStep <= 10;
  const options = def
    ? def.opts.map((o) => {
        const sel = settings[def.key] === o[0];
        return {
          label: o[1], desc: o[2] || '',
          bc: sel ? 'var(--primary)' : 'var(--border)',
          bw2: sel ? '2px' : 'var(--bw)',
          bg: sel ? 'var(--tint)' : 'var(--surface)',
          tickO: sel ? 1 : 0,
          pick: () => {
            const extra = def.key === 'responseStyle' ? { concise: o[0] === 'short' } : {};
            setMany({ [def.key]: o[0], ...extra });
          },
        };
      })
    : [];

  const sizeOpts = [['Small', 0.85, '15px'], ['Medium', 1, '19px'], ['Large', 1.25, '24px']].map(([label, v, fs]) => {
    const sel = settings.textScale === v;
    return { label, fs, bc: sel ? 'var(--primary)' : 'var(--border)', bw2: sel ? '2px' : 'var(--bw)', bg: sel ? 'var(--tint)' : 'var(--surface)', pick: () => setSetting('textScale', v) };
  });

  const obToggles = [
    { label: 'Dark mode', sub: 'Easier on the eyes in low light', on: effDark, toggle: () => setSetting('darkMode', !effDark) },
    { label: 'High contrast', sub: 'Increase colour contrast for readability', on: settings.highContrast, toggle: () => setSetting('highContrast', !settings.highContrast) },
    { label: 'Subtitles during voice replies', sub: "See Aria's words as she speaks", on: settings.subtitles, toggle: () => setSetting('subtitles', !settings.subtitles) },
    { label: "Show Aria's avatar", sub: 'Display the visual avatar on screen', on: settings.showAvatar, toggle: () => setSetting('showAvatar', !settings.showAvatar) },
  ];

  const summary = [
    ['Who is setting up', L({ caring: "I'm caring for someone", professional: 'I work in care professionally', 'someone-else': 'Setting up for someone else', exploring: 'Exploring for myself' }, settings.setupType), 2],
    ['Comfort with apps', L({ very: 'Very comfortable', somewhat: 'Somewhat comfortable', guidance: 'Extra guidance please' }, settings.supportLevel), 3],
    ["Aria's style", L({ warm: 'Warm & encouraging', calm: 'Calm & steady', practical: 'Straightforward & practical' }, settings.ariaStyle), 4],
    ['Detail level', L({ short: 'Short and simple', balanced: 'Balanced', thorough: 'Thorough' }, settings.responseStyle), 5],
    ['Medical words', L({ plain: 'Plain language only', explained: 'Explained briefly', fine: 'Medical terms are fine' }, settings.jargon), 6],
    ['Talking with Aria', L({ speak: 'Speak my questions', type: 'Type my questions', both: 'Speak or type' }, settings.communication), 7],
    ['Voice speed', L({ slower: 'Slower', normal: 'Normal', faster: 'Faster' }, settings.voiceSpeed), 8],
    ['Text size', L({ 0.85: 'Small', 1: 'Medium', 1.25: 'Large' }, settings.textScale), 9],
    ['Display', ((settings.darkMode === null ? isSystemDark() : settings.darkMode) ? 'Dark' : 'Light') + (settings.highContrast ? ' · high contrast' : '') + (settings.subtitles ? ' · subtitles on' : ''), 10],
  ];

  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 40px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '18px', flex: '1' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px' }}>
          {obStep > 1 && <button onClick={() => obGo(obStep - 1)} style={{ minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: 'none', background: 'none', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }} className="hv4">← Back</button>}
          <span style={{ flex: '1' }} />
          {showContinue && <button onClick={skip} style={{ minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: 'none', background: 'none', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv4">Skip for now</button>}
        </div>
        <div style={{ display: 'flex', gap: '7px', justifyContent: 'center' }} aria-label="Setup progress">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', background: i + 1 <= obStep ? 'var(--primary)' : 'var(--border)' }} />
          ))}
        </div>
        <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '22px', boxShadow: 'var(--shadow)', padding: '30px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {obStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center' }}>
              <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}><AvatarBust size={120} /></div>
              <h1 style={{ margin: '0', fontSize: '1.7rem' }}>Kia ora — I'm Aria</h1>
              <p style={{ margin: '0', color: 'var(--text2)', maxWidth: '26em', textWrap: 'pretty' }}>I'm here to help with questions about dementia care. Let's set things up so I can speak to you in the way that suits you best.</p>
              <p style={{ margin: '0', color: 'var(--text2)', fontSize: '.92rem' }}>Set up in about 2 minutes</p>
              <button onClick={() => obGo(2)} style={{ minHeight: '52px', padding: '0 30px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '1.05rem', fontWeight: '700', cursor: 'pointer' }} className="hv2">Let's begin</button>
              <button onClick={skip} style={{ minHeight: '44px', padding: '0 18px', borderRadius: '12px', border: 'none', background: 'none', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv5">Skip setup</button>
            </div>
          )}

          {def && (
            <>
              <h1 style={{ margin: '0', fontSize: '1.45rem', textWrap: 'pretty' }}>{def.title}</h1>
              {!!def.sub && <p style={{ margin: '-6px 0 0', color: 'var(--text2)' }}>{def.sub}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {options.map((o) => (
                  <button key={o.label} onClick={o.pick} style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', minHeight: '60px', padding: '14px 18px', borderRadius: '16px', cursor: 'pointer', color: 'var(--text)', border: `${o.bw2} solid ${o.bc}`, background: o.bg }} className="hv6">
                    <span style={{ flex: '1' }}>
                      <span style={{ display: 'block', fontWeight: '600', fontSize: '1.02rem' }}>{o.label}</span>
                      {!!o.desc && <span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem', marginTop: '2px' }}>{o.desc}</span>}
                    </span>
                    <span style={{ width: '26px', height: '26px', flexShrink: '0', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', opacity: o.tickO }}>✓</span>
                  </button>
                ))}
              </div>
              {obStep === 8 && (
                <>
                  <button onClick={preview} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', minHeight: '48px', borderRadius: '14px', border: 'var(--bw) solid var(--border)', background: 'var(--tint)', color: 'var(--primary-d)', fontWeight: '600', cursor: 'pointer' }} className="hv7">▶ Preview voice</button>
                  {previewing && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '30px' }}>
                        {[['var(--primary)', 0], ['var(--primary)', 0.15], ['var(--primary-l)', 0.3], ['var(--primary)', 0.45]].map(([c, d], i) => (
                          <span key={i} style={{ width: '5px', height: '24px', borderRadius: '3px', background: c, animation: `dgBar .9s ease-in-out ${d}s infinite` }} />
                        ))}
                      </div>
                      <div style={{ color: 'var(--text2)', fontStyle: 'italic' }}>“Kia ora — I'm Aria. This is about how I'll sound.”</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {obStep === 9 && (
            <>
              <h1 style={{ margin: '0', fontSize: '1.45rem' }}>How would you like the text to appear?</h1>
              <div style={{ display: 'flex', gap: '12px' }}>
                {sizeOpts.map((o) => (
                  <button key={o.label} onClick={o.pick} style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minHeight: '84px', padding: '14px', borderRadius: '16px', cursor: 'pointer', color: 'var(--text)', border: `${o.bw2} solid ${o.bc}`, background: o.bg }} className="hv6">
                    <span style={{ fontWeight: '700', fontSize: o.fs }}>A</span>
                    <span style={{ color: 'var(--text2)', fontSize: '.9rem' }}>{o.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '18px' }}>
                <p style={{ margin: '0', lineHeight: '1.7' }}>This is how text will look throughout the app. Pick the size that feels easiest to read — you can change it any time in Settings.</p>
              </div>
            </>
          )}

          {obStep === 10 && (
            <>
              <h1 style={{ margin: '0', fontSize: '1.45rem' }}>A few display choices</h1>
              <p style={{ margin: '-6px 0 0', color: 'var(--text2)' }}>These can all be changed later in Settings.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {obToggles.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '14px', minHeight: '60px', padding: '8px 4px', borderBottom: 'var(--bw) solid var(--border)' }}>
                    <span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>{r.label}</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>{r.sub}</span></span>
                    <button role="switch" aria-checked={r.on ? 'true' : 'false'} aria-label={r.label} onClick={r.toggle} style={{ position: 'relative', width: '52px', height: '32px', flexShrink: '0', borderRadius: '999px', border: 'none', cursor: 'pointer', background: r.on ? 'var(--primary)' : 'var(--border)', transition: 'background .2s' }}>
                      <span style={{ position: 'absolute', top: '2px', left: r.on ? '22px' : '2px', width: '28px', height: '28px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .2s' }} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {obStep === 11 && (
            <>
              <h1 style={{ margin: '0', fontSize: '1.45rem' }}>One important thing to know</h1>
              <div style={{ background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ margin: '0' }}><strong>Aria gives general information, not medical advice.</strong> She can help you understand dementia and day-to-day care, but she can't diagnose or treat.</p>
                <p style={{ margin: '0' }}>In an emergency, call <strong>111</strong>.</p>
                <p style={{ margin: '0' }}>For health concerns, contact your GP — or call <strong>Healthline on 0800 611 116</strong>, free, any time of day or night.</p>
              </div>
              <button onClick={obNext} style={{ minHeight: '54px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '1.05rem', fontWeight: '700', cursor: 'pointer' }} className="hv2">I understand</button>
            </>
          )}

          {obStep === 12 && (
            <>
              <h1 style={{ margin: '0', fontSize: '1.45rem' }}>Here's how you've set things up</h1>
              <p style={{ margin: '-6px 0 0', color: 'var(--text2)' }}>Tap Change to adjust anything.</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {summary.map(([label, value, n]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '54px', padding: '8px 2px', borderBottom: 'var(--bw) solid var(--border)' }}>
                    <span style={{ flex: '1', color: 'var(--text2)', fontSize: '.95rem' }}>{label}</span>
                    <span style={{ fontWeight: '600', textAlign: 'right' }}>{value}</span>
                    <button onClick={() => obGo(n)} style={{ minHeight: '40px', padding: '0 12px', borderRadius: '10px', border: 'none', background: 'none', color: 'var(--primary-d)', fontWeight: '600', cursor: 'pointer' }} className="hv3">Change</button>
                  </div>
                ))}
              </div>
              <button onClick={finish} style={{ minHeight: '56px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer' }} className="hv2">Meet Aria →</button>
            </>
          )}
        </div>
        {showContinue && (
          <button onClick={obNext} style={{ minHeight: '54px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '1.05rem', fontWeight: '700', cursor: 'pointer', boxShadow: 'var(--shadow)' }} className="hv2">Continue</button>
        )}
      </div>
    </section>
  );
}
