import { cursaIncheiata, DURATA_MAXIMA_CURSA_MS, MARJA_DUPA_SOSIRE_MS } from '@translux/db';
import { verifyInitData } from '@/lib/telegram/init-data';
import type { ComandaPublica } from './public';

// Biletele clientului în mini app-ul Telegram de pe translux.md (ION-249). Identitatea = initData-ul Telegram, verificat
// HMAC cu tokenul botului (aceeași verificare ca mini app-ul șoferului, ION-239/241), prospețime 24 h. Fără initData
// valid nu pleacă nimic personal. Lista = comenzile plătite legate de telegram_id (ION-244) a căror cursă nu s-a încheiat
// (ION-252: sosirea din grafic + 30 min; fără oră, plecarea + 6 h — după aceea biletul stă doar în «Istoric»); fiecare
// comandă vine ca pe pagina biletului (cardul cu QR, ION-236).
// Modul fără bază și fără Next: accesul la date vine prin RepoBileteClient (client-repo.ts), testat cu un repo fals.

/** Comenzile care au bilet de arătat: plătite (cu QR) sau plătite după expirare (dispecerul le verifică). */
export const STARI_CLIENT = ['platita', 'platita_fara_bilet'] as const;
/** Câte comenzi active arată mini app-ul (ca lista botului, ION-244). */
export const MAX_COMENZI_CLIENT = 10;
/**
 * Comenzile citite: plecate de cel mult cât ține cea mai lungă cursă + marja (sfârșitul exact se află din ora sosirii,
 * după citire). Câteva în plus față de MAX_COMENZI_CLIENT: cele încheiate de curând nu au voie să împingă afară biletele
 * viitoare.
 */
export const FEREASTRA_CITIRE_DUPA_PLECARE_MS = DURATA_MAXIMA_CURSA_MS + MARJA_DUPA_SOSIRE_MS;
// 90 în plus (verificarea ION-252, 05.10: cu 10, un cont cu peste 10 curse încheiate în aceeași zi vedea 8 bilete viitoare în loc de 10).
export const CITITE_IN_PLUS = 90;

export interface ComandaContului { cod: string; telegram_id: number | null }
export interface ContactBrut { passenger_name: string; phone: string; /** cel mai nou e-mail lăsat vreodată (ION-249) */ email?: string | null }
/** Datele pentru precompletarea formularului de cumpărare: numele în două câmpuri, telefonul 373XXXXXXXX, e-mailul. */
export interface ContactClient { nume: string; prenume: string; telefon: string; email: string | null }

/** Câte călătorii arată fila «Istoric» (Ion, 05.10: «ultim istoric, toate călătoriile»). */
export const MAX_ISTORIC = 50;
/** O călătorie din istoricul contului: fără QR, fără date personale în plus. */
export interface CalatorieIstoric {
  cod: string; telegram_id: number | null; status: string; from_name: string; to_name: string;
  departure_at: string; seats: number; total: number;
}

export interface RepoBileteClient {
  /** Comenzile contului în STARI_CLIENT, plecate după `plecareDupa` (ISO), ordonate după plecare. */
  comenziActive(telegramId: number, plecareDupa: string, limita: number): Promise<ComandaContului[]>;
  /** Comanda așa cum o vede pagina biletului (null = a dispărut între timp). */
  biletComplet(cod: string): Promise<ComandaPublica | null>;
  /** Numele și telefonul din cea mai nouă comandă a contului (orice stare) + cel mai nou e-mail lăsat. */
  ultimulContact(telegramId: number): Promise<ContactBrut | null>;
  /** Toate comenzile contului care au ajuns la plată (plătite, anulate, returnate), cele mai noi întâi. */
  istoric(telegramId: number, limita: number): Promise<CalatorieIstoric[]>;
  /** false = contul a depășit plafonul de cereri. */
  plafon(telegramId: number): Promise<boolean>;
}

export type EroareClient = 'neautentificat' | 'expirat' | 'prea_multe';

export type RaspunsBileteClient =
  | { ok: true; status: 200; bilete: ComandaPublica[]; contact: ContactClient | null; istoric: Omit<CalatorieIstoric, 'telegram_id'>[] }
  | { ok: false; status: 401 | 429; eroare: EroareClient };

export interface CerereBileteClient {
  initData: string | null | undefined;
  botToken: string | undefined;
  acumMs: number;
}

const FMT_ZI_CHISINAU = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' });

/** Ziua calendaristică a Chișinăului ('YYYY-MM-DD') pentru un instant. */
export function ziuaChisinau(ms: number): string {
  return FMT_ZI_CHISINAU.format(new Date(ms));
}

/**
 * «Popescu Ion Vasile» → nume «Popescu», prenume «Ion Vasile» (site-ul le lipește în ordinea asta: numeComplet).
 * Un singur cuvânt sau telefon nevalid → null: formularul rămâne gol, nu precompletat greșit.
 */
export function contactDinComanda(c: ContactBrut | null): ContactClient | null {
  if (!c) return null;
  const parti = String(c.passenger_name ?? '').trim().split(/\s+/).filter(Boolean);
  const telefon = String(c.phone ?? '').replace(/\D/g, '');
  if (parti.length < 2 || !/^373\d{8}$/.test(telefon)) return null;
  const email = String(c.email ?? '').trim().toLowerCase();
  return { nume: parti[0], prenume: parti.slice(1).join(' '), telefon, email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null };
}

/**
 * ION-249 (Ion, 05.10: «da» — legarea la cumpărare): comanda făcută din mini app vine cu initData-ul contului; dacă e
 * valabil, comanda se leagă de acel cont. Invalid / lipsă → null, iar cumpărarea merge înainte fără legare.
 */
export function telegramDinInitData(initData: string | null | undefined, botToken: string | undefined, acumMs: number): number | null {
  if (!initData || !botToken) return null;
  const v = verifyInitData(initData, botToken, acumMs / 1000);
  return v.ok ? v.telegramId : null;
}

/** initData → telegram_id verificat, sau motivul refuzului (fără detalii pentru apelant). */
function identitate(c: CerereBileteClient): { ok: true; telegramId: number } | { ok: false; eroare: 'neautentificat' | 'expirat' } {
  if (!c.botToken) return { ok: false, eroare: 'neautentificat' };
  const v = verifyInitData(c.initData, c.botToken, c.acumMs / 1000);
  if (v.ok) return { ok: true, telegramId: v.telegramId };
  return { ok: false, eroare: v.motiv === 'expirat' ? 'expirat' : 'neautentificat' };
}

export async function bileteleClientului(cerere: CerereBileteClient, repo: RepoBileteClient): Promise<RaspunsBileteClient> {
  const id = identitate(cerere);
  if (!id.ok) return { ok: false, status: 401, eroare: id.eroare };
  if (!(await repo.plafon(id.telegramId))) return { ok: false, status: 429, eroare: 'prea_multe' };

  const plecareDupa = new Date(cerere.acumMs - FEREASTRA_CITIRE_DUPA_PLECARE_MS).toISOString();
  const [comenzi, contactBrut, istoricBrut] = await Promise.all([
    repo.comenziActive(id.telegramId, plecareDupa, MAX_COMENZI_CLIENT + CITITE_IN_PLUS),
    repo.ultimulContact(id.telegramId),
    repo.istoric(id.telegramId, MAX_ISTORIC),
  ]);
  const istoric = istoricBrut.filter((c) => Number(c.telegram_id) === id.telegramId).slice(0, MAX_ISTORIC)
    .map(({ telegram_id: _, ...rest }) => rest);
  // Apărare în adâncime: chiar dacă interogarea ar întoarce altceva, pleacă doar comenzile acestui cont.
  const aleContului = comenzi.filter((c) => Number(c.telegram_id) === id.telegramId);
  const bilete = (await Promise.all(aleContului.map((c) => repo.biletComplet(c.cod))))
    .filter((b): b is ComandaPublica => b !== null && !cursaIncheiata(b.departure_at, b.sosire, cerere.acumMs))
    .slice(0, MAX_COMENZI_CLIENT);
  return { ok: true, status: 200, bilete, contact: contactDinComanda(contactBrut), istoric };
}
