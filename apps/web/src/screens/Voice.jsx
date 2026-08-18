// Voice — the avatar room: the Unity scene fills the entire window (the
// WebGL build reframes the shared camera vertically for a video-call shot),
// and every control floats over it as translucent glass — close top-left,
// status chip top-center, repeat/transcript icons top-right, captions above a
// bottom cluster of mic + type-or-talk message bar (oshikoi-style). There is
// NO demo mode — without an OpenAI key a setup card sits over the stage.
import React, { useState } from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useVoiceConversation } from '../voice/useVoiceConversation.js';
import { voiceAvatar } from '../avatar/avatarBridge.js';
import { navigate, useWidth } from '../state/router.js';
import { AvatarBust, ThreeAvatarMount } from '../avatar/AvatarStage.jsx';
import { UnityAvatarMount } from '../avatar/unity/UnityAvatarStage.jsx';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';
import { loadKeys, saveKeys } from '../state/keysStore.js';
import { hasCredentials } from '../services/transport.js';

// Translucent chrome over the live scene; readable in both themes.
const glass = {
  background: 'color-mix(in srgb, var(--surface) 72%, transparent)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: 'var(--bw) solid color-mix(in srgb, var(--border) 55%, transparent)',
  boxShadow: 'var(--shadow)',
};

// ── Stage: the scene IS the screen ──────────────────────────────────────────
function VoiceStage({ profile, showAvatar, state }) {
  const bigBust = (
    <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
      <AvatarBust size={170} />
    </div>
  );
  if (!showAvatar) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {bigBust}
      </div>
    );
  }
  if (profile.renderer === 'unity') {
    return (
      <UnityAvatarMount characterId={profile.unityCharacterId} name={profile.name}>
        {bigBust}
      </UnityAvatarMount>
    );
  }
  return <ThreeAvatarMount state={state}>{bigBust}</ThreeAvatarMount>;
}

// ── Status chip: state label + ornaments, top-center ────────────────────────
function StatusChip({ vState, who }) {
  const label = vState === 'idle' ? 'Tap the mic or type below'
    : vState === 'listening' ? 'Listening…'
      : vState === 'thinking' ? 'Thinking…'
        : `${who} is speaking`;
  return (
    <div aria-live="polite" style={{ ...glass, display: 'flex', alignItems: 'center', gap: '10px', borderRadius: '999px', padding: '10px 20px', fontWeight: 700, fontSize: '1.02rem' }}>
      {label}
      {vState === 'thinking' && (
        <span style={{ display: 'flex', gap: '5px' }} aria-hidden="true">
          {[0, 0.15, 0.3].map((d) => (
            <span key={d} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--primary)', animation: `dgBounce 1.2s ${d}s infinite` }} />
          ))}
        </span>
      )}
      {vState === 'speaking' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px' }} aria-hidden="true">
          {[0, 0.12, 0.24, 0.36].map((d) => (
            <span key={d} style={{ width: '3px', height: '14px', borderRadius: '2px', background: 'var(--primary-d)', animation: `dgBar .8s ease-in-out ${d}s infinite` }} />
          ))}
        </span>
      )}
    </div>
  );
}

// ── Keys setup card (no demo mode — replaces the controls) ──────────────────
function SetupCard({ who, keys, setKeys, onSave }) {
  const canSave = keys.openai.trim().length > 0;
  const field = (label, k, placeholder, helper) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
      <span style={{ fontWeight: 600, fontSize: '.95rem' }}>{label}</span>
      <input
        type="password"
        value={keys[k]}
        onChange={(e) => setKeys({ ...keys, [k]: e.target.value })}
        placeholder={placeholder}
        style={{ minHeight: '48px', padding: '0 14px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text)', fontSize: '.95rem', boxSizing: 'border-box' }}
      />
      {helper && <span style={{ color: 'var(--text2)', fontSize: '.85rem' }}>{helper}</span>}
    </label>
  );
  return (
    <div style={{ width: 'min(430px, calc(100% - 36px))', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
      <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Set up voice conversations</div>
      <p style={{ margin: 0, color: 'var(--text2)', fontSize: '.95rem', lineHeight: 1.5 }}>
        To talk with {who}, add your OpenAI key. Your keys are stored only in this browser — they are never sent anywhere else.
      </p>
      {field('OpenAI API key', 'openai', 'sk-…')}
      {field('ElevenLabs API key', 'eleven', 'Optional', `Optional — gives ${who} a more natural voice and better lip movement.`)}
      <button
        onClick={onSave}
        disabled={!canSave}
        className="hv2"
        style={{ minHeight: '50px', borderRadius: '14px', border: 'none', background: canSave ? 'var(--primary)' : 'var(--border)', color: canSave ? '#fff' : 'var(--text2)', fontWeight: 700, fontSize: '1.02rem', cursor: canSave ? 'pointer' : 'not-allowed' }}
      >
        Save and start
      </button>
      <a href="#/app/settings" style={{ color: 'var(--primary-d)', fontWeight: 600, fontSize: '.92rem', textDecoration: 'none' }}>
        Open Settings instead ›
      </a>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────
const RepeatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v5h5" /></svg>
);
const TranscriptIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></svg>
);
const MuteIcon = ({ muted }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {muted ? <path d="M16 9l6 6M22 9l-6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
  </svg>
);
const MicIcon = ({ s = 30 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></svg>
);
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
);

export default function Voice() {
  const { settings } = useSettings();
  const { messages, appendMessage } = useChat();
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState('');
  // Form state (setup card inputs) is separate from the SAVED keys that gate
  // the live conversation — typing must not unlock; only "Save and start" does.
  const [keys, setKeys] = useState(loadKeys);
  const [savedKeys, setSavedKeys] = useState(loadKeys);

  const profile = useEffectiveAvatarProfile(settings.avatarId);
  const who = profile.name;
  // A study participant reaches the model through the server-side proxy with an
  // access code, so there is nothing for them to set up — and showing them a
  // raw `sk-…` field would be both confusing and a dead end.
  const hasKey = savedKeys.openai.trim().length > 0 || hasCredentials();

  const { vState, vTranscript, vDone, vSubtitle, micTap, askText, repeatLast, error, clearError } = useVoiceConversation({
    enabled: hasKey,
    avatar: voiceAvatar,
    settings,
    messages,
    appendMessage,
    muted,
  });

  const vIdle = vState === 'idle';
  const vListening = vState === 'listening';
  const vSpeaking = vState === 'speaking';
  const hf = !!settings.handsFree;
  const micLabel = vIdle ? 'Tap to talk' : vListening ? (hf ? 'End conversation' : 'Tap when finished') : vSpeaking ? 'Tap to interrupt' : 'One moment…';
  const showSubtitle = !!settings.subtitles && vSpeaking && !!vSubtitle;
  const canType = vIdle || vSpeaking;

  // A long answer stacked above the mic covers the avatar's face — the one
  // thing the screen exists to show. Where there is room beside him, the
  // captions move into a rail down the right instead; narrow screens have no
  // such room and keep them above the controls.
  const width = useWidth();
  const sideCaptions = width >= 1024;

  const closeVoice = () => { history.length > 1 ? history.back() : navigate('#/app/home'); };
  const saveSetup = () => { saveKeys(keys); setSavedKeys(keys); };
  const sendDraft = () => {
    const t = draft.trim();
    if (!t || !canType) return;
    setDraft('');
    askText(t);
  };

  const iconBtn = { ...glass, width: '46px', height: '46px', borderRadius: '14px', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  const captions = showSubtitle ? (
    <div
      aria-live="polite"
      style={{
        ...glass,
        background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
        borderRadius: '16px',
        padding: '14px 20px',
        fontSize: '1.08rem',
        lineHeight: 1.5,
        overflowY: 'auto',
        pointerEvents: 'auto',
        ...(sideCaptions
          ? { width: '100%', maxHeight: '100%', boxSizing: 'border-box' }
          : { maxWidth: '34em', maxHeight: '28dvh' }),
      }}
    >
      {vSubtitle}
    </div>
  ) : null;

  return (
    <section style={{ position: 'fixed', top: 'var(--study-overlay-h, 0px)', left: 0, right: 0, height: 'calc(100dvh - var(--study-overlay-h, 0px))', zIndex: 50, overflow: 'hidden', background: 'radial-gradient(circle at 50% 30%, var(--tint) 0%, var(--bg) 80%)' }}>
      {/* The scene fills the screen */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <VoiceStage profile={profile} showAvatar={!!settings.showAvatar} state={vState} />
      </div>

      {/* Top overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', pointerEvents: 'none' }}>
        <button onClick={closeVoice} aria-label="Close voice conversation" className="hv3" style={{ ...iconBtn, position: 'absolute', left: '16px', top: '16px', fontSize: '1.1rem', pointerEvents: 'auto' }}>✕</button>
        {hasKey && <div style={{ pointerEvents: 'auto' }}><StatusChip vState={vState} who={who} /></div>}
        {hasKey && (
          <div style={{ position: 'absolute', right: '16px', top: '16px', display: 'flex', gap: '10px', pointerEvents: 'auto' }}>
            <button onClick={repeatLast} title="Repeat last answer" aria-label="Repeat last answer" className="hv3" style={iconBtn}><RepeatIcon /></button>
            <button onClick={() => setPanel(!panel)} title="Transcript" aria-label="Show transcript" className="hv3" style={iconBtn}><TranscriptIcon /></button>
          </div>
        )}
      </div>

      {/* Wide screens: captions ride down the right, clear of the avatar and of
          the top-right controls / bottom cluster. */}
      {hasKey && sideCaptions && captions && (
        <div style={{ position: 'absolute', top: '82px', bottom: '150px', right: '16px', width: 'min(400px, 30vw)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pointerEvents: 'none' }}>
          {captions}
        </div>
      )}

      {/* Setup card (no keys) */}
      {!hasKey && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
          <SetupCard who={who} keys={keys} setKeys={setKeys} onSave={saveSetup} />
        </div>
      )}

      {/* Bottom overlay: captions + mic + message bar */}
      {hasKey && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
          {vListening && !!vTranscript && (
            <div style={{ ...glass, maxWidth: '32em', fontSize: '1.05rem', color: 'var(--text)', borderRadius: '16px', padding: '10px 18px', opacity: vDone ? 1 : 0.75, pointerEvents: 'auto' }}>
              {vTranscript}
            </div>
          )}
          {!sideCaptions && captions}
          {!!error && (
            <div role="alert" style={{ maxWidth: '34em', background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderLeft: '4px solid var(--amber)', borderRadius: '14px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'auto' }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button onClick={clearError} aria-label="Dismiss" style={{ minWidth: '36px', minHeight: '36px', borderRadius: '10px', border: 'none', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}
          {hf && vListening && (
            <div style={{ ...glass, color: 'var(--text2)', fontSize: '.9rem', borderRadius: '999px', padding: '4px 14px', pointerEvents: 'auto' }}>
              {who} will notice when you finish speaking
            </div>
          )}

          <div style={{ position: 'relative', pointerEvents: 'auto' }}>
            {vListening && <span aria-hidden="true" style={{ position: 'absolute', inset: '-6px', borderRadius: '50%', border: '3px solid var(--primary)', animation: 'dgPulse 1.6s ease-out infinite' }} />}
            <button onClick={micTap} aria-label={micLabel} title={micLabel} className="hv2" style={{ width: '72px', height: '72px', borderRadius: '50%', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 22px rgba(45,95,112,.45)' }}>
              <MicIcon />
            </button>
          </div>
          {!vIdle && (
            <div style={{ ...glass, color: 'var(--text2)', fontWeight: 600, fontSize: '.9rem', borderRadius: '999px', padding: '4px 14px', pointerEvents: 'auto' }}>{micLabel}</div>
          )}

          <div style={{ ...glass, width: 'min(560px, calc(100% - 8px))', borderRadius: '18px', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto', boxSizing: 'border-box' }}>
            <button onClick={() => setMuted(!muted)} aria-label={muted ? `Unmute ${who}` : `Mute ${who}`} title={muted ? `Unmute ${who}` : `Mute ${who}`} className="hv3" style={{ width: '44px', height: '44px', flexShrink: 0, borderRadius: '12px', border: 'none', background: muted ? 'var(--amber-bg)' : 'var(--elev)', color: muted ? 'var(--amber)' : 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MuteIcon muted={muted} />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendDraft(); }}
              placeholder={canType ? `Message ${who}…` : 'One moment…'}
              disabled={!canType}
              aria-label={`Message ${who}`}
              style={{ flex: 1, minWidth: 0, minHeight: '44px', padding: '0 12px', borderRadius: '12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '1rem' }}
            />
            <button onClick={sendDraft} disabled={!draft.trim() || !canType} aria-label="Send message" className="hv2" style={{ width: '44px', height: '44px', flexShrink: 0, borderRadius: '12px', border: 'none', background: draft.trim() && canType ? 'var(--primary)' : 'var(--elev)', color: draft.trim() && canType ? '#fff' : 'var(--text2)', cursor: draft.trim() && canType ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      {/* Transcript bottom sheet */}
      {panel && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '55dvh', overflowY: 'auto', background: 'var(--surface)', borderTop: 'var(--bw) solid var(--border)', borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 30px rgba(10,20,28,.25)', padding: '20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '1.1rem' }}>Transcript</strong>
            <button onClick={() => setPanel(false)} aria-label="Close transcript" className="hv3" style={{ width: '44px', height: '44px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text2)', cursor: 'pointer' }}>✕</button>
          </div>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {m.role === 'user' ? (
                <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--primary)', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px' }}>{m.text}</div>
              ) : (
                <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px' }}>{m.text}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
