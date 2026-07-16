// Device-local RAG telemetry — a small ring buffer of per-query retrieval
// traces for debugging bad answers and eval-vs-production drift.
//
// Privacy: NEVER stores message text — only query length, retrieved chunk ids,
// similarity scores, versions, and stage latencies. Lives outside src/lib/rag/
// because it imports React Native storage (the rag/ core stays Node-loadable).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROMPT_VERSION, CITATION_MODE } from './rag/ragConfig';

const KEY = 'rag_debug_log_v1';
const MAX_ENTRIES = 50;

let buffer = null; // lazy-loaded once per session

async function load() {
  if (buffer) return buffer;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    buffer = raw ? JSON.parse(raw) : [];
  } catch {
    buffer = [];
  }
  return buffer;
}

// Fire-and-forget: telemetry must never delay or break the chat path.
export function recordRetrieval({ queryLength, retrieved, ragMs, path }) {
  (async () => {
    try {
      const buf = await load();
      buf.push({
        at: new Date().toISOString(),
        path, // 'chat' | 'voice'
        queryLength,
        promptVersion: PROMPT_VERSION,
        citationMode: CITATION_MODE,
        retrieved: (retrieved ?? []).map(c => ({ id: c.id, sim: Number(c.similarity?.toFixed?.(4) ?? c.similarity ?? null) })),
        empty: !retrieved || retrieved.length === 0,
        ragMs: ragMs ?? null,
      });
      if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
      await AsyncStorage.setItem(KEY, JSON.stringify(buf));
    } catch { /* never surface */ }
  })();
}

export async function getTelemetry() {
  return load();
}

export async function clearTelemetry() {
  buffer = [];
  try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ }
}
