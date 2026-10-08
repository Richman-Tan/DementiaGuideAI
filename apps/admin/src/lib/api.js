// Client for apps/api's admin intake endpoint (api/admin/ingest.js). Kept as
// plain, DOM-free functions where possible (buildRequestBody, validate) so
// they're unit-testable under vitest's node environment, same as apps/web's
// tests — only fileToBase64 and submitResource touch browser/network APIs.

// Mirrors packages/core/rag/ragConfig.js's CATEGORIES. Duplicated rather than
// imported: this app has no build-time dependency on packages/core, and the
// list is short and stable. The server validates against the real source of
// truth regardless — this is only for the dropdown.
export const CATEGORIES = [
  'caregiving',
  'clinical',
  'communication',
  'best-practices',
  'home-safety',
  'prevention',
  'wellbeing',
  'isupport-course',
];

export function validate(fields) {
  if (!['pdf', 'url', 'text'].includes(fields.sourceType)) return 'Choose a source type.';
  if (!fields.title?.trim()) return 'Title is required.';
  if (!CATEGORIES.includes(fields.category)) return 'Choose a category.';
  if (fields.sourceType === 'pdf' && !fields.file) return 'Choose a PDF file.';
  if (fields.sourceType === 'url' && !fields.url?.trim()) return 'Enter a URL.';
  if (fields.sourceType === 'text' && !fields.text?.trim()) return 'Paste some text.';
  return null;
}

/** Shapes the JSON body the endpoint expects, given an already-resolved payload string. */
export function buildRequestBody(fields, payload) {
  return {
    sourceType: fields.sourceType,
    payload,
    title: fields.title.trim(),
    sourceOrg: fields.sourceOrg?.trim() || null,
    sourceUrl: fields.sourceUrl?.trim() || null,
    licence: fields.licence?.trim() || null,
    category: fields.category,
    country: fields.country?.trim() || null,
  };
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // data:<mime>;base64,<the part we want>
      const base64 = String(reader.result).split(',', 2)[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function submitResource({ apiBaseUrl, accessToken, body }) {
  const resp = await fetch(`${apiBaseUrl || ''}/api/admin/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}
