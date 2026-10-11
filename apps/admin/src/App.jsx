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
    return <SignIn signIn={auth.signIn} />;
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

function SignIn({ signIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSigning(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      // Shown as-is, not replaced with a generic message: Supabase's own
      // wrong-credentials message ("Invalid login credentials") is already
      // vague enough not to leak which part was wrong, and anything else
      // (network/CORS/config failures) is a different problem that needs to
      // look different on screen — masking it here once already cost a long
      // detour chasing a "wrong password" that was actually a CSP block.
      setError(err.message);
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="app">
      <h1>DementiaGuide AI — knowledge base intake</h1>
      <p>Sign in with the email and password you were given.</p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={signing || !email.trim() || !password}>
          {signing ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
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
