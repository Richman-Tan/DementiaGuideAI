import { useState } from 'react';
import { useAuth } from './lib/useAuth.js';
import { CATEGORIES, validate, buildRequestBody, fileToBase64, submitResource } from './lib/api.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const EMPTY_FIELDS = {
  sourceType: 'url',
  title: '',
  sourceOrg: '',
  sourceUrl: '',
  licence: '',
  category: CATEGORIES[0],
  country: '',
  file: null,
  url: '',
  text: '',
};

export default function App() {
  const auth = useAuth();

  if (auth.status === 'unavailable') {
    return (
      <div className="app">
        <h1>DementiaGuide AI — knowledge base intake</h1>
        <p className="error">Sign-in isn't configured for this deployment (missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).</p>
      </div>
    );
  }

  if (auth.status === 'loading') {
    return (
      <div className="app">
        <h1>DementiaGuide AI — knowledge base intake</h1>
        <p>Loading…</p>
      </div>
    );
  }

  if (!auth.accessToken) {
    return <SignIn sendMagicLink={auth.sendMagicLink} />;
  }

  return (
    <div className="app">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Add a resource to the knowledge base</h1>
        <button type="button" className="signout" onClick={auth.signOut}>
          Sign out ({auth.email})
        </button>
      </div>
      <p>
        Submissions are reviewed before they're used in chat — a team member checks them in Supabase
        (<code>knowledge_chunks</code>, filter <code>review_status = pending</code>) and approves or rejects.
      </p>
      <IntakeForm accessToken={auth.accessToken} />
    </div>
  );
}

function SignIn({ sendMagicLink }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    try {
      await sendMagicLink(email.trim());
    } catch (err) {
      // Logged, not shown: the message is the same either way so a caller
      // can't tell a config error from "that email isn't allowed to sign in".
      console.error(`[auth] sign-in request failed: ${err.message}`);
    } finally {
      setSending(false);
      setSent(true);
    }
  }

  return (
    <div className="app">
      <h1>DementiaGuide AI — knowledge base intake</h1>
      {sent ? (
        <p>If that email has access, a sign-in link was just sent to it. Open it on this device to continue.</p>
      ) : (
        <>
          <p>Enter the email address you were given access with.</p>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            </div>
            <button type="submit" disabled={sending || !email.trim()}>
              {sending ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function IntakeForm({ accessToken }) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function set(key, value) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = validate(fields);
    if (problem) {
      setStatus('error');
      setError(problem);
      return;
    }

    setStatus('submitting');
    setError(null);
    try {
      const payload = fields.sourceType === 'pdf' ? await fileToBase64(fields.file)
        : fields.sourceType === 'url' ? fields.url.trim()
        : fields.text;
      const body = buildRequestBody(fields, payload);
      const data = await submitResource({ apiBaseUrl: API_BASE_URL, accessToken, body });
      setResult(data);
      setStatus('success');
      setFields(EMPTY_FIELDS);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="source-type">
          {['url', 'pdf', 'text'].map((t) => (
            <label key={t}>
              <input type="radio" name="sourceType" value={t} checked={fields.sourceType === t} onChange={() => set('sourceType', t)} />
              {t === 'url' ? 'Website / article URL' : t === 'pdf' ? 'PDF upload' : 'Paste text'}
            </label>
          ))}
        </div>

        {fields.sourceType === 'url' && (
          <div className="field">
            <label htmlFor="url">URL</label>
            <input id="url" type="url" value={fields.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
          </div>
        )}
        {fields.sourceType === 'pdf' && (
          <div className="field">
            <label htmlFor="file">PDF file (up to ~3MB)</label>
            <input id="file" type="file" accept="application/pdf" onChange={(e) => set('file', e.target.files?.[0] ?? null)} />
          </div>
        )}
        {fields.sourceType === 'text' && (
          <div className="field">
            <label htmlFor="text">Pasted text</label>
            <textarea id="text" rows={8} value={fields.text} onChange={(e) => set('text', e.target.value)} />
          </div>
        )}

        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" type="text" value={fields.title} onChange={(e) => set('title', e.target.value)}
            placeholder="A plain-language name for this resource" />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" value={fields.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sourceOrg">Source organisation (optional)</label>
          <input id="sourceOrg" type="text" value={fields.sourceOrg} onChange={(e) => set('sourceOrg', e.target.value)}
            placeholder="e.g. Alzheimers NZ" />
        </div>
        <div className="field">
          <label htmlFor="sourceUrl">Citation link (optional)</label>
          <input id="sourceUrl" type="url" value={fields.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)}
            placeholder="Where a caregiver could read the original" />
        </div>
        <div className="field">
          <label htmlFor="licence">Licence (optional)</label>
          <input id="licence" type="text" value={fields.licence} onChange={(e) => set('licence', e.target.value)}
            placeholder="e.g. CC BY-NC-SA, or internal" />
        </div>
        <div className="field">
          <label htmlFor="country">Country (optional)</label>
          <input id="country" type="text" value={fields.country} onChange={(e) => set('country', e.target.value)} placeholder="e.g. NZ" />
        </div>

        {status === 'error' && <p className="error">{error}</p>}
        <button type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>

      {status === 'success' && result && (
        <div className="result">
          <p>Saved {result.chunkCount} chunk(s) under <code>{result.document_id}</code>, pending review.</p>
          <ul>
            {result.chunks.map((c) => <li key={c.id}>{c.display_title || c.id}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}
