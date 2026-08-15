import React, { useState } from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useVoiceLoop } from '../voice/useVoiceLoop.js';
import { useVoiceConversation } from '../voice/useVoiceConversation.js';
import { isMockMode } from '../services/chatService.js';
import { voiceAvatar } from '../avatar/avatarBridge.js';
import { navigate } from '../state/router.js';
import { AvatarStage } from '../avatar/AvatarStage.jsx';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';

export default function Voice() {
  const { settings } = useSettings();
  const { messages, appendMessage } = useChat();
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState(false);

  // Mock (no API key / ?mock=1): the prototype's simulated loop. Real: the full
  // STT → RAG-streaming → TTS pipeline. Both hooks share one interface; the
  // inactive one idles (its machine only acts on micTap).
  const mock = isMockMode();
  const sim = useVoiceLoop({ settings, appendMessage, messages, muted });
  const real = useVoiceConversation({
    enabled: !mock,
    avatar: voiceAvatar,
    settings,
    messages,
    appendMessage,
    muted,
  });
  const { vState, vTranscript, vDone, vSubtitle, micTap, repeatLast, error, clearError } = mock
    ? { ...sim, error: null, clearError: () => {} }
    : real;

  const who = useEffectiveAvatarProfile(settings.avatarId).name;
  const vIdle = vState === 'idle';
  const vListening = vState === 'listening';
  const vThinking = vState === 'thinking';
  const vSpeaking = vState === 'speaking';
  const hf = !!settings.handsFree;
  const vLabel = vIdle ? 'Tap to talk' : vListening ? 'Listening…' : vThinking ? 'Thinking…' : `${who} is speaking`;
  const micLabel = vIdle ? 'Tap to talk' : vListening ? (hf ? 'End conversation' : 'Tap when finished') : vSpeaking ? 'Tap to interrupt' : 'One moment…';
  const showSubtitle = !!settings.subtitles && vSpeaking && !!vSubtitle;

  const closeVoice = () => { history.length > 1 ? history.back() : navigate('#/app/home'); };

  return (
    <section style={{ position: 'fixed', inset: '0', zIndex: '50', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', background: 'radial-gradient(circle at 50% 26%,var(--tint) 0%,var(--bg) 78%)', padding: '18px', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
        <button onClick={closeVoice} aria-label="Close voice conversation" style={{ width: '48px', height: '48px', borderRadius: '14px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', fontSize: '1.15rem' }} className="hv3">✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', flex: '1', justifyContent: 'center', width: '100%', maxWidth: '640px', textAlign: 'center' }}>
        {settings.showAvatar && <AvatarStage state={vState} />}
        <div aria-live="polite" style={{ fontSize: '1.3rem', fontWeight: '700' }}>{vLabel}</div>
        {vListening && (
          <div style={{ minHeight: '2.2em', maxWidth: '32em', fontSize: '1.1rem', color: 'var(--text)', opacity: vDone ? 1 : 0.55 }}>{vTranscript}</div>
        )}
        {vThinking && (
          <div style={{ display: 'flex', gap: '6px' }}>
            {[0, 0.15, 0.3].map((d) => (
              <span key={d} style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--primary)', animation: `dgBounce 1.2s ${d}s infinite` }} />
            ))}
          </div>
        )}
        {showSubtitle && (
          <div style={{ maxWidth: '34em', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '14px 20px', fontSize: '1.08rem', lineHeight: '1.5', boxShadow: 'var(--shadow)' }}>{vSubtitle}</div>
        )}
        {!!error && (
          <div role="alert" style={{ maxWidth: '34em', background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderLeft: '4px solid var(--amber)', borderRadius: '14px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={clearError} aria-label="Dismiss" style={{ minWidth: '36px', minHeight: '36px', borderRadius: '10px', border: 'none', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', paddingBottom: '8px', width: '100%' }}>
        {hf && vListening && <div style={{ color: 'var(--text2)', fontSize: '.92rem' }}>{who} will notice when you finish speaking</div>}
        <button onClick={micTap} aria-label={micLabel} style={{ width: '92px', height: '92px', borderRadius: '50%', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 22px rgba(45,95,112,.4)' }} className="hv2">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></svg>
        </button>
        <div style={{ fontWeight: '600', color: 'var(--text2)' }}>{micLabel}</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={repeatLast} style={{ minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv4">Repeat last answer</button>
          <button onClick={() => setPanel(!panel)} style={{ minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv4">Transcript</button>
          <button onClick={() => setMuted(!muted)} style={{ minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv4">{muted ? `Unmute ${who}` : `Mute ${who}`}</button>
        </div>
      </div>
      {panel && (
        <div style={{ position: 'absolute', left: '0', right: '0', bottom: '0', maxHeight: '55vh', overflowY: 'auto', background: 'var(--surface)', borderTop: 'var(--bw) solid var(--border)', borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 30px rgba(10,20,28,.25)', padding: '20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '1.1rem' }}>Transcript</strong>
            <button onClick={() => setPanel(false)} aria-label="Close transcript" style={{ width: '44px', height: '44px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text2)', cursor: 'pointer' }} className="hv3">✕</button>
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
