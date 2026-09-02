import { getSupabase } from '../supabase';
import { escapeHtml } from '../telegram-notify';
import { FALLBACK_CODE, CULPRIT_RO, complaintTypeLabel, type Culprit } from './complaint-types';

// Reclamațiile agentului vocal. Ion, 01.09: «în cazul reclamațiilor noi trebuie
// clar să identificăm cine este vinovatul, dacă nu identificăm șoferul — nu e
// clar responsabilitatea». Vinovatul îl scrie SERVERUL (register-complaint
// cheamă identifyTrip), nu modelul: un nume rostit de LLM nu e probă.
// Pe ce se sprijină identificarea. `trip_only` = vinovatul vine din orar, nu
// dintr-un semn adus de client — 78,8% dintre perechile rută+zi au un singur
// șofer, deci fără eticheta asta o acuzație din orar arată la fel ca una probată.
export type Evidence = 'plate' | 'name' | 'trip_only';

export interface ComplaintInput {
  conversation_id: string | null;
  caller_phone: string | null;
  complaint: string | null;
  trip_date: string | null;
  departure: string | null;
  route: string | null;
  driver_id: string | null;
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  evidence: Evidence;
  /** Codul din nomenclator (migr. 310), deja validat. null = baza nu a răspuns. */
  complaint_type: string | null;
  /** Cazul e la capăt: vinovatul găsit, sau clientul nu mai are ce detalii da. */
  final: boolean;
}

export interface SaveResult {
  /** Alerta trebuie trimisă ACUM. */
  shouldAlert: boolean;
  /** Rândul avea DEJA un vinovat înainte de acest apel al tool-ului. */
  alreadyIdentified: boolean;
  /** Alerta corectează un vinovat anunțat anterior — alt om, aceeași reclamație. */
  corrected: boolean;
  /** Alerta corectează TIPUL anunțat anterior — deci și cine răspunde de el. */
  typeCorrected: boolean;
  /** Textul ÎNTREG al reclamației după îmbogățire, nu doar ultima bucată. */
  complaint: string | null;
  /**
   * Tipul care a RĂMAS în dosar, nu cel trimis acum. Un ALTUL venit la apelul al
   * doilea nu suprascrie un tip concret — fără câmpul ăsta, alerta din Telegram
   * ar numi «Altceva» peste un dosar care spune «Starea mașinii» (audit 02.09).
   */
  complaint_type: string | null;
}

export async function saveComplaint(input: ComplaintInput): Promise<SaveResult> {
  const supabase = getSupabase();
  // O conversație = O reclamație (migr. 307, unique pe conversation_id): agentul
  // o înregistrează la primul semn și o ÎMBOGĂȚEȘTE la fiecare detaliu nou.
  // Aceleași reguli ca la callback-uri (migr. 273), cu o diferență: identificarea
  // o suprascrie doar o identificare NOUĂ reușită — un al doilea apel al tool-ului
  // cu mai puține detalii nu are voie să șteargă vinovatul deja găsit.
  if (input.conversation_id) {
    const { data: existing } = await supabase
      .from('voice_complaints')
      .select('id, complaint, caller_phone, identified, alerted, driver_id, complaint_type')
      .eq('conversation_id', input.conversation_id)
      .maybeSingle();
    if (existing) {
      const complaint = input.complaint && input.complaint !== existing.complaint
        ? (existing.complaint ? `${existing.complaint} | ${input.complaint}` : input.complaint)
        : existing.complaint;
      const patch: Record<string, unknown> = {
        complaint,
        caller_phone: input.caller_phone ?? existing.caller_phone,
      };
      // Pe rândul încă neidentificat eticheta urmează ultimul apel; pe cel
      // identificat o rescrie doar o identificare nouă (blocul de mai jos).
      if (!existing.identified) patch.evidence = input.evidence;
      // Tipul se ÎMBOGĂȚEȘTE, ca tot restul rândului: primul apel îl pune, un
      // apel următor cu un tip CONCRET îl corectează (clientul povestește mai
      // departe și se lămurește ce reclamă), dar un ALTUL venit mai târziu nu
      // are voie să șteargă un tip concret deja pus.
      const scrieTip = !!input.complaint_type
        && (!existing.complaint_type || input.complaint_type !== FALLBACK_CODE);
      if (scrieTip) patch.complaint_type = input.complaint_type;
      // Tipul stabilește CINE răspunde: STARE_MASINA cade pe parc, FUMAT pe om.
      // Schimbat după ce alerta a plecat, el mută răspunderea în tăcere — în
      // Telegram scria «răspunde parcul auto», în bază rămâne un tip care arată
      // spre șofer. Același tipar ca la schimbarea vinovatului (security 02.09).
      const tipSchimbat = scrieTip
        && !!existing.complaint_type
        && existing.complaint_type !== input.complaint_type;
      if (input.identified) {
        patch.identified = true;
        patch.evidence = input.evidence;
        patch.trip_date = input.trip_date;
        patch.departure = input.departure;
        patch.route = input.route;
        patch.driver_id = input.driver_id;
        patch.driver_name = input.driver_name;
        patch.plate = input.plate;
      }
      // Două motive de alertă, nu unul. Al doilea e necesar fiindcă un caz închis
      // ca NEIDENTIFICAT poate fi identificat imediat după (clientul își amintește
      // plăcuța): fără el, în Telegram ar rămâne pentru totdeauna «vinovat
      // neidentificat» peste un vinovat găsit — exact neclaritatea de evitat.
      const closing = input.final && !existing.alerted;
      // Schimbarea OMULUI e al treilea motiv de alertă: clientul dă altă plăcuță
      // (sau ASR o aude altfel) și rândul trece pe alt șofer. Fără alertă nouă,
      // în Telegram ar rămâne numit un om, iar în dosar ar fi scris altul —
      // acuzație pe nevinovat, tăcut (security 01.09).
      const corrects = input.identified
        && (!existing.identified || existing.driver_id !== input.driver_id);
      const shouldAlert = closing || corrects || (tipSchimbat && existing.alerted);
      if (shouldAlert) patch.alerted = true;
      const { error } = await supabase.from('voice_complaints').update(patch).eq('id', existing.id);
      if (error) throw new Error(`voice_complaints update failed: ${error.message}`);
      return {
        shouldAlert,
        alreadyIdentified: existing.identified,
        // «Corectare» doar când chiar înlocuiește un om anunțat, nu la prima numire.
        corrected: corrects && existing.identified && existing.alerted,
        // Titlul alertei trebuie să spună CE s-a corectat. «Vinovat corectat» pe
        // o schimbare de tip ar trimite cititorul să caute alt om.
        typeCorrected: tipSchimbat && existing.alerted && !(corrects && existing.identified),
        complaint: (patch.complaint as string | null) ?? null,
        // Ce a rămas în dosar: tipul nou dacă l-am scris, altfel cel de dinainte.
        complaint_type: (patch.complaint_type as string | undefined) ?? existing.complaint_type ?? null,
      };
    }
  }
  const { final, ...row } = input;
  const { error } = await supabase.from('voice_complaints').insert({ ...row, alerted: final });
  // Cursa rară select→insert concurent: unique-ul respinge dublul (23505) —
  // rândul există deja, obiectivul e atins, nu aruncăm eroare spre agent. Alerta
  // o trimite atunci celălalt apel, care a scris primul.
  if (error && error.code !== '23505') throw new Error(`voice_complaints insert failed: ${error.message}`);
  // Dublul respins de unique: rândul e al celuilalt apel, el trimite și alerta.
  if (error) return { shouldAlert: false, alreadyIdentified: false, corrected: false, typeCorrected: false, complaint: input.complaint, complaint_type: input.complaint_type };
  return { shouldAlert: final, alreadyIdentified: false, corrected: false, typeCorrected: false, complaint: input.complaint, complaint_type: input.complaint_type };
}

/** Tipul, pentru alertă: numele lui și cine răspunde de lucrul reclamat. */
export interface TypeLabel {
  name_ro: string;
  culprit: Culprit;
}

/**
 * Cum se numește rândul cu omul de la volan.
 *
 * «Vinovat» e un verdict. La «starea mașinii», «info de pe site» și «rezervare
 * nerespectată» răspunde compania, parcul sau site-ul — șoferul e martor, nu
 * răspunzător (Ion, 02.09: «10 nu e vina soferilor», «11 deja tot nu-i vina
 * lor»). Fără schimbarea asta, alerta ar spune pe primul rând că răspunde
 * parcul auto și pe al doilea ar numi un om drept vinovat.
 * Tip necunoscut → rămâne «Vinovat», ca până acum.
 */
export function etichetaOmului(culprit: Culprit | null | undefined): string {
  return !culprit || culprit === 'SOFER' ? 'Vinovat' : 'La volan era';
}

export function formatComplaintAlert(
  input: ComplaintInput,
  corrected = false,
  tip: TypeLabel | null = null,
  typeCorrected = false,
): string {
  // Linia «Vinovat» e motivul întregii funcții: cine citește alerta trebuie să
  // vadă din prima dacă are pe cine cerceta sau nu.
  const cursa = [
    input.route ? escapeHtml(input.route) : null,
    input.departure ? escapeHtml(input.departure) : null,
    input.trip_date ? escapeHtml(input.trip_date) : null,
  ].filter(Boolean).join(' · ');
  const TEMEI: Record<Evidence, string> = {
    plate: 'numărul mașinii, dat de client',
    name: 'numele șoferului, dat de client',
    trip_only: 'DOAR cursa (rută + zi) — clientul nu a dat nici mașina, nici numele',
  };
  const vinovat = input.identified
    ? [input.driver_name ? escapeHtml(input.driver_name) : 'șofer fără nume', input.plate ? escapeHtml(input.plate) : null]
      .filter(Boolean).join(' · ')
    : 'NEIDENTIFICAT — clientul nu a putut da mașina sau șoferul';
  return [
    corrected
      // Al doilea mesaj pe aceeași reclamație trebuie să se distingă de primul,
      // altfel cititorul nu știe care vinovat e cel valabil.
      ? '⚠️ <b>Reclamație (agent vocal) — VINOVAT CORECTAT</b>'
      // Tipul schimbat mută răspunderea de la un om la parc, la site sau la
      // companie. Fără titlu propriu, al doilea mesaj ar arăta ca o repetare.
      : typeCorrected
        ? '⚠️ <b>Reclamație (agent vocal) — TIP CORECTAT</b>'
        : '⚠️ <b>Reclamație (agent vocal)</b>',
    `De la: ${input.caller_phone ? escapeHtml(input.caller_phone) : 'necunoscut'}`,
    // Tipul spune CE s-a reclamat, linia de mai jos CINE era la volan. Sunt două
    // lucruri diferite: la «starea mașinii» sau «info de pe site» șoferul e doar
    // omul care conducea, nu cel care răspunde (Ion, 02.09).
    tip ? `Tip: ${escapeHtml(tip.name_ro)} — răspunde ${CULPRIT_RO[tip.culprit]}` : null,
    `${etichetaOmului(tip?.culprit)}: ${vinovat}`,
    cursa ? `Cursa: ${cursa}` : 'Cursa: —',
    // Cine cercetează trebuie să vadă cât cântărește acuzația, nu doar pe cine cade.
    input.identified ? `Temei: ${TEMEI[input.evidence]}` : null,
    `Reclamație: ${input.complaint ? escapeHtml(input.complaint) : '—'}`,
  ].filter(Boolean).join('\n');
}

/**
 * Reclamația acestui apel, pentru raportul de apel din Telegram.
 *
 * Duce mai departe și tipul: raportul de apel numea un om drept «vinovat» fără
 * să știe măcar ce s-a reclamat — la starea mașinii sau la textul de pe site,
 * acuzația cădea pe cine nu răspunde de ele (audit 02.09).
 */
export async function getComplaintSummary(conversationId: string): Promise<{
  identified: boolean; driver_name: string | null; plate: string | null;
  type_name: string | null; culprit: Culprit | null;
} | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('voice_complaints')
    .select('identified, driver_name, plate, complaint_type')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (!data) return null;
  const tip = await complaintTypeLabel((data as { complaint_type: string | null }).complaint_type);
  return {
    identified: data.identified,
    driver_name: data.driver_name,
    plate: data.plate,
    type_name: tip?.name_ro ?? null,
    culprit: tip?.culprit ?? null,
  };
}
