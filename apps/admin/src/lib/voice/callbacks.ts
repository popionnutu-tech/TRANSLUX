import { getSupabase } from '../supabase';

export interface CallbackInput {
  conversation_id: string | null;
  caller_phone: string | null;
  reason: string | null;
}

export async function createCallbackRequest(input: CallbackInput): Promise<void> {
  const supabase = getSupabase();
  // O conversație = O cerere (migr. 273, unique pe conversation_id): agentul
  // înregistrează cererea IMEDIAT la primul semn de reclamație și o ÎMBOGĂȚEȘTE
  // la fiecare detaliu nou — reapelarea tool-ului actualizează același rând,
  // nu creează dubluri. Fără conversation_id rămâne insert simplu (ca înainte).
  if (input.conversation_id) {
    const { data: existing } = await supabase
      .from('voice_callback_requests')
      .select('id, reason, caller_phone')
      .eq('conversation_id', input.conversation_id)
      .maybeSingle();
    if (existing) {
      const reason = input.reason && input.reason !== existing.reason
        ? (existing.reason ? `${existing.reason} | ${input.reason}` : input.reason)
        : existing.reason;
      const { error } = await supabase
        .from('voice_callback_requests')
        .update({ reason, caller_phone: input.caller_phone ?? existing.caller_phone })
        .eq('id', existing.id);
      if (error) throw new Error(`voice_callback_requests update failed: ${error.message}`);
      return;
    }
  }
  const { error } = await supabase.from('voice_callback_requests').insert(input);
  // Cursa rară select→insert concurent: unique-ul respinge dublul (23505) —
  // rândul există deja, obiectivul e atins, nu aruncăm eroare spre agent.
  if (error && error.code !== '23505') throw new Error(`voice_callback_requests insert failed: ${error.message}`);
}
