// Enter, check and store a guest access code (state/accessStore.js), so an
// invited carer can use voice and live answers without an API key. Used on the
// voice setup card and in Settings. `onChange` lets the parent re-render: whether
// the app has credentials is read from storage during render, which React does
// not watch.
import React, { useState } from 'react';
import { validateAccessCode, warmStudyProxy } from '../services/transport.js';
import { loadAccess, saveAccess, clearAccess } from '../state/accessStore.js';

const RESULT = {
  ok: 'Code accepted. Voice and live answers are on.',
  limit: 'Code accepted, but today’s limit is used up. It resets around midday NZ time.',
  rejected: 'That code was not accepted. Check it and try again.',
  invalid: 'Access codes are at least 16 characters. Check you copied all of it.',
  unavailable: 'The code could not be checked just now. Try again in a moment.',
};
const SAVED = {
  ok: 'An access code is saved on this device.',
  limit: 'An access code is saved on this device (today’s limit was reached).',
  rejected: 'The saved access code is no longer accepted. Enter a new one.',
};

export function AccessCodeForm({ onChange }) {
  const [saved, setSaved] = useState(loadAccess);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setBusy(true);
    setMsg('');
    const r = await validateAccessCode(code);
    setBusy(false);
    if (r.ok) {
      saveAccess(code, r.status);
      setSaved(loadAccess());
      setCode('');
      warmStudyProxy();
      onChange?.();
    }
    setMsg(RESULT[r.status]);
  };
  const remove = () => {
    clearAccess();
    setSaved(null);
    setMsg('Access code removed from this device.');
    onChange?.();
  };

  const canSubmit = code.trim().length > 0 && !busy;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ flex: '1', color: 'var(--text2)', fontSize: '.92rem' }}>{SAVED[saved.status] ?? SAVED.ok}</span>
          <button onClick={remove} className="hv3" style={{ minHeight: '40px', padding: '0 14px', borderRadius: '10px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }}>Remove</button>
        </div>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontWeight: '600', fontSize: '.95rem' }}>{saved ? 'Replace the access code' : 'Access code'}</span>
        <input
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
          placeholder="Paste the code you were given"
          style={{ minHeight: '48px', padding: '0 14px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text)', fontSize: '.95rem', boxSizing: 'border-box' }}
        />
      </label>
      <button
        onClick={submit}
        disabled={!canSubmit}
        className="hv2"
        style={{ minHeight: '48px', borderRadius: '12px', border: 'none', background: canSubmit ? 'var(--primary)' : 'var(--border)', color: canSubmit ? '#fff' : 'var(--text2)', fontWeight: '700', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
      >
        {busy ? 'Checking…' : 'Use code'}
      </button>
      {msg && <p role="status" style={{ margin: '0', color: 'var(--text2)', fontSize: '.92rem' }}>{msg}</p>}
    </div>
  );
}
