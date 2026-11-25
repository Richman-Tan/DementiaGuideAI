// A JSON POST that turns a failed response into an Error naming the service and
// the reason it gave, so a provider failure is legible in a trace.
export type Fetch = typeof globalThis.fetch;

export async function postJson<T>(
  fetchFn: Fetch,
  service: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${service} failed (HTTP ${response.status}): ${reason(text)}`);
  }
  return JSON.parse(text) as T;
}

/** The service's own explanation when its body has one, otherwise the start of the body. */
function reason(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown; code?: unknown };
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.message === 'string') {
      return typeof parsed.code === 'string' ? `${parsed.code}: ${parsed.message}` : parsed.message;
    }
  } catch {
    // Not JSON: fall through to the raw text.
  }
  return text.slice(0, 200) || 'no response body';
}
