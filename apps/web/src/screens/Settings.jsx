import React, { useState } from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useUi } from '../state/UiContext.jsx';
import { loadKeys, saveKeys as persistKeys, clearKeys as wipeKeys } from '../state/keysStore.js';
import { useStudy } from '../study/StudyContext.jsx';
import { useAuth } from '../state/AuthContext.jsx';
import { navigate } from '../state/router.js';
import { AVATAR_PROFILES } from '../avatar/avatarProfiles.js';
import { isUnityAvailable } from '../avatar/unity/unityBridge.js';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';

const Toggle = ({ label, on, onToggle }) => (
  <button role="switch" aria-checked={on ? 'true' : 'false'} aria-label={label} onClick={onToggle} style={{ position: 'relative', width: '52px', height: '32px', flexShrink: '0', borderRadius: '999px', border: 'none', cursor: 'pointer', background: on ? 'var(--primary)' : 'var(--border)', transition: 'background .2s' }}>
    <span style={{ position: 'absolute', top: '2px', left: on ? '22px' : '2px', width: '28px', height: '28px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .2s' }} />
  </button>
);

const ToggleRow = ({ label, sub, on, onToggle, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '64px', padding: '12px 0', borderBottom: last ? 'none' : 'var(--bw) solid var(--border)' }}>
    <span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>{label}</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>{sub}</span></span>
    <Toggle label={label} on={on} onToggle={onToggle} />
  </div>
);

const SectionTitle = ({ children }) => (
  <h2 style={{ fontSize: '.95rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' }}>{children}</h2>
);
const Card = ({ children, mb = 26 }) => (
  <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '18px', boxShadow: 'var(--shadow)', padding: '6px 20px', marginBottom: mb + 'px' }}>{children}</div>
);

const segStyle = (on) => ({ background: on ? 'var(--primary)' : 'transparent', color: on ? '#fff' : 'var(--text2)' });

// Anonymous by default, upgradeable on request. Deliberately framed as "keep
// your conversations", not "create an account": the benefit is the thing worth
// saying, and for this audience an account is a cost, not a feature.
function AccountUpgrade({ onLink, showToast }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onLink(email.trim(), password);
      showToast('Check your email to confirm — your conversations are already saved.');
      setOpen(false);
    } catch (err) {
      setError(err?.message || 'Could not save that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: '1rem' }}
      >
        <span style={{ flex: '1' }}>
          <span style={{ display: 'block', fontWeight: '600', color: 'var(--primary-d)' }}>Use these conversations on another device</span>
          <span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>
            They are saved on this device already. Add an email to reach them anywhere.
          </span>
        </span>
        <span style={{ color: 'var(--text2)' }}>›</span>
      </button>
    );
  }

  const field = { minHeight: '48px', padding: '0 14px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text)', fontSize: '.95rem', boxSizing: 'border-box', width: '100%' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 0 18px' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontWeight: '600', fontSize: '.92rem' }}>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={field} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontWeight: '600', fontSize: '.92rem' }}>Choose a password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={field} />
      </label>
      <p style={{ margin: 0, color: 'var(--text2)', fontSize: '.85rem', lineHeight: 1.5 }}>
        Nothing you have already said is lost — this attaches your existing
        conversations to an email so you can reach them from another device.
      </p>
      {error && <p role="alert" style={{ margin: 0, color: 'var(--amber)', fontSize: '.9rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={submit} disabled={busy || !email.trim() || password.length < 6}
          style={{ minHeight: '46px', padding: '0 20px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: busy ? 'default' : 'pointer', opacity: busy || !email.trim() || password.length < 6 ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ minHeight: '46px', padding: '0 20px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }}>
          Not now
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { settings, setSetting, effDark } = useSettings();
  const { clearHistory: wipeConversations, conversationId } = useChat();
  const { showToast, askConfirm } = useUi();
  const study = useStudy();
  const auth = useAuth();
  // A study participant reaches the model through the server-side proxy with an
  // access code. Showing them an API-key form would be a confusing dead end.
  const inStudy = Boolean(study?.active);
  const [keys, setKeys] = useState(loadKeys);
  const [advOpen, setAdvOpen] = useState(false);
  // Re-renders when the Unity-build probe resolves (locks/unlocks the picker).
  const effective = useEffectiveAvatarProfile(settings.avatarId);
  const who = effective.name;
  const storedProfile = AVATAR_PROFILES[settings.avatarId];
  const storedLocked = storedProfile?.renderer === 'unity' && storedProfile.id !== effective.id;

  const avRows = [
    ['showAvatar', 'Show Avatar', `Display ${who}'s visual avatar interface`],
    ['audioResponses', 'Audio Responses', `${who} speaks responses aloud`],
    ['subtitles', 'Subtitles', 'Show captions during voice responses'],
    ['autoPlay', 'Auto-play Responses', 'Replies play as soon as they arrive'],
    ['concise', 'Get to the Point', 'Shorter answers — no filler words or jargon'],
    ['handsFree', 'Hands-free Conversation', `${who} notices when you finish speaking — no need to tap stop`],
    ['fasterVoice', 'Faster Voice Responses', `${who} starts speaking sooner — turn off if audio sounds choppy`],
  ];

  const keyRows = [
    ['openai', 'OpenAI API key'],
    ['eleven', 'ElevenLabs API key'],
    ['azure', 'Azure Speech key (not used on web)'],
  ];

  // Where conversations actually live right now. The app used to keep them in
  // localStorage only, and every line of copy below still said so; they now go
  // to the account as well, unless anonymous sign-in is unavailable and the
  // device cache is all there is.
  // Deliberately not auth.status: signing in proves only that an account
  // exists, not that a conversation was ever written. If the tables are absent
  // the insert 404s and getOrCreateConversation returns null, and telling
  // someone their conversations are "saved to your account" when nothing was
  // saved is the worst way to be wrong about storage. A real conversation id is
  // the only evidence a write actually landed.
  const savedToAccount = Boolean(conversationId);
  const storageSummary = savedToAccount
    ? 'Saved to your account and cached on this device'
    : 'Saved on this device only — no account is available';
  const storageDetail = savedToAccount
    ? 'Your conversations are saved to your anonymous account so they are still here next time, and cached on this device so the app opens instantly. Questions are sent to the AI provider to be answered.'
    : 'Sign-in is unavailable, so your conversations are saved on this device only and will not follow you to another browser. Questions are still sent to the AI provider to be answered.';

  const clearHistory = () =>
    askConfirm({
      title: 'Clear conversation history?',
      message: savedToAccount
        ? 'This deletes all past conversations from your account and this device. It cannot be undone.'
        : 'This removes all past conversations from this device. It cannot be undone.',
      yesLabel: 'Clear history',
    }, async () => {
      const result = await wipeConversations();
      // Never report a deletion that did not happen — the whole point of the
      // wording above is that the record is gone, not just the screen.
      showToast(result?.deleted ? 'History cleared' : 'Could not clear your history — check your connection and try again');
    });

  return (
    <section style={{ padding: '28px 0 48px', maxWidth: '760px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 22px', letterSpacing: '-.01em' }}>Settings</h1>

      <SectionTitle>Accessibility</SectionTitle>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', minHeight: '64px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)' }}>
          <span style={{ flex: '1', minWidth: '180px' }}><span style={{ display: 'block', fontWeight: '600' }}>Text Size</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>Takes effect everywhere, immediately</span></span>
          <div role="group" aria-label="Text size" style={{ display: 'flex', background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '12px', padding: '3px', gap: '3px' }}>
            {[[0.85, '.85rem'], [1, '1.05rem'], [1.25, '1.3rem']].map(([v, fs]) => (
              <button key={v} onClick={() => setSetting('textScale', v)} aria-label={`Text size ${v === 0.85 ? 'small' : v === 1 ? 'medium' : 'large'}`} style={{ minWidth: '52px', minHeight: '44px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: fs, ...segStyle(settings.textScale === v) }}>A</button>
            ))}
          </div>
        </div>
        <ToggleRow label="High Contrast" sub="Increase colour contrast for readability" on={settings.highContrast} onToggle={() => setSetting('highContrast', !settings.highContrast)} />
        <ToggleRow last label="Dark Mode" sub="Easier on the eyes in low light" on={effDark} onToggle={() => setSetting('darkMode', !effDark)} />
      </Card>

      <SectionTitle>Avatar &amp; Audio</SectionTitle>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', minHeight: '64px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)' }}>
          <span style={{ flex: '1', minWidth: '180px' }}><span style={{ display: 'block', fontWeight: '600' }}>Avatar</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>Who you talk with</span></span>
          <div role="group" aria-label="Avatar" style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '12px', padding: '3px', gap: '3px' }}>
            {Object.values(AVATAR_PROFILES).map((p) => {
              const unityLocked = p.renderer === 'unity' && !isUnityAvailable();
              // Highlight the EFFECTIVE profile: with the stored Unity pick
              // locked (no build), the fallback shows as active instead.
              const on = effective.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { if (!unityLocked) setSetting('avatarId', p.id); }}
                  disabled={unityLocked}
                  title={unityLocked ? 'Unity WebGL build not installed — see public/unity/README.md' : p.description}
                  style={{ minHeight: '44px', padding: '0 14px', borderRadius: '9px', border: 'none', cursor: unityLocked ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '.9rem', opacity: unityLocked ? 0.45 : 1, ...segStyle(on) }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {storedLocked && (
            <div style={{ width: '100%', color: 'var(--text2)', fontSize: '.85rem' }}>
              {storedProfile.name} needs the Unity build — using {effective.name} meanwhile
            </div>
          )}
        </div>
        {avRows.map(([k, label, sub]) => (
          <ToggleRow key={k} label={label} sub={sub} on={!!settings[k]} onToggle={() => setSetting(k, !settings[k])} />
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', minHeight: '64px', padding: '12px 0' }}>
          <span style={{ flex: '1', minWidth: '180px' }}><span style={{ display: 'block', fontWeight: '600' }}>Voice Speed</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>How fast {who} speaks</span></span>
          <div role="group" aria-label="Voice speed" style={{ display: 'flex', background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '12px', padding: '3px', gap: '3px' }}>
            {[['slower', 'Slower'], ['normal', 'Normal'], ['faster', 'Faster']].map(([v, label]) => (
              <button key={v} onClick={() => setSetting('voiceSpeed', v)} style={{ minHeight: '44px', padding: '0 14px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '.9rem', ...segStyle(settings.voiceSpeed === v) }}>{label}</button>
            ))}
          </div>
        </div>
      </Card>

      <SectionTitle>Privacy &amp; Trust</SectionTitle>
      <Card>
        <a href="#/privacy" style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Privacy Policy</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>How this app handles your information</span></span><span style={{ color: 'var(--text2)' }}>›</span></a>
        <button onClick={() => showToast(storageDetail)} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', borderBottom: 'var(--bw) solid var(--border)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Data Security</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>{storageSummary}</span></span><span style={{ color: 'var(--text2)' }}>ⓘ</span></button>
        <a href="#/disclaimer" style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Medical Disclaimer</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>What Aria can and can't help with</span></span><span style={{ color: 'var(--text2)' }}>›</span></a>
        {!inStudy && <button onClick={clearHistory} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Clear Conversation History</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>{savedToAccount ? 'Delete past conversations from your account and this device' : 'Delete past conversations from this device'}</span></span><span style={{ color: 'var(--text2)' }}>›</span></button>}
      </Card>

      {!inStudy && <SectionTitle>Advanced</SectionTitle>}
      {!inStudy && (
      <Card>
        <button onClick={() => setAdvOpen(!advOpen)} aria-expanded={advOpen} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>API Keys</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>For developers — connect live services</span></span><span style={{ color: 'var(--text2)' }}>{advOpen ? '▾' : '▸'}</span></button>
        {advOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0 18px' }}>
            {keyRows.map(([k, label]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontWeight: '600', fontSize: '.92rem' }}>{label}</span>
                <input type="password" value={keys[k]} onChange={(e) => setKeys({ ...keys, [k]: e.target.value })} placeholder="Paste key…" style={{ minHeight: '48px', padding: '0 14px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text)', fontSize: '.95rem', boxSizing: 'border-box' }} />
              </label>
            ))}
            <p style={{ margin: '0', color: 'var(--text2)', fontSize: '.85rem' }}>Keys are stored only in this browser — never sent anywhere else. With an OpenAI key saved, Aria answers with the live knowledge base; without one she uses built-in example answers.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { persistKeys(keys); showToast('Settings saved'); }} style={{ minHeight: '46px', padding: '0 20px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: 'pointer' }} className="hv2">Save keys</button>
              <button onClick={() => { setKeys({ openai: '', eleven: '', azure: '' }); wipeKeys(); showToast('API keys cleared'); }} style={{ minHeight: '46px', padding: '0 20px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv3">Clear keys</button>
            </div>
          </div>
        )}
      </Card>
      )}

      {!inStudy && auth?.status === 'ready' && (
        <>
          <SectionTitle>Your conversations</SectionTitle>
          <Card>
            {auth.isAnonymous ? (
              <AccountUpgrade onLink={auth.linkEmail} showToast={showToast} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0' }}>
                <span style={{ flex: '1' }}>
                  <span style={{ display: 'block', fontWeight: '600' }}>Saved to your account</span>
                  <span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>
                    Your conversations follow you to any device you sign in on.
                  </span>
                </span>
              </div>
            )}
          </Card>
        </>
      )}

      <SectionTitle>About</SectionTitle>
      <Card mb={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Version</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>v1.0 · Made in Aotearoa NZ</span></span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Project</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>University of Auckland Part IV Software Engineering project</span></span></div>
        <button onClick={() => { setSetting('onboarded', false); navigate('#/onboarding/1'); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600', color: 'var(--primary-d)' }}>Redo the setup questions</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>Run the guided onboarding again</span></span><span style={{ color: 'var(--text2)' }}>›</span></button>
      </Card>
    </section>
  );
}
