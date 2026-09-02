import { getSupabase } from '../supabase';

// Lucrurile uitate în autobuz (migr. 314). Până acum find_past_trip identifica
// șoferul, îi dădea numărul clientului și NU scria nimic — Ion n-avea nici
// istoria lor, nici cum să le ducă în grupa șoferilor.
//
// Numele obiectului nu intră aici. Decizia lui Ion din 30.08: obiectul poate fi
// orice, ASR-ul îl stâlcește, iar modelul îl ghicește (apel real: «ochelari» →
// «geantă» → «chiloți»).

export interface LostItemInput {
  conversation_id: string;
  trip_date: string | null;
  departure: string | null;
  route: string | null;
  driver_id: string | null;
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  /** Clientul NU a primit numărul: avea reclamație pe același apel (migr. 315). */
  phone_withheld?: boolean;
}

/**
 * Un apel = un rând, îmbogățit la fiecare chemare a tool-ului.
 *
 * Aceleași reguli ca la reclamații (migr. 307): o identificare găsită nu se
 * pierde la un apel ulterior mai sărac. Diferența e că aici NU există semnal de
 * final — tool-ul nu știe când se termină convorbirea — deci mesajul în grupă
 * nu pleacă de aici, ci din webhook, la închiderea apelului.
 */
export async function saveLostItem(input: LostItemInput): Promise<void> {
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('voice_lost_items')
    .select('id, identified, phone_withheld')
    .eq('conversation_id', input.conversation_id)
    .maybeSingle();

  if (existing) {
    // Rândul deja identificat nu se rescrie de un apel mai sărac. O identificare
    // NOUĂ îl rescrie: clientul își amintește plăcuța corectă și cursa se mută
    // pe alt om — la fel ca la reclamații.
    if (existing.identified && !input.identified) return;
    const patch = input.identified
      ? {
        identified: true,
        trip_date: input.trip_date,
        departure: input.departure,
        route: input.route,
        driver_id: input.driver_id,
        driver_name: input.driver_name,
        plate: input.plate,
        // Sens UNIC: odată ce numărul a fost DAT (rând identificat cu flag
        // false), nu se mai poate «nedas». Un al doilea apel al tool-ului, venit
        // după ce clientul a apucat să reclame, ar fi întors flag-ul și grupa ar
        // fi citit «clientul NU are numărul» — fals (audit 02.09).
        phone_withheld: existing.identified
          ? !!existing.phone_withheld
          : !!input.phone_withheld,
      }
      // Neidentificat: păstrăm ce știm despre cursă, ca mesajul din grupă să
      // aibă măcar ruta și ziua — după ele se recunoaște șoferul.
      : { trip_date: input.trip_date, departure: input.departure, route: input.route };
    const { error } = await supabase.from('voice_lost_items').update(patch).eq('id', existing.id);
    if (error) throw new Error(`voice_lost_items update failed: ${error.message}`);
    return;
  }

  const { error } = await supabase.from('voice_lost_items').insert(input);
  if (!error) return;
  if (error.code !== '23505') {
    throw new Error(`voice_lost_items insert failed: ${error.message}`);
  }
  // Cursa select→insert concurentă: unique-ul a respins dublul. Rândul celuilalt
  // apel poate fi mai sărac — dacă noi avem identificarea, ea nu are voie să se
  // piardă, altfel în grupă ar pleca «cursă neidentificată» peste un șofer găsit.
  if (!input.identified) return;
  const { error: updErr } = await supabase
    .from('voice_lost_items')
    .update({
      identified: true,
      trip_date: input.trip_date,
      departure: input.departure,
      route: input.route,
      driver_id: input.driver_id,
      driver_name: input.driver_name,
      plate: input.plate,
      // Rândul pierdut la cursă era neidentificat, deci flag-ul de aici e
      // primul care contează.
      phone_withheld: !!input.phone_withheld,
    })
    .eq('conversation_id', input.conversation_id)
    .eq('identified', false);
  if (updErr) throw new Error(`voice_lost_items update after 23505 failed: ${updErr.message}`);
}

export interface ClaimedLostItem {
  trip_date: string | null;
  departure: string | null;
  route: string | null;
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  phone_withheld: boolean;
}

/**
 * Ia rândul pentru trimiterea în grupă, o singură dată.
 *
 * UPDATE condiționat, nu citire-apoi-scriere: webhook-ul ElevenLabs poate sosi
 * de două ori pentru același apel, iar două mesaje identice în grupă arată ca
 * două obiecte pierdute. Cine pune flag-ul primul trimite mesajul.
 */
export async function claimLostItemForGroup(conversationId: string): Promise<ClaimedLostItem | null> {
  const { data, error } = await getSupabase()
    .from('voice_lost_items')
    .update({ group_notified: true })
    .eq('conversation_id', conversationId)
    .eq('group_notified', false)
    .select('trip_date, departure, route, driver_name, plate, identified, phone_withheld');
  if (error) {
    console.error('claimLostItemForGroup:', error.message);
    return null;
  }
  return (data && data.length > 0) ? (data[0] as ClaimedLostItem) : null;
}

/** Lucrul uitat al apelului, pentru raportul către admini — indiferent de grupă. */
export async function getLostItemSummary(conversationId: string): Promise<ClaimedLostItem | null> {
  const { data, error } = await getSupabase()
    .from('voice_lost_items')
    .select('trip_date, departure, route, driver_name, plate, identified, phone_withheld')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) { console.error('getLostItemSummary:', error.message); return null; }
  return (data as ClaimedLostItem | null) ?? null;
}

/**
 * Dă rândul înapoi când mesajul NU a plecat.
 *
 * Flag-ul se pune înaintea trimiterii, ca doi webhook-uri să nu trimită de două
 * ori. Fără eliberare, un Telegram căzut o dată transforma paza contra dublurii
 * într-o pierdere definitivă: rândul rămânea marcat trimis, iar mesajul nu
 * pleca niciodată (performance review 02.09).
 */
export async function releaseLostItemClaim(conversationId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('voice_lost_items')
    .update({ group_notified: false })
    .eq('conversation_id', conversationId);
  if (error) console.error('releaseLostItemClaim:', error.message);
}
