import { getSupabase } from '../supabase';

// Nomenclatorul tipurilor de reclamații (migr. 310). Ion, 02.09: «facem
// nomeclator de pretentii din partea la clienti pentru jalobe, tipul lor cine
// este vinovat». Lista a venit de la operatoare, cu observațiile lui pe ea:
// punctul 6 e al companiei (se rezolvă cu biletul online), 10 e al parcului,
// 11 e al site-ului — «nu e vina soferilor».
//
// De ce tipul contează separat de vinovatul-om din migr. 307: dosarul spune
// CINE era la volan, tipul spune CE s-a reclamat. Fără tip, un raport pe șofer
// pune la aceeași grămadă fumatul la volan și scaunele rupte.
//
// Tipul îl alege AGENTUL în timpul apelului (decizia lui Ion, 02.09), dintr-o
// listă închisă pe care o primește în prompt. Serverul nu-l crede pe cuvânt:
// codul necunoscut cade pe ALTUL, iar codul nevalidat nu se scrie deloc —
// coloana are cheie străină, iar un cod inventat ar respinge ÎNTREG rândul și
// reclamația s-ar pierde.

export type Culprit = 'SOFER' | 'COMPANIE' | 'PARC' | 'SITE' | 'NECLAR';

export const CULPRITS: Culprit[] = ['SOFER', 'COMPANIE', 'PARC', 'SITE', 'NECLAR'];

/** Coșul de rezervă: reclamația care nu intră în listă primește codul ăsta, nu null. */
export const FALLBACK_CODE = 'ALTUL';

export interface ComplaintType {
  code: string;
  ord: number;
  name_ro: string;
  name_ru: string;
  culprit: Culprit;
  note: string | null;
  active: boolean;
}

/** Cum se scrie vinovatul implicit în alerta din Telegram. */
export const CULPRIT_RO: Record<Culprit, string> = {
  SOFER: 'șoferul',
  COMPANIE: 'compania',
  PARC: 'parcul auto',
  SITE: 'site-ul',
  NECLAR: 'de stabilit la cercetare',
};

// Cache de proces. Lista se schimbă de câteva ori pe an, iar ruta reclamațiilor
// e chemată de 2-3 ori pe apel: fără cache, fiecare apel al tool-ului ar mai
// adăuga o interogare pe calea în care clientul așteaptă în tăcere.
// TTL, nu invalidare: panoul rulează în alt proces decât ruta agentului, deci
// un „golește cache-ul" de acolo n-ar ajunge niciodată aici.
const TTL_MS = 5 * 60_000;
// Citirea stă pe calea în care clientul așteaptă la telefon, iar tool-ul are 10
// secunde de trăit. O bază care se gândește n-are voie să mănânce bugetul
// înregistrării: după o secundă și jumătate renunțăm la tip, nu la reclamație.
const READ_TIMEOUT_MS = 1500;
let cache: { at: number; rows: ComplaintType[] } | null = null;

export async function loadComplaintTypes(force = false): Promise<ComplaintType[]> {
  const now = Date.now();
  if (!force && cache && now - cache.at < TTL_MS) return cache.rows;
  let expira: ReturnType<typeof setTimeout> | undefined;
  const query = getSupabase()
    .from('complaint_types')
    .select('code, ord, name_ro, name_ru, culprit, note, active')
    // Ordonare COMPLETĂ, nu doar după `ord`: coloana nu e unică (ecranul dă 50
    // implicit oricărui tip nou), iar la egalitate rândurile ies în ordinea lor
    // fizică. Un UPDATE mută rândul, ordinea se schimbă fără ca lista să se
    // schimbe, blocul de prompt „diferă" și controlerul face un PATCH inutil pe
    // ambii agenți — un drift fără cauză vizibilă (performance review 02.09).
    .order('ord').order('code');
  let data: unknown;
  let error: { message: string } | null = null;
  try {
    ({ data, error } = await Promise.race([
      query as unknown as Promise<{ data: unknown; error: { message: string } | null }>,
      new Promise<never>((_, rej) => {
        expira = setTimeout(() => rej(new Error('complaint_types read timeout')), READ_TIMEOUT_MS);
      }),
    ]));
  } finally {
    clearTimeout(expira);
  }
  if (error) throw new Error(`complaint_types read failed: ${error.message}`);
  const rows = (data ?? []) as ComplaintType[];
  // Lista goală NU se ține în cache: ar însemna cinci minute în care fiecare
  // reclamație rămâne fără tip, iar controlerul raportează drift. Un tabel golit
  // din greșeală trebuie să se repare la prima citire de după, nu peste cinci minute.
  if (rows.length > 0) cache = { at: now, rows };
  return rows;
}

/** Doar tipurile care se mai propun agentului. */
export async function activeComplaintTypes(): Promise<ComplaintType[]> {
  return (await loadComplaintTypes()).filter((t) => t.active);
}

function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    // Codurile sunt ASCII prin construcție (migr. 310). Orice altceva — spații,
    // ghilimele, diacritice puse de model — devine „_" și pică pe potrivirea
    // exactă, adică pe ALTUL. Nu ghicim tipul din text apropiat.
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface ResolvedType {
  code: string;
  name_ro: string;
  culprit: Culprit;
}

/**
 * Codul scris de model → rândul din nomenclator.
 *
 * Întoarce null când nu se poate stabili nimic (baza nu răspunde): atunci
 * dosarul se scrie FĂRĂ tip. Mai bine un dosar fără tip decât niciun dosar —
 * cheia străină ar respinge tot rândul pentru un cod inventat de model.
 */
export async function resolveComplaintType(raw: unknown): Promise<ResolvedType | null> {
  const cod = typeof raw === 'string' ? normalizeCode(raw.slice(0, 60)) : '';
  let rows: ComplaintType[];
  try {
    rows = await loadComplaintTypes();
  } catch (err) {
    console.error('resolveComplaintType:', err);
    return null;
  }
  const pick = (lista: ComplaintType[], code: string) => {
    const t = lista.find((r) => r.code === code && r.active);
    return t ? { code: t.code, name_ro: t.name_ro, culprit: t.culprit } : null;
  };
  // Tipul stins din panou nu se mai pune pe dosare noi: Ion l-a scos din listă,
  // iar agentul putea încă să-l poarte din promptul livrat mai demult.
  const gasit = cod ? pick(rows, cod) : null;
  if (gasit) return gasit;
  // Cod nerecunoscut, dar cache-ul poate fi vechi de până la cinci minute: Ion
  // tocmai a adăugat tipul în panou, controlerul l-a dus deja în prompt, iar
  // procesul ăsta încă n-a aflat. Fără recitire, exact tipul nou ar cădea pe
  // ALTUL — adică lucrul pentru care s-a făcut nomenclatorul (audit 02.09).
  if (cod) {
    try {
      const proaspete = await loadComplaintTypes(true);
      const dupaRecitire = pick(proaspete, cod);
      if (dupaRecitire) return dupaRecitire;
      return pick(proaspete, FALLBACK_CODE);
    } catch (err) {
      console.error('resolveComplaintType (recitire):', err);
      return null;
    }
  }
  return pick(rows, FALLBACK_CODE);
}

/** Eticheta unui cod deja scris în dosar — pentru alerta din Telegram. */
export async function complaintTypeLabel(code: string | null): Promise<ResolvedType | null> {
  if (!code) return null;
  try {
    const rows = await loadComplaintTypes();
    // Aici NU filtrăm după `active`: dosarul poate purta un tip stins între timp,
    // iar alerta trebuie să spună ce scrie în dosar, nu ce mai e în listă.
    const t = rows.find((r) => r.code === code);
    return t ? { code: t.code, name_ro: t.name_ro, culprit: t.culprit } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Blocul de prompt cu lista. E singurul loc din care agentul află codurile.
//
// Blocul se SINCRONIZEAZĂ pe conținut, nu doar pe marker, spre deosebire de
// celelalte blocuri ale controlerului. Motivul: restul blocurilor sunt proză
// scrisă de om, iar promptul viu poate fi mai bun decât fișierul (vezi
// comentariul lung din voice-controller). Lista asta are un singur stăpân —
// tabela — și e generată. Scrisă de mână în dashboard, ar trimite agentul spre
// coduri care nu există, iar tipul ar cădea tăcut pe ALTUL la fiecare apel.
// ---------------------------------------------------------------------------

export const TYPES_MARKER_RO = 'TIPUL RECLAMAȚIEI — LISTA ÎNCHISĂ';
export const TYPES_MARKER_RU = 'ТИП ЖАЛОБЫ — ЗАКРЫТЫЙ СПИСОК';
export const TYPES_END = 'SFÂRȘIT LISTĂ TIPURI';

// Un rând din bloc = un tip. Denumirea vine din panou, iar o denumire cu rând
// nou ar rupe lista în două și ar lăsa o linie fără cod.
const unRand = (s: string) => s.replace(/\s+/g, ' ').trim();

export function complaintTypesBlockRo(types: ComplaintType[]): string {
  const linii = types.map((t) => `${t.code} = ${unRand(t.name_ro)}`).join('\n');
  return `

${TYPES_MARKER_RO}:
- La FIECARE apel al register_complaint trimiți și «complaint_type»: codul de mai jos care se potrivește cel mai bine cu ce a povestit clientul.
- Codurile de mai jos sunt singurele valori acceptate. Nu inventa coduri, nu le traduce, nu le scrie cu litere mici.
- Nu se potrivește niciunul? Trimiți ALTUL.
- Tipul îl alegi TU din povestea clientului. NU i-l citi, NU i-l cere și NU-l pune la vot.
${linii}
${TYPES_END}`;
}

/**
 * Înlocuiește (sau adaugă) blocul cu lista în promptul viu al agentului.
 *
 * Partea PURĂ a sincronizării: singura bucată de cod din proiect care taie
 * promptul viu după indici, deci singura care merită teste proprii.
 *
 * `failed` = nu atingem promptul. Se întâmplă doar când blocul e rupt de mână
 * (marker fără sfârșit): nu ghicim unde se termină, ca să nu mâncăm restul.
 */
export function spliceTypesBlock(
  prompt: string, block: string, marker: string,
): { prompt: string; changed: boolean; failed: boolean } {
  const start = prompt.indexOf(marker);
  if (start === -1) {
    // Sfârșit fără marker = cineva a șters titlul și a lăsat lista. Adăugarea
    // unui bloc nou ar lăsa lista orfană acolo pentru totdeauna, cu coduri poate
    // stinse, iar modelul ar avea două liste. Mai bine raportăm și nu atingem.
    if (prompt.includes(TYPES_END)) return { prompt, changed: false, failed: true };
    return { prompt: prompt + block, changed: true, failed: false };
  }
  const endAt = prompt.indexOf(TYPES_END, start);
  if (endAt === -1) return { prompt, changed: false, failed: true };
  const end = endAt + TYPES_END.length;
  // Blocul poartă două rânduri goale la început; la înlocuire tăiem de la marker.
  const vrem = block.replace(/^\n+/, '');
  if (prompt.slice(start, end) === vrem) return { prompt, changed: false, failed: false };
  return { prompt: prompt.slice(0, start) + vrem + prompt.slice(end), changed: true, failed: false };
}

export function complaintTypesBlockRu(types: ComplaintType[]): string {
  const linii = types.map((t) => `${t.code} = ${unRand(t.name_ru)}`).join('\n');
  return `

${TYPES_MARKER_RU}:
- При КАЖДОМ вызове register_complaint отправляй и «complaint_type»: код из списка ниже, который лучше всего подходит к рассказу клиента.
- Коды ниже — единственные допустимые значения. Не придумывай коды, не переводи их и не пиши строчными буквами.
- Ничего не подходит? Отправляй ALTUL.
- Тип выбираешь ТЫ из рассказа клиента. НЕ зачитывай его клиенту, НЕ спрашивай и НЕ предлагай выбрать.
${linii}
${TYPES_END}`;
}
