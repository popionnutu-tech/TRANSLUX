import { getSupabase } from '../supabase';
import { escapeHtml } from '../telegram-notify';

export interface CallbackInput {
  conversation_id: string | null;
  caller_phone: string | null;
  reason: string | null;
}

export async function createCallbackRequest(input: CallbackInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('voice_callback_requests').insert(input);
  if (error) throw new Error(`voice_callback_requests insert failed: ${error.message}`);
}

export function formatCallbackAlert(input: CallbackInput, name: string | null): string {
  // Динамические значения приходят из LLM/абонента → экранируем для parse_mode HTML.
  return [
    '📲 <b>Cerere de apel înapoi (agent vocal)</b>',
    `Telefon: ${input.caller_phone ? escapeHtml(input.caller_phone) : 'necunoscut'}`,
    name ? `Nume: ${escapeHtml(name)}` : null,
    `Motiv: ${input.reason ? escapeHtml(input.reason) : '—'}`,
  ].filter(Boolean).join('\n');
}
