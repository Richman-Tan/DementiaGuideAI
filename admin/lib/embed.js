const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';

// Generates a 1536-dimension embedding vector via OpenAI.
// Server-side only — requires OPENAI_API_KEY in .env.local.
export async function generateEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in admin/.env.local');

  const resp = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (resp.status === 401) throw new Error('Invalid OpenAI API key');
  if (resp.status === 429) throw new Error('OpenAI rate limit reached — wait a moment and retry');
  if (!resp.ok) {
    const err = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`Embedding failed: ${err}`);
  }

  const data = await resp.json();
  return data.data[0].embedding;
}
