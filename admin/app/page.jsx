'use client';
import { useState, useEffect, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'caregiving',
  'clinical',
  'communication',
  'prevention',
  'best-practices',
  'home-safety',
  'well-being',
];

const CAT_COLORS = {
  clinical:         { bg: '#dbeafe', text: '#1e40af' },
  caregiving:       { bg: '#dcfce7', text: '#166534' },
  communication:    { bg: '#fef9c3', text: '#854d0e' },
  prevention:       { bg: '#fee2e2', text: '#991b1b' },
  'best-practices': { bg: '#f3e8ff', text: '#5b21b6' },
  'home-safety':    { bg: '#ffedd5', text: '#9a3412' },
  'well-being':     { bg: '#ccfbf1', text: '#0f5132' },
};

const EMPTY_CHUNK = {
  id: '', category: 'clinical', title: '', content: '',
  tags: '', source_url: '', source_org: '',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [chunks, setChunks]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState(null);
  const [search, setSearch]               = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editChunk, setEditChunk]         = useState(null);
  const [isNew, setIsNew]                 = useState(false);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState(null);
  const [expandedId, setExpandedId]       = useState(null);

  // ─── Ingest state ──────────────────────────────────────────────────────────
  const [ingestOpen, setIngestOpen]       = useState(false);
  const [ingestMode, setIngestMode]       = useState('url');
  const EMPTY_INGEST = { url: '', category: 'clinical', org: '', prefix: '', sourceUrl: '' };
  const [ingestForm, setIngestForm]       = useState({ url: '', category: 'clinical', org: '', prefix: '', sourceUrl: '' });
  const [ingestFile, setIngestFile]       = useState(null);
  const [ingestStatus, setIngestStatus]   = useState(null);

  useEffect(() => { fetchChunks(); }, []);

  async function fetchChunks() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/chunks');
      if (!res.ok) throw new Error(await res.text());
      setChunks(await res.json());
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return chunks.filter(c => {
      const matchCat = categoryFilter === 'all' || c.category === categoryFilter;
      const q = search.toLowerCase();
      const matchSearch = !search
        || c.title.toLowerCase().includes(q)
        || c.id.toLowerCase().includes(q)
        || (c.tags || []).some(t => t.toLowerCase().includes(q))
        || c.content.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [chunks, search, categoryFilter]);

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const counts = {};
    CATEGORIES.forEach(c => { counts[c] = 0; });
    chunks.forEach(c => { if (counts[c.category] !== undefined) counts[c.category]++; });
    return counts;
  }, [chunks]);

  // ─── Save (create or update) ───────────────────────────────────────────────

  async function handleSave(reEmbed = false) {
    setSaving(true);
    try {
      const payload = {
        ...editChunk,
        tags: typeof editChunk.tags === 'string'
          ? editChunk.tags.split(',').map(t => t.trim()).filter(Boolean)
          : editChunk.tags,
        reEmbed,
      };

      const res = isNew
        ? await fetch('/api/chunks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/chunks/${encodeURIComponent(editChunk.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || 'Save failed');
      }

      showToast(reEmbed
        ? (isNew ? 'Created and embedded ✓' : 'Saved and re-embedded ✓')
        : 'Saved ✓'
      );
      setEditChunk(null);
      await fetchChunks();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id) {
    if (!confirm(`Permanently delete "${id}"?\n\nThis removes it from Supabase immediately and cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/chunks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Deleted ✓');
      if (expandedId === id) setExpandedId(null);
      await fetchChunks();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function openEdit(chunk) {
    setEditChunk({ ...chunk, tags: (chunk.tags || []).join(', ') });
    setIsNew(false);
  }

  function openAdd() {
    setEditChunk({ ...EMPTY_CHUNK });
    setIsNew(true);
  }

  function openIngest() {
    setIngestStatus(null);
    setIngestFile(null);
    setIngestForm({ url: '', category: 'clinical', org: '', prefix: '', sourceUrl: '' });
    setIngestOpen(true);
  }

  async function handleIngest() {
    setIngestStatus({ processing: true });
    try {
      let res;
      if (ingestMode === 'url') {
        res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:      ingestForm.url,
            category: ingestForm.category,
            org:      ingestForm.org,
            prefix:   ingestForm.prefix || undefined,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append('file', ingestFile);
        fd.append('category', ingestForm.category);
        fd.append('org',      ingestForm.org);
        if (ingestForm.sourceUrl) fd.append('sourceUrl', ingestForm.sourceUrl);
        if (ingestForm.prefix)    fd.append('prefix',    ingestForm.prefix);
        res = await fetch('/api/ingest', { method: 'POST', body: fd });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setIngestStatus({ processing: false, result: data });
      await fetchChunks();
    } catch (e) {
      setIngestStatus({ processing: false, error: e.message });
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 20px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
            DementiaGuide AI — Knowledge Base Admin
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
            {chunks.length} total chunks &nbsp;·&nbsp;
            {CATEGORIES.map(c => (
              <span key={c} style={{ marginRight: 10 }}>
                <span style={{ ...catBadgeStyle(c) }}>{c}</span> {stats[c] ?? 0}
              </span>
            ))}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openIngest} style={btn('#7c3aed')}>↑ Ingest URL / PDF</button>
          <button onClick={openAdd} style={btn('#2563eb')}>+ Add Chunk</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by title, ID, tag, or content..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, ...inputSt }}
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          <option value="all">All categories ({chunks.length})</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c} ({stats[c] ?? 0})</option>
          ))}
        </select>
        <button onClick={fetchChunks} style={btn('#6b7280')} title="Refresh">↻ Refresh</button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#6b7280', padding: 48 }}>Loading...</p>
      ) : fetchError ? (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 16, borderRadius: 8 }}>
          <strong>Error loading chunks:</strong> {fetchError}
          <br /><small>Make sure admin/.env.local is configured correctly.</small>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={th}>ID</th>
                <th style={th}>Title</th>
                <th style={th}>Category</th>
                <th style={th}>Tags</th>
                <th style={{ ...th, width: 56, textAlign: 'center' }}>Words</th>
                <th style={{ ...th, width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                    No chunks match your search.
                  </td>
                </tr>
              ) : filtered.map((c, i) => (
                <>
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: expandedId === c.id ? 'none' : '1px solid #f3f4f6',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td style={td}>
                      <code style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 5px', borderRadius: 3 }}>
                        {c.id}
                      </code>
                    </td>
                    <td style={{ ...td, maxWidth: 260, fontWeight: 500, color: '#111827' }}>
                      {c.title}
                    </td>
                    <td style={td}>
                      <span style={catBadgeStyle(c.category)}>{c.category}</span>
                    </td>
                    <td style={{ ...td, maxWidth: 220 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(c.tags || []).slice(0, 5).map(t => (
                          <span key={t} style={tagBadge}>{t}</span>
                        ))}
                        {(c.tags || []).length > 5 && (
                          <span style={{ fontSize: 11, color: '#9ca3af', alignSelf: 'center' }}>
                            +{c.tags.length - 5}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#6b7280' }}>
                      {c.content?.split(/\s+/).length ?? 0}
                    </td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(c)} style={btnSm('#2563eb')}>Edit</button>
                        <button onClick={() => handleDelete(c.id)} style={btnSm('#dc2626')}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded content preview ── */}
                  {expandedId === c.id && (
                    <tr key={`${c.id}-expanded`} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td colSpan={6} style={{ padding: '0 14px 14px 14px' }}>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 20, marginBottom: 8, fontSize: 12, color: '#6b7280' }}>
                            {c.source_org && <span><strong>Org:</strong> {c.source_org}</span>}
                            {c.source_url && (
                              <span>
                                <strong>URL:</strong>{' '}
                                <a href={c.source_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                                  {c.source_url.slice(0, 60)}{c.source_url.length > 60 ? '…' : ''}
                                </a>
                              </span>
                            )}
                            <span><strong>All tags:</strong> {(c.tags || []).join(', ') || '—'}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {c.content}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ingest Modal ── */}
      {ingestOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 28,
            width: '100%', maxWidth: 560,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 700 }}>
              ↑ Ingest from URL or PDF
            </h2>

            {/* Mode tabs */}
            <div style={{ display: 'flex', marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 7, overflow: 'hidden' }}>
              {['url', 'pdf'].map(m => (
                <button
                  key={m}
                  onClick={() => { setIngestMode(m); setIngestFile(null); setIngestStatus(null); }}
                  disabled={ingestStatus?.processing}
                  style={{
                    flex: 1, padding: '9px 0', border: 'none',
                    background: ingestMode === m ? '#7c3aed' : '#fff',
                    color:      ingestMode === m ? '#fff' : '#6b7280',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {m === 'url' ? '🔗 URL' : '📄 PDF'}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {ingestMode === 'url' ? (
                <Field label="URL to ingest">
                  <input
                    style={inputSt}
                    type="url"
                    value={ingestForm.url}
                    onChange={e => setIngestForm(p => ({ ...p, url: e.target.value }))}
                    placeholder="https://www.alzheimers.org.uk/..."
                    disabled={ingestStatus?.processing}
                  />
                </Field>
              ) : (
                <>
                  <Field label="PDF file">
                    <input
                      style={{ ...inputSt, padding: '6px 10px' }}
                      type="file"
                      accept=".pdf"
                      onChange={e => setIngestFile(e.target.files[0] || null)}
                      disabled={ingestStatus?.processing}
                    />
                  </Field>
                  <Field label="Source URL (optional — shown as attribution link)">
                    <input
                      style={inputSt}
                      type="url"
                      value={ingestForm.sourceUrl}
                      onChange={e => setIngestForm(p => ({ ...p, sourceUrl: e.target.value }))}
                      placeholder="https://..."
                      disabled={ingestStatus?.processing}
                    />
                  </Field>
                </>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Category">
                  <select
                    style={inputSt}
                    value={ingestForm.category}
                    onChange={e => setIngestForm(p => ({ ...p, category: e.target.value }))}
                    disabled={ingestStatus?.processing}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Source Organisation">
                  <input
                    style={inputSt}
                    value={ingestForm.org}
                    onChange={e => setIngestForm(p => ({ ...p, org: e.target.value }))}
                    placeholder="e.g. Dementia Australia"
                    disabled={ingestStatus?.processing}
                  />
                </Field>
              </div>

              <Field label="ID prefix (optional — auto-derived from title if blank)">
                <input
                  style={inputSt}
                  value={ingestForm.prefix}
                  onChange={e => setIngestForm(p => ({ ...p, prefix: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder="e.g. alzheimers_disease"
                  disabled={ingestStatus?.processing}
                />
              </Field>
            </div>

            {/* Status */}
            {ingestStatus?.processing && (
              <div style={{ marginTop: 18, padding: '12px 16px', background: '#eff6ff', borderRadius: 7, color: '#1d4ed8', fontSize: 13 }}>
                ⏳ Fetching content, auto-tagging, and generating embeddings… (~10–20 s)
              </div>
            )}
            {ingestStatus?.result && (
              <div style={{ marginTop: 18, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                <strong style={{ color: '#166534' }}>
                  ✓ {ingestStatus.result.chunks_added} chunk{ingestStatus.result.chunks_added !== 1 ? 's' : ''} added
                </strong>
                {ingestStatus.result.article_title && (
                  <p style={{ margin: '4px 0 0', color: '#166534', fontSize: 13 }}>"{ingestStatus.result.article_title}"</p>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#374151' }}>
                  IDs:{' '}
                  {ingestStatus.result.ids.map(id => (
                    <code key={id} style={{ background: '#dcfce7', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{id}</code>
                  ))}
                </p>
              </div>
            )}
            {ingestStatus?.error && (
              <div style={{ marginTop: 18, padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 7, color: '#991b1b', fontSize: 13 }}>
                <strong>Error:</strong> {ingestStatus.error}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIngestOpen(false)}
                style={btn('#6b7280')}
                disabled={ingestStatus?.processing}
              >
                {ingestStatus?.result ? 'Close' : 'Cancel'}
              </button>
              {!ingestStatus?.result && (
                <button
                  onClick={handleIngest}
                  style={btn('#7c3aed')}
                  disabled={
                    ingestStatus?.processing ||
                    (ingestMode === 'url' ? !ingestForm.url : !ingestFile) ||
                    !ingestForm.org
                  }
                >
                  {ingestStatus?.processing ? 'Ingesting…' : '↑ Ingest'}
                </button>
              )}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
              Content is auto-chunked (~500 words), auto-tagged via GPT-4o-mini, and embedded via OpenAI text-embedding-3-small.
            </p>
          </div>
        </div>
      )}

      {/* ── Edit / Add Modal ── */}
      {editChunk && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 28,
            width: '100%', maxWidth: 720,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 22px', fontSize: 17, fontWeight: 700 }}>
              {isNew ? '+ Add New Chunk' : `Edit: ${editChunk.id}`}
            </h2>

            <div style={{ display: 'grid', gap: 14 }}>
              {isNew && (
                <Field label="ID — unique, lowercase, underscores (e.g. caregiving_008)">
                  <input
                    style={inputSt}
                    value={editChunk.id}
                    onChange={e => setEditChunk(p => ({ ...p, id: e.target.value.replace(/\s/g, '_') }))}
                    placeholder="e.g. well-being_001"
                  />
                </Field>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Title">
                  <input
                    style={inputSt}
                    value={editChunk.title}
                    onChange={e => setEditChunk(p => ({ ...p, title: e.target.value }))}
                  />
                </Field>
                <Field label="Category">
                  <select
                    style={inputSt}
                    value={editChunk.category}
                    onChange={e => setEditChunk(p => ({ ...p, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

              <Field label={`Content (${editChunk.content?.split(/\s+/).filter(Boolean).length ?? 0} words)`}>
                <textarea
                  style={{ ...inputSt, height: 220, resize: 'vertical', lineHeight: 1.6 }}
                  value={editChunk.content}
                  onChange={e => setEditChunk(p => ({ ...p, content: e.target.value }))}
                  placeholder="Paste the article text here..."
                />
              </Field>

              <Field label="Tags — comma-separated, specific (e.g. sundowning, agitation, evening routine)">
                <input
                  style={inputSt}
                  value={editChunk.tags}
                  onChange={e => setEditChunk(p => ({ ...p, tags: e.target.value }))}
                  placeholder="e.g. alzheimer's disease, amyloid plaques, early diagnosis"
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Source Organisation">
                  <input
                    style={inputSt}
                    value={editChunk.source_org || ''}
                    onChange={e => setEditChunk(p => ({ ...p, source_org: e.target.value }))}
                    placeholder="e.g. Dementia Australia"
                  />
                </Field>
                <Field label="Source URL">
                  <input
                    style={inputSt}
                    value={editChunk.source_url || ''}
                    onChange={e => setEditChunk(p => ({ ...p, source_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </Field>
              </div>
            </div>

            {/* ── Modal buttons ── */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setEditChunk(null)} style={btn('#6b7280')} disabled={saving}>
                Cancel
              </button>
              {!isNew && (
                <button onClick={() => handleSave(false)} style={btn('#059669')} disabled={saving}>
                  {saving ? 'Saving…' : 'Save (keep embedding)'}
                </button>
              )}
              <button onClick={() => handleSave(true)} style={btn('#2563eb')} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create + Embed' : 'Save + Re-embed'}
              </button>
            </div>

            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
              <strong>Save + Re-embed</strong> regenerates the vector embedding via OpenAI (~$0.00001).
              Use this whenever you change the <em>content</em> — otherwise the search will use the old embedding.{' '}
              <strong>Save (keep embedding)</strong> is for fixing the title, tags, or source metadata only.
            </p>
          </div>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: toast.type === 'error' ? '#dc2626' : '#059669',
          color: '#fff', padding: '12px 20px', borderRadius: 8,
          fontSize: 14, fontWeight: 500, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          maxWidth: 360,
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'none' }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const th = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 11,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const td = {
  padding: '10px 14px',
  verticalAlign: 'middle',
};

const inputSt = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const tagBadge = {
  display: 'inline-block',
  background: '#ede9fe',
  color: '#5b21b6',
  padding: '2px 7px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
};

function btn(bg) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    padding: '9px 18px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };
}

function btnSm(bg) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  };
}

function catBadgeStyle(cat) {
  const c = CAT_COLORS[cat] || { bg: '#f3f4f6', text: '#374151' };
  return {
    display: 'inline-block',
    background: c.bg,
    color: c.text,
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
  };
}
