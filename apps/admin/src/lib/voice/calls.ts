import { getSupabase } from '../supabase';
import { escapeHtml } from '../telegram-notify';

export interface VoiceCallRow {
  conversation_id: string;
  direction: 'in';
  caller_phone: string | null;
  transcript: unknown;
  summary: string | null;
  analysis: unknown;
  duration_secs: number | null;
  cost: number | null;
  status: string | null;
}

export function extractCall(payload: any): VoiceCallRow {
  const d = payload?.data ?? {};
  const dyn = d.conversation_initiation_client_data?.dynamic_variables ?? {};
  return {
    conversation_id: String(d.conversation_id ?? ''),
    direction: 'in',
    caller_phone: d.metadata?.phone_call?.external_number ?? dyn.system__caller_id ?? null,
    transcript: d.transcript ?? null,
    summary: d.analysis?.transcript_summary ?? null,
    analysis: d.analysis ?? null,
    duration_secs: d.metadata?.call_duration_secs ?? null,
    cost: d.metadata?.cost ?? null,
    status: d.status ?? null,
  };
}

/** Идемпотентная запись: ON CONFLICT (conversation_id) DO NOTHING. */
export async function saveVoiceCall(row: VoiceCallRow, raw: unknown): Promise<'inserted' | 'duplicate'> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('voice_calls')
    .upsert({ ...row, raw_webhook_data: raw }, { onConflict: 'conversation_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`voice_calls upsert failed: ${error.message}`);
  return data && data.length > 0 ? 'inserted' : 'duplicate';
}

export async function hasCallbackRequest(conversationId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from('voice_callback_requests')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  return (count ?? 0) > 0;
}

export function formatCallReport(row: VoiceCallRow, callbackAlreadyAlerted: boolean): string {
  const min = Math.floor((row.duration_secs ?? 0) / 60);
  const sec = (row.duration_secs ?? 0) % 60;
  const lines = [
    '📞 <b>Apel TRANSLUX (agent vocal)</b>',
    `De la: ${row.caller_phone ? escapeHtml(row.caller_phone) : 'necunoscut'}`,
    `Durată: ${min} min ${sec} s`,
    row.summary ? `Rezumat: ${escapeHtml(row.summary)}` : 'Rezumat: —',
  ];
  if (callbackAlreadyAlerted) {
    lines.push('ℹ️ Există deja o cerere de apel înapoi pentru acest apel (alertă trimisă).');
  }
  return lines.join('\n');
}
