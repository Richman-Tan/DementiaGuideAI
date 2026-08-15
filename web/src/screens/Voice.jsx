// Voice — a full-bleed "video call" with the avatar (Call Annie / HeyGen
// LiveAvatar pattern): the avatar fills the viewport; status, captions and
// controls float on top. There is NO demo mode — without an OpenAI key a
// setup card sits over the (still-loading/live) stage instead of the mic.
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

// ── Stage: the avatar as the screen ─────────────────────────────────────────
// The Unity camera's framing was tuned for a squarish stage, so instead of a
// raw viewport-sized canvas (which blows the fixed face framing up to an
// extreme close-up) the canvas lives in a centered portrait column scaled a
// touch beyond the viewport height — video-call framing, gradient letterbox
// on wide screens, cropped edges on phones.
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
  const mount = profile.renderer === 'unity'
    ? (
      <UnityAvatarMount characterId={profile.unityCharacterId} name={profile.name}>
        {bigBust}
      </UnityAvatarMount>
    )
    : <ThreeAvatarMount state={state}>{bigBust}</ThreeAvatarMount>;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: '100%', aspectRatio: '9 / 16', maxWidth: '100%', flexShrink: 0 }}>
        {mount}
      </div>
    </div>
  );
}

// ── Status chip: the old circle's state chrome, moved top-center ────────────
function StatusChip({ vState, who }) {
  const label = vState === 'idle' ? 'Tap to talk'
    : vState === 'listening' ? 'Listening…'
      : vState === 'thinking' ? 'Thinking…'
        : `${who} is speaking`;
  return (
    <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '999px', boxShadow: 'var(--shadow)', padding: '10px 20px', fontWeight: 700, fontSize: '1.05rem' }}>
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

// ── Keys setup card (no demo mode — this replaces the controls) ─────────────
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

// ── Icon buttons for narrow screens ─────────────────────────────────────────
const RepeatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v5h5" /></svg>
);
const TranscriptIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></svg>
);
const MuteIcon = ({ muted }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {muted ? <path d="M16 9l6 6M22 9l-6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
  </svg>
);
const MicIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></svg>
);

export default function Voice() {
  const { settings } = useSettings();
  const { messages, appendMessage } = useChat();
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState(false);
  // Form state (the setup card's inputs) is separate from the SAVED keys that
  // gate the live conversation — typing must not unlock the mic; only
  // "Save and start" (which persists) does.
  const [keys, setKeys] = useState(loadKeys);
  const [savedKeys, setSavedKeys] = useState(loadKeys);
  const width = useWidth();
  const narrow = width < 480;

  const profile = useEffectiveAvatarProfile(settings.avatarId);
  const who = profile.name;
  const hasKey = savedKeys.openai.trim().length > 0;

  const { vState, vTranscript, vDone, vSubtitle, micTap, repeatLast, error, clearError } = useVoiceConversation({
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

  const closeVoice = () => { history.length > 1 ? history.back() : navigate('#/app/home'); };
  const saveSetup = () => { saveKeys(keys); setSavedKeys(keys); };

  const pill = { minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: 600, cursor: 'pointer' };
  const iconBtn = { width: '52px', height: '52px', borderRadius: '50%', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <section style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100dvh', zIndex: 50, overflow: 'hidden', background: 'radial-gradient(circle at 50% 30%, var(--tint) 0%, var(--bg) 80%)' }}>
      {/* Stage — the avatar fills the screen */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <VoiceStage profile={profile} showAvatar={!!settings.showAvatar} state={vState} />
      </div>

      {/* Top overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '18px', pointerEvents: 'none' }}>
        <button onClick={closeVoice} aria-label="Close voice conversation" className="hv3" style={{ position: 'absolute', left: '18px', top: '18px', width: '48px', height: '48px', borderRadius: '14px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', fontSize: '1.15rem', pointerEvents: 'auto' }}>✕</button>
        {hasKey && <div style={{ pointerEvents: 'auto' }}><StatusChip vState={vState} who={who} /></div>}
      </div>

      {/* Setup card (no keys) — centered over the stage */}
      {!hasKey && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
          <SetupCard who={who} keys={keys} setKeys={setKeys} onSave={saveSetup} />
        </div>
      )}

      {/* Bottom overlay: captions + controls */}
      {hasKey && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '18px', paddingBottom: 'max(18px, env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
          {vListening && !!vTranscript && (
            <div style={{ maxWidth: '32em', fontSize: '1.08rem', color: 'var(--text)', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '10px 18px', boxShadow: 'var(--shadow)', opacity: vDone ? 1 : 0.65, pointerEvents: 'auto' }}>
              {vTranscript}
            </div>
          )}
          {showSubtitle && (
            <div style={{ maxWidth: '34em', maxHeight: '30dvh', overflowY: 'auto', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '14px 20px', fontSize: '1.08rem', lineHeight: 1.5, boxShadow: 'var(--shadow)', pointerEvents: 'auto' }}>
              {vSubtitle}
            </div>
          )}
          {!!error && (
            <div role="alert" style={{ maxWidth: '34em', background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderLeft: '4px solid var(--amber)', borderRadius: '14px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'auto' }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button onClick={clearError} aria-label="Dismiss" style={{ minWidth: '36px', minHeight: '36px', borderRadius: '10px', border: 'none', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}
          {hf && vListening && (
            <div style={{ color: 'var(--text2)', fontSize: '.92rem', background: 'var(--surface)', borderRadius: '999px', padding: '4px 14px', pointerEvents: 'auto' }}>
              {who} will notice when you finish speaking
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: narrow ? '16px' : '14px', pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'center' }}>
            {narrow ? (
              <>
                <button onClick={repeatLast} aria-label="Repeat last answer" className="hv4" style={iconBtn}><RepeatIcon /></button>
                <div style={{ position: 'relative' }}>
                  {vListening && <span aria-hidden="true" style={{ position: 'absolute', inset: '-6px', borderRadius: '50%', border: '3px solid var(--primary)', animation: 'dgPulse 1.6s ease-out infinite' }} />}
                  <button onClick={micTap} aria-label={micLabel} className="hv2" style={{ width: '84px', height: '84px', borderRadius: '50%', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 22px rgba(45,95,112,.4)' }}>
                    <MicIcon />
                  </button>
                </div>
                <button onClick={() => setPanel(!panel)} aria-label="Show transcript" className="hv4" style={iconBtn}><TranscriptIcon /></button>
                <button onClick={() => setMuted(!muted)} aria-label={muted ? `Unmute ${who}` : `Mute ${who}`} className="hv4" style={{ ...iconBtn, color: muted ? 'var(--amber)' : 'var(--text2)' }}><MuteIcon muted={muted} /></button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ position: 'relative' }}>
                  {vListening && <span aria-hidden="true" style={{ position: 'absolute', inset: '-6px', borderRadius: '50%', border: '3px solid var(--primary)', animation: 'dgPulse 1.6s ease-out infinite' }} />}
                  <button onClick={micTap} aria-label={micLabel} className="hv2" style={{ width: '92px', height: '92px', borderRadius: '50%', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 22px rgba(45,95,112,.4)' }}>
                    <MicIcon />
                  </button>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text2)', background: 'var(--surface)', borderRadius: '999px', padding: '4px 14px' }}>{micLabel}</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={repeatLast} className="hv4" style={pill}>Repeat last answer</button>
                  <button onClick={() => setPanel(!panel)} className="hv4" style={pill}>Transcript</button>
                  <button onClick={() => setMuted(!muted)} className="hv4" style={pill}>{muted ? `Unmute ${who}` : `Mute ${who}`}</button>
                </div>
              </div>
            )}
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
