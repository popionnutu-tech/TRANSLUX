// Regulile de logare din ION-126 — funcții pure, fără importuri Next, testate în login-guard.test.ts.
// Datele vin din `admin_login_events` (migr. 428); scrierea și citirea stau în api/auth/login.

export const FEREASTRA_BLOCARE_MS = 15 * 60 * 1000;
export const MAX_GRESELI_EMAIL = 5;
export const MAX_GRESELI_IP = 30;
export const ISTORIC_RETELE_ZILE = 90;

/** Motivele care numără ca greșeală. `blocat_*` nu intră: altfel blocarea s-ar prelungi singură. */
const GRESELI = new Set(['parola', 'necunoscut', 'inactiv']);

export interface EvenimentLogare {
  created_at: string;
  ok: boolean;
  motiv: string;
}

/**
 * Câte greșeli are emailul în fereastră, numărate doar DUPĂ ultima logare reușită —
 * cine a greșit de 4 ori, a intrat, apoi a mai greșit o dată, nu e blocat.
 * `evenimente` = rândurile emailului din ultimele 15 min, în orice ordine.
 */
export function greseliDupaUltimaReusita(evenimente: EvenimentLogare[], acum: number): number {
  const recente = evenimente
    .filter(e => acum - Date.parse(e.created_at) < FEREASTRA_BLOCARE_MS)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  let n = 0;
  for (const e of recente) {
    if (e.ok) break;
    if (GRESELI.has(e.motiv)) n++;
  }
  return n;
}

export function greseliInFereastra(evenimente: EvenimentLogare[], acum: number): number {
  return evenimente.filter(e => !e.ok && GRESELI.has(e.motiv) && acum - Date.parse(e.created_at) < FEREASTRA_BLOCARE_MS).length;
}

/**
 * Rețeaua adresei: /24 la IPv4, /48 la IPv6. Un furnizor mobil dă omului altă adresă în fiecare zi,
 * iar comparația adresă cu adresă ar da un semnal la fiecare drum la muncă.
 */
export function reteaDin(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const s = ip.trim();
  const v4 = s.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (!s.includes(':')) return null;
  const [cap, coada = ''] = s.split('::');
  const a = cap ? cap.split(':') : [];
  const b = s.includes('::') && coada ? coada.split(':') : [];
  const lipsa = s.includes('::') ? 8 - a.length - b.length : 0;
  const grupuri = [...a, ...Array(Math.max(lipsa, 0)).fill('0'), ...b];
  if (grupuri.length !== 8 || grupuri.some(g => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return `${grupuri.slice(0, 3).map(g => parseInt(g, 16).toString(16)).join(':')}::/48`;
}

/** Tokenul e încă bun doar dacă contul e activ și versiunea lui de sesiune n-a crescut de la emitere. */
export function sesiuneValida(
  svToken: unknown,
  cont: { active: boolean; session_version: number } | null,
): boolean {
  if (!cont || cont.active === false) return false;
  const sv = typeof svToken === 'number' ? svToken : 0; // tokenurile de dinainte de migr. 428 n-au `sv`
  return sv === cont.session_version;
}
