import type { StorageAdapter } from 'grammy';
import { getSupabase } from '../supabase.js';
import type { SessionData } from '../types.js';

// Persistent key-value store (Supabase table `bot_storage`) for grammY session
// and conversation state, so a Railway restart/redeploy no longer wipes an
// operator's in-progress report.
const TABLE = 'bot_storage';

async function kvRead(key: string): Promise<any | undefined> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle();
  // Fail LOUD on a real error: returning undefined here would make the plugin
  // think there is no saved state and silently start fresh (lost report).
  if (error) throw new Error(`bot_storage read failed (${key}): ${error.message}`);
  return data?.value ?? undefined;
}

async function kvWrite(key: string, value: unknown): Promise<void> {
  const { error } = await getSupabase()
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  // Fail LOUD: if the write fails, the plugin must NOT believe the state was
  // saved — throwing surfaces the error (operator retries) instead of silently
  // continuing with unsaved/stale conversation state.
  if (error) throw new Error(`bot_storage write failed (${key}): ${error.message}`);
}

async function kvDelete(key: string): Promise<void> {
  const { error } = await getSupabase().from(TABLE).delete().eq('key', key);
  if (error) console.error('bot_storage delete error:', error.message);
}

/** grammY session storage (namespaced "sess:"). SessionData is currently empty,
 *  but persisting it future-proofs any session data added later. */
export const supabaseSessionStorage: StorageAdapter<SessionData> = {
  read: (key) => kvRead(`sess:${key}`),
  write: (key, value) => kvWrite(`sess:${key}`, value),
  delete: (key) => kvDelete(`sess:${key}`),
};

/** Adapter for the conversations plugin key-storage. The plugin reads/writes its
 *  own VersionedState objects; we just persist them as JSON keyed by chat. */
export const supabaseConversationAdapter = {
  read: (key: string): Promise<any> => kvRead(key),
  write: (key: string, state: unknown) => kvWrite(key, state),
  delete: (key: string) => kvDelete(key),
};

/** Bump this whenever the conversation flow (report.ts / addDriver.ts) changes in
 *  a way that invalidates persisted in-progress state. On a version mismatch the
 *  conversations plugin DISCARDS stale state instead of crashing with "Bad replay". */
export const CONVERSATION_STATE_VERSION = '2026-06-02';
