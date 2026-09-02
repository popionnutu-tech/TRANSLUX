import { getSupabase } from '../supabase';
import { escapeHtml } from '../telegram-notify';
import { normalizePhone } from './phone';
import { etichetaOmului } from './complaints';
import type { Culprit } from './complaint-types';

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
    caller_phone: normalizePhone(d.metadata?.phone_call?.external_number ?? dyn.system__caller_id ?? null) || null,
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

/** Reclamația acestui apel, așa cum apare în raportul din Telegram. */
export interface ComplaintNote {
  identified: boolean; driver_name: string | null; plate: string | null;
  /** Ce s-a reclamat și cine răspunde de acel lucru (migr. 310). */
  type_name?: string | null; culprit?: Culprit | null;
}

export function formatCallReport(row: VoiceCallRow, callbackAlreadyAlerted: boolean, complaint?: ComplaintNote | null): string {
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
  // Rezumatul EL povestește reclamația, dar nu spune pe cine cade vina — exact
  // lipsa semnalată de Ion pe apelul din 01.09. Linia asta o spune.
  if (complaint) {
    // Tipul stă ÎNAINTEA omului, iar cuvântul «vinovat» se folosește doar când
    // tipul chiar cade pe șofer: la starea mașinii sau la textul de pe site
    // răspunde parcul, respectiv site-ul, iar omul de la volan e martor.
    const tip = complaint.type_name ? ` [${escapeHtml(complaint.type_name)}]` : '';
    const eticheta = etichetaOmului(complaint.culprit).toLowerCase();
    lines.push(complaint.identified
      ? `⚠️ Reclamație înregistrată${tip} — ${eticheta}: ${[complaint.driver_name, complaint.plate].filter((x): x is string => !!x).map(escapeHtml).join(' · ') || 'șofer fără nume'}`
      : `⚠️ Reclamație înregistrată${tip} — șofer NEIDENTIFICAT (clientul nu a dat mașina sau șoferul).`);
  }
  return lines.join('\n');
}
