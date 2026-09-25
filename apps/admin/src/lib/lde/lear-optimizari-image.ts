import { poster, CULORI, type Celula } from '../poster-sablon';
import type { Raport, MasinaRand } from '@/app/(dashboard)/lde/reguli/actions';

/**
 * Posterul săptămânal «cât se putea economisi» la LEAR Ungheni, pentru grupa livrărilor de uzină.
 *
 * Ion, 25.09.2026: «hai să facem poster pentru săptămâna trecută care să plece în Mejgorod,
 * posterul pleacă doar în optimizări km pe săptămână posibil, și explică simplu regula 1 2 3»;
 * apoi «km optimizare pe fiecare regulă să fie în rând cu auto» și «fă un design mai nou —
 * îl folosim acest șablon peste multe lucruri» (poster-sablon.ts).
 *
 * Doar km, fără lei și fără nume de oameni. Pe săptămână = km/zi × zilele
 * lucrate. Regulile 1 și 3 nu se adună (una doarme la uzină, alta acasă); regula 2 mută rutele.
 */
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export function perioadaText(luni: string, duminica: string): string {
  const a = new Date(`${luni}T12:00:00Z`), b = new Date(`${duminica}T12:00:00Z`);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${LUNI[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${LUNI[a.getUTCMonth()]} – ${b.getUTCDate()} ${LUNI[b.getUTCMonth()]}`;
}
const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');

export interface RandOptimizare {
  masina: string; tip: string | null; rute: string; casa: string | null; zile: number;
  kmSapt: number; r1: number | null; r2: number | null; r3: number | null; cea: 1 | 2 | 3 | null;
  // Ion, 25.09: «de ce în poster nu ai pus km brambura și liberi» — separat de reguli, cu steagul lor
  liber: number | null; brambura: number | null; pestePragLiber: boolean; pestePragBrambura: boolean;
}

/** km/săpt. economisiți pe fiecare regulă; null = regula nu se poate socoti la mașina asta */
export function randuriOptimizare(masini: MasinaRand[]): RandOptimizare[] {
  return masini.map((m) => {
    const z = m.zile_lucrate || 0;
    const sapt = (v?: number | null) => (v == null ? null : v * z);
    const r1 = sapt(m.r1?.km), r2 = sapt(m.r2?.km), r3 = sapt(m.r3?.km);
    const perechi: [1 | 2 | 3, number | null][] = [[1, r1], [2, r2], [3, r3]];
    const best = perechi.filter(([, v]) => v != null && v > 0).sort((a, b) => (b[1]! - a[1]!))[0];
    return { masina: m.masina, tip: m.tip, rute: m.rute.map((r) => r.id).join(' + '), casa: m.casa, zile: z,
      kmSapt: (m.azi_fara_parc ?? m.azi) * z, r1, r2, r3, cea: best ? best[0] : null,
      liber: m.liber?.km ?? null, brambura: m.liber?.km_brambura ?? null,
      pestePragLiber: !!m.liber?.peste_prag, pestePragBrambura: !!m.liber?.peste_prag_brambura };
  }).filter((r) => r.r1 != null || r.r3 != null)
    .sort((a, b) => Math.max(b.r1 ?? 0, b.r2 ?? 0, b.r3 ?? 0) - Math.max(a.r1 ?? 0, a.r2 ?? 0, a.r3 ?? 0));
}

export async function generateOptimizariImage(raport: Pick<Raport, 'saptamina' | 'pana_la' | 'masini'>): Promise<Buffer> {
  const rows = randuriOptimizare(raport.masini);
  const suma = (k: 'r1' | 'r2' | 'r3') => rows.reduce((s, r) => s + Math.max(0, r[k] ?? 0), 0);
  // R2 net: rutele se mută între mașini, deci cine câștigă și cine pierde se adună împreună
  const t2 = rows.reduce((s, r) => s + (r.r2 ?? 0), 0);
  const [t1, t3] = [suma('r1'), suma('r3')];
  const celula = (v: number | null, cea: boolean): Celula => v == null ? { text: '—', culoare: CULORI.griDeschis }
    : v > 0 ? { text: `−${nr(v)}`, culoare: CULORI.verde, bold: cea, fundal: cea ? CULORI.verdeFundal : undefined }
    : { text: v < 0 ? `+${nr(-v)}` : '0', culoare: CULORI.griDeschis };

  const p = poster({
    latime: 960,
    supratitlu: 'LEAR Ungheni',
    titlu: 'Cât se putea economisi săptămâna trecută',
    subtitlu: 'Km pe care fiecare mașină i-ar fi făcut mai puțin, cu aceleași rute și aceiași oameni, după fiecare regulă.',
    eticheta: perioadaText(raport.saptamina, raport.pana_la),
  });
  p.carduri([
    { eticheta: 'Regula 1', titlu: 'Doarme lângă uzină', text: 'Mașina face doar drumurile pe rută — fără drumul de acasă dimineața și seara.', valoare: `−${nr(t1)} km`, subValoare: 'pe săptămână' },
    { eticheta: 'Regula 2', titlu: 'Rutele împărțite altfel', text: 'Fiecare mașină ia ruta cea mai aproape de casa ei, între mașini de aceeași mărime.', valoare: `−${nr(t2)} km`, subValoare: 'pe săptămână' },
    { eticheta: 'Regula 3', titlu: 'Nu pleacă acasă între schimburi', text: 'Doarme acasă, dar între schimburi așteaptă la uzină sau la capătul rutei.', valoare: `−${nr(t3)} km`, subValoare: 'pe săptămână' },
  ]);
  p.tabel([
    { titlu: 'Mașina', latime: 150 }, { titlu: 'Doarme la', latime: 120 }, { titlu: 'Rutele', latime: 96 },
    { titlu: 'Acum, km/săpt.', latime: 104, aliniere: 'end' },
    { titlu: 'Regula 1', latime: 90, aliniere: 'end' }, { titlu: 'Regula 2', latime: 90, aliniere: 'end' }, { titlu: 'Regula 3', latime: 90, aliniere: 'end' },
    { titlu: 'Km liberi', latime: 88, aliniere: 'end' }, { titlu: 'Km brambura', latime: 96, aliniere: 'end' },
  ], rows.map((r) => [
    { text: `${r.masina}${r.tip ? ' · ' + r.tip.replace('Sprinter ', 'Spr ') : ''}`, bold: true },
    { text: r.casa ?? '—', culoare: CULORI.gri },
    { text: r.rute, culoare: CULORI.gri },
    { text: nr(r.kmSapt) },
    celula(r.r1, r.cea === 1), celula(r.r2, r.cea === 2), celula(r.r3, r.cea === 3),
    ...([[r.liber, r.pestePragLiber], [r.brambura, r.pestePragBrambura]] as [number | null, boolean][]).map(([v, peste]): Celula =>
      v == null ? { text: '—', culoare: CULORI.griDeschis }
      : v < 5 ? { text: '0', culoare: CULORI.griDeschis }
      : { text: nr(v), bold: peste, culoare: peste ? CULORI.rosu : CULORI.text, fundal: peste ? '#f8e3e0' : undefined }),
  ]), { gol: 'Nicio mașină n-ar fi făcut mai puțini km în săptămâna asta.' });
  const bestTot = rows.reduce((s, r) => s + Math.max(0, r.r1 ?? 0, r.r2 ?? 0, r.r3 ?? 0), 0);
  p.total(`Cu regula cea mai bună pe fiecare mașină: −${nr(bestTot)} km pe săptămână`, `≈ −${nr(bestTot * 52 / 12)} km pe lună`);
  const tLiber = rows.reduce((s, r) => s + (r.liber ?? 0), 0), tBr = rows.reduce((s, r) => s + (r.brambura ?? 0), 0);
  p.nota(`Km liberi = curse fără nicio legătură cu poarta LEAR (${nr(tLiber)} km pe flotă). Km brambura = drumul de acasă / spre casă pe unde mașina n-a mers în altă zi a săptămânii (${nr(tBr)} km). Roșu = peste 50 km pe săptămână. Regulile LEAR, §11.`);
  p.nota('Verde încercuit = regula care taie cei mai mulți km la mașina aceea. «+» = cu regula aceea mașina ar merge mai mult. Regulile nu se adună. Km din urma GPS, fără drumurile la reparație.');
  return p.png();
}

// ─── trimiterea în grupa livrărilor de uzină ─────────────────────────────────
// Ion, 25.09: «posterul LEAR să se trimită în grupa livrări uzină acum, și doar acolo automat» — deci
// în aceeași grupă ca posterul de livrare SEBN (app_config.livrare_poster_chat_id), NU în Mejgorod.
// Luni, după raportul săptămânal (lear-saptamanal.sh cheamă /api/cron/lde-timp-liber, care cheamă
// asta). O dată pe săptămână: `app_config.lear_poster_last` ține ultima săptămână trimisă.
import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { LIVRARE_POSTER_CHAT_KEY } from './livrare-poster';

export const LEAR_POSTER_LAST_KEY = 'lear_poster_last';

export async function trimitePosterLear(raport: Pick<Raport, 'saptamina' | 'pana_la' | 'masini'>, opts: { force?: boolean; dry?: boolean } = {}):
  Promise<{ trimis: boolean; motiv?: string }> {
  const sb = getSupabase();
  const { data: last } = await sb.from('app_config').select('value').eq('key', LEAR_POSTER_LAST_KEY).maybeSingle();
  if (!opts.force && last?.value === raport.saptamina) return { trimis: false, motiv: 'deja trimis pentru săptămâna asta' };
  if (!randuriOptimizare(raport.masini).length) return { trimis: false, motiv: 'nicio optimizare de arătat' };
  const { data: g } = await sb.from('app_config').select('value').eq('key', LIVRARE_POSTER_CHAT_KEY).maybeSingle();
  const chat = (g?.value ?? '').trim();
  if (!chat) return { trimis: false, motiv: 'grupa livrărilor de uzină nu e legată (app_config.livrare_poster_chat_id)' };
  if (opts.dry) return { trimis: false, motiv: 'dry' };
  const png = await generateOptimizariImage(raport);
  const caption = `LEAR Ungheni · cât se putea economisi · ${perioadaText(raport.saptamina, raport.pana_la)}`;
  const r = await sendTelegramPhoto(chat, png, caption, `lear-optimizari-${raport.saptamina}.png`);
  if (!r.ok) return { trimis: false, motiv: 'Telegram n-a primit imaginea' };
  await sb.from('app_config').upsert({ key: LEAR_POSTER_LAST_KEY, value: raport.saptamina }, { onConflict: 'key' });
  return { trimis: true };
}
