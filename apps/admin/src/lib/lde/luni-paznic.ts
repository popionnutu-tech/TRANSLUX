// Paznicul rulării de luni (ION-62). Ion, 25.09.2026: «trimitem luni; dacă nu se trimit, îmi dai mie în bot».
//
// Luni la 08:00 lear-saptamanal.sh (VPS) scrie trei rapoarte și trimite trei postere + indicațiile. Dacă ceva
// nu pleacă — workerul a picat, cronul n-a pornit, Telegram a refuzat, grupa nu e legată — nimeni n-ar fi
// aflat: rutele întorc JSON într-un log de pe VPS. Aici se verifică URMELE, nu procesul: rândul din
// lde_analiza_reguli pe fiecare uzină și cheile de dedup din app_config (posterul și indicațiile marchează
// săptămâna când au fost trimise SAU când n-aveau ce trimite). Ce lipsește ajunge la ADMIN (Ion, în bot).
//
// Se cheamă de două ori: din script, la sfârșit (/api/cron/lde-luni-paznic) — și luni seara din
// copy-assignments, ca plasă și pentru cazul în care scriptul n-a pornit deloc.
import { getSupabase } from '../supabase';
import { alertAdmins, escapeHtml } from '../telegram-notify';
import { chisinauTodayIso } from '../chisinau-time';
import { cheiaPosterului } from './lear-optimizari-image';
import { SEBN_POSTER_LAST_KEY } from './sebn-optimizari-image';
import { cheiaIndicatiilor } from './indicatii-alexei';

export const UZINE_LUNI = [
  { nume: 'LEAR Ungheni', rind: 'LEAR Ungheni', poster: cheiaPosterului('LEAR Ungheni'), indicatii: cheiaIndicatiilor('') },
  { nume: 'LEAR Florești', rind: 'LEAR Florești', poster: cheiaPosterului('LEAR Florești'), indicatii: cheiaIndicatiilor('floresti') },
  { nume: 'SEBN Orhei și Strășeni', rind: 'SEBN', poster: SEBN_POSTER_LAST_KEY as string | null, indicatii: null as string | null },
  // ION-73: analiza Trox + suburban Briceni se scrie lunea; posterul NU pleacă până la «da»-ul lui Ion, deci nu i se cere
  { nume: 'Trox + suburban Briceni', rind: 'BRICENI', poster: null, indicatii: null },
];

export type Lipsa = { uzina: string; ce: 'raport' | 'poster' | 'indicații' };

// săptămâna pe care o scrie rularea de luni: cea a lui «ieri» (aceeași regulă ca în workeri)
export function saptaminaLunii(cerut?: string | null): string {
  const d = new Date(`${cerut && /^\d{4}-\d{2}-\d{2}$/.test(cerut) ? cerut : chisinauTodayIso()}T12:00:00Z`);
  if (!cerut) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

/** funcție pură: ce lipsește pentru săptămâna dată, din rândurile și cheile citite */
export function lipsurileLunii(saptamina: string, rapoarte: Set<string>, chei: Map<string, string>): Lipsa[] {
  const l: Lipsa[] = [];
  for (const u of UZINE_LUNI) {
    if (!rapoarte.has(u.rind)) l.push({ uzina: u.nume, ce: 'raport' });
    if (u.poster && chei.get(u.poster) !== saptamina) l.push({ uzina: u.nume, ce: 'poster' });
    if (u.indicatii && chei.get(u.indicatii) !== saptamina) l.push({ uzina: u.nume, ce: 'indicații' });
  }
  return l;
}

export function textLuniPaznic(saptamina: string, lipsuri: Lipsa[]): string | null {
  if (!lipsuri.length) return null;
  const peUzina = new Map<string, string[]>();
  for (const x of lipsuri) peUzina.set(x.uzina, [...(peUzina.get(x.uzina) ?? []), x.ce]);
  const linii = [...peUzina].map(([u, ce]) => `• <b>${escapeHtml(u)}</b>: ${ce.join(', ')}`);
  return `⛔ <b>Luni, săptămâna din ${escapeHtml(saptamina)} — n-a plecat tot</b>\n${linii.join('\n')}\n` +
    `Log: /root/lde-worker/lear-saptamanal.log pe VPS. Retrimitere de mână: /api/cron/lde-timp-liber[?uz=floresti]&poster=force&indicatii=force, /api/cron/sebn-optimizari?force=1; Briceni: bash /root/lde-worker/briceni/cod/saptamanal.sh.`;
}

export async function verificaLuni(saptamina: string, opts: { dry?: boolean } = {}): Promise<{ lipsuri: Lipsa[]; trimis: boolean; text: string | null }> {
  const sb = getSupabase();
  const [{ data: r }, { data: c }] = await Promise.all([
    sb.from('lde_analiza_reguli').select('uzina').eq('saptamina', saptamina).in('uzina', UZINE_LUNI.map((u) => u.rind)),
    sb.from('app_config').select('key, value').in('key', UZINE_LUNI.flatMap((u) => [u.poster, u.indicatii].filter((k): k is string => !!k))),
  ]);
  const lipsuri = lipsurileLunii(saptamina, new Set((r ?? []).map((x) => x.uzina as string)), new Map((c ?? []).map((x) => [x.key as string, x.value as string])));
  const text = textLuniPaznic(saptamina, lipsuri);
  const trimis = text && !opts.dry ? await alertAdmins(text) : false;
  return { lipsuri, trimis, text };
}
