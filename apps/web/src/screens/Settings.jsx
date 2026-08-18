import React, { useState } from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useUi } from '../state/UiContext.jsx';
import { loadKeys, saveKeys as persistKeys, clearKeys as wipeKeys } from '../state/keysStore.js';
import { useStudy } from '../study/StudyContext.jsx';
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

export default function Settings() {
  const { settings, setSetting, effDark } = useSettings();
  const { newConvo } = useChat();
  const { showToast, askConfirm } = useUi();
  const study = useStudy();
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

  const clearHistory = () =>
    askConfirm({ title: 'Clear conversation history?', message: 'This removes all past conversations from this browser. It cannot be undone.', yesLabel: 'Clear history' }, () => {
      newConvo();
      showToast('History cleared');
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
        <button onClick={() => showToast('Conversations are stored only on this device — nothing is sent to a server.')} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', borderBottom: 'var(--bw) solid var(--border)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Data Security</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>Conversations are stored only on this device</span></span><span style={{ color: 'var(--text2)' }}>ⓘ</span></button>
        <a href="#/disclaimer" style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Medical Disclaimer</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>What Aria can and can't help with</span></span><span style={{ color: 'var(--text2)' }}>›</span></a>
        {!inStudy && <button onClick={clearHistory} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Clear Conversation History</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>Remove past conversations from this device</span></span><span style={{ color: 'var(--text2)' }}>›</span></button>}
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

      <SectionTitle>About</SectionTitle>
      <Card mb={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Version</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>v1.0 · Made in Aotearoa NZ</span></span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', borderBottom: 'var(--bw) solid var(--border)' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600' }}>Project</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>University of Auckland Part IV Software Engineering project</span></span></div>
        <button onClick={() => { setSetting('onboarded', false); navigate('#/onboarding/1'); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 0', width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: '1rem' }}><span style={{ flex: '1' }}><span style={{ display: 'block', fontWeight: '600', color: 'var(--primary-d)' }}>Redo the setup questions</span><span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem' }}>Run the guided onboarding again</span></span><span style={{ color: 'var(--text2)' }}>›</span></button>
      </Card>
    </section>
  );
}
