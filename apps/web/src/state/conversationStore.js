// Conversations, server-side.
//
// Replaces historyStore.js, which kept one localStorage blob (`dg_history`,
// capped at 100 messages) shared by Chat AND Voice. That had two problems: a
// user lost everything when storage was cleared, and in the study a
// within-subjects participant carried arm A's conversation into arm B, where
// they could re-read the answers instead of searching for them.
//
// Reads and writes go direct to Supabase under RLS rather than through the
// backend: these are the user's own rows, the policy already scopes them to
// auth.uid(), and a round trip through a function would add latency for no
// additional safety.
//
// localStorage is kept as a cache, not as the record — so a slow or offline
// start still renders something.
import { supabase, supabaseConfigured } from '../services/supabase.js';

const CACHE_KEY = 'dg_history';       // same key the old store used, now a cache
const LEGACY_MIGRATED = 'dg_history_migrated';
const MAX_CACHED = 100;

// ─── Cache ───────────────────────────────────────────────────────────────────

export function loadCached() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveCached(msgs) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(msgs.slice(-MAX_CACHED))); } catch { /* full/blocked */ }
}

export function clearCached() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* blocked */ }
}

// ─── Server ──────────────────────────────────────────────────────────────────

const usable = (userId) => Boolean(supabaseConfigured && userId);

/**
 * The conversation to write into. `studyArm` gives each arm of a study session
 * its own thread — the isolation the comparison depends on.
 */
export async function getOrCreateConversation(userId, { surface = 'chat', studyArm = null } = {}) {
  if (!usable(userId)) return null;

  let query = supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);
  // `is` not `eq` — `study_arm = null` never matches in SQL.
  query = studyArm ? query.eq('study_arm', studyArm) : query.is('study_arm', null);

  const { data, error } = await query;
  if (error) {
    console.warn(`[conversations] lookup failed: ${error.message}`);
    return null;
  }
  if (data?.length) return data[0].id;

  const { data: created, error: insErr } = await supabase
    .from('conversations')
    .insert({ user_id: userId, surface, study_arm: studyArm })
    .select('id')
    .single();
  if (insErr) {
    console.warn(`[conversations] create failed: ${insErr.message}`);
    return null;
  }
  return created.id;
}

export async function loadMessages(conversationId) {
  if (!conversationId) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, citations, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn(`[conversations] load failed: ${error.message}`);
    return [];
  }
  return (data || []).map((m) => ({
    role: m.role === 'user' ? 'user' : 'aria',
    text: m.content,
    citations: m.citations || [],
    time: formatTime(new Date(m.created_at)),
  }));
}

/**
 * Append one message. Fire-and-forget by design: the UI has already rendered it
 * optimistically, and blocking a reply on a database round trip would make the
 * assistant feel slower than it is.
 */
export async function appendMessage(conversationId, { role, text, citations }) {
  if (!conversationId) return;
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: role === 'user' ? 'user' : 'assistant',
    content: text ?? '',
    citations: citations || [],
  });
  if (error) {
    console.warn(`[conversations] append failed: ${error.message}`);
    return;
  }
  // Keeps the "most recent" ordering honest for the lookup above.
  await supabase.from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

/**
 * Delete every conversation this user owns.
 *
 * Settings offers "Clear Conversation History" and the privacy policy promises
 * it "removes it permanently". Starting a new thread — which is all newConvo()
 * does — left every earlier row on the server, so that promise was not true
 * once conversations moved off the device.
 *
 * `messages` cascades from `conversations`, and the RLS policy scopes the
 * delete to auth.uid(), so this cannot reach another user's rows. The cache is
 * cleared only once the server copy is actually gone: emptying the screen while
 * the record survives is the failure mode worth avoiding.
 */
export async function deleteAllConversations(userId) {
  // No server to delete from — the cache *is* the record, so clearing it is the
  // whole job rather than a half-done one.
  if (!usable(userId)) {
    clearCached();
    return { deleted: true, scope: 'device' };
  }

  const { error } = await supabase.from('conversations').delete().eq('user_id', userId);
  if (error) {
    console.warn(`[conversations] delete failed: ${error.message}`);
    return { deleted: false, scope: 'server', message: error.message };
  }

  clearCached();
  return { deleted: true, scope: 'server' };
}

export async function startNewConversation(userId, { surface = 'chat', studyArm = null } = {}) {
  if (!usable(userId)) return null;
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, surface, study_arm: studyArm })
    .select('id')
    .single();
  if (error) {
    console.warn(`[conversations] new failed: ${error.message}`);
    return null;
  }
  return data.id;
}

/**
 * Carry a pre-backend `dg_history` blob into the first server conversation,
 * once. Guarded by its own flag rather than by "is the conversation empty",
 * which would re-import after the user deliberately cleared it.
 */
export async function migrateLegacyHistory(userId, conversationId) {
  if (!usable(userId) || !conversationId) return;
  try {
    if (localStorage.getItem(LEGACY_MIGRATED)) return;
    const legacy = loadCached();
    localStorage.setItem(LEGACY_MIGRATED, '1');
    if (!legacy?.length) return;

    const rows = legacy
      .filter((m) => m.text && !m.streaming)
      .map((m) => ({
        conversation_id: conversationId,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
        citations: m.citations || [],
      }));
    if (!rows.length) return;

    const { error } = await supabase.from('messages').insert(rows);
    if (error) console.warn(`[conversations] legacy migration failed: ${error.message}`);
  } catch { /* storage blocked — nothing to migrate */ }
}

function formatTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
