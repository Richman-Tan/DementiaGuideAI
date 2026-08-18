// Whisper transcription, credential held server-side.
//
// The body is raw multipart from the browser's FormData, so the platform body
// parser is disabled and the payload is forwarded verbatim. Audio is never
// written to disk and never stored: only the returned text reaches the study
// record (docs/study/ethics/data-management-plan.md §2).
import { guard, requireEnv, readRaw, readUserId } from './_lib/guard.js';
import { recordUsage } from './_lib/usage.js';

export const config = { api: { bodyParser: false } };

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MODEL = 'whisper-1';

// Minimal multipart reader — enough to pull the single `file` part out. Avoids a
// dependency for one field, and the payload shape is entirely ours
// (services/sttWeb.js builds it).
function extractFile(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  let start = buf.indexOf(delim);
  while (start !== -1) {
    const headerStart = start + delim.length;
    const headerEnd = buf.indexOf('\r\n\r\n', headerStart);
    if (headerEnd === -1) return null;
    const rawHeaders = buf.slice(headerStart, headerEnd).toString('utf8');
    const next = buf.indexOf(delim, headerEnd);
    if (next === -1) return null;

    if (/name="file"/i.test(rawHeaders)) {
      // Trailing CRLF before the next boundary is delimiter, not content.
      const bytes = buf.slice(headerEnd + 4, next - 2);
      const filename = /filename="([^"]*)"/i.exec(rawHeaders)?.[1];
      const type = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1];
      return { bytes, filename, type: type?.trim() };
    }
    start = next;
  }
  return null;
}

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const apiKey = requireEnv(res, process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
  if (!apiKey) return;

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    res.status(400).json({ error: 'multipart/form-data required' });
    return;
  }

  let body;
  try {
    body = await readRaw(req, MAX_AUDIO_BYTES);
  } catch {
    res.status(413).json({ error: 'audio too large' });
    return;
  }

  // Do NOT forward the client's multipart verbatim: `model`, `prompt` and
  // `response_format` would all be caller-controlled, so a leaked access code
  // could select a different (differently-priced) model. Rebuild the form with
  // the model pinned, carrying across only the audio and the language.
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const audio = boundary ? extractFile(body, (boundary[1] || boundary[2]).trim()) : null;
  if (!audio) {
    res.status(400).json({ error: 'no audio file in request' });
    return;
  }

  const form = new FormData();
  form.append('file', new Blob([audio.bytes], { type: audio.type || 'audio/webm' }), audio.filename || 'recording.webm');
  form.append('model', MODEL);
  form.append('language', 'en');

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (err) {
    console.error(`[study] transcribe upstream failed: ${err?.message ?? err}`);
    res.status(502).json({ error: 'upstream request failed' });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error(`[study] transcribe upstream ${upstream.status}: ${detail.slice(0, 300)}`);
    res.status(upstream.status === 429 ? 429 : 502).json({ error: 'upstream error' });
    return;
  }

  // Bytes stand in for duration: the response carries no length, and the ratio
  // is stable enough for a usage signal. Recorded as such, not as seconds.
  recordUsage({ userId: readUserId(req), kind: 'whisper', units: audio.bytes.length, model: MODEL });
  res.status(200).json(await upstream.json());
}
