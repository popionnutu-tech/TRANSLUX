// Indicațiile de luni pentru dispecerul uzinelor (Alexei), în grupa livrărilor, imediat după poster (ION-62).
//
// Ion, 25.09.2026: «acum săptămânal, unde este semnificativ, împreună cu poster, mesaj lui Alexei cu
// indicații ce să facă, la SEBN și LEAR ambele uzini — pun regulă». Posterul spune CÂT se putea
// economisi; mesajul ăsta spune CE SE FACE: cine schimbă rutele, cine nu pleacă acasă între ture,
// cine să doarmă lângă uzină, cine să răspundă unde a umblat. Doar când e ceva semnificativ; altfel
// `null` = tăcere. Regula, în cuvinte: §12 din regulile livrării (migr. 401), reguli-sebn.json nr. 8.
//
// Funcții pure, ca timp-liber.ts: nu citesc nimic, ca să se poată testa. HTML-ul e scăpat câmp cu
// câmp; plafonul de lungime se aplică pe linii întregi. Trimiterea e la sfârșitul fișierului.
import { escapeHtml } from '@/lib/telegram-notify';
import { perioada, PLAFON } from './timp-liber';
import type { MasinaRand, TimpLiberMasina } from '@/app/(dashboard)/lde/reguli/actions';

/** «semnificativ» la LEAR: atâția km pe săptămână taie regula cea mai bună a unei mașini; la regula 2, câștigul net al flotei */
export const PRAG_INDICATII_KM_SAPT = 100;

const nr = (v: number) => Math.round(v).toLocaleString('ro-RO');
const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const luna = (kmSapt: number) => `≈ −${nr(kmSapt * 52 / 12)} km/lună`;

// plafonul: linii întregi, cât încap, cu o linie de rest — ca în textTimpLiber
function impacheteaza(antet: string, linii: string[], subsol: string): string {
  let text = antet;
  let puse = 0;
  for (const l of linii) {
    if ((text + '\n' + l + subsol).length + 40 > PLAFON) break;
    text += '\n' + l; puse++;
  }
  if (puse < linii.length) text += `\n… și încă ${linii.length - puse} ${linii.length - puse === 1 ? 'rând' : 'rânduri'}`;
  return text + subsol;
}

// «X — 61,0 km liber în 2 zile; 55 km brambura: unde a fost?» — doar cifrele, ca în mesajul ADMIN;
// opririle (date personale) rămân pe pagină
function liniaLiber(masina: string, L: TimpLiberMasina | undefined, sofer?: string | null): string | null {
  if (!L || !(L.peste_prag || L.peste_prag_brambura)) return null;
  const parti: string[] = [];
  if (L.peste_prag) parti.push(`${n1(L.km)} km liber în ${L.zile} ${L.zile === 1 ? 'zi' : 'zile'}`);
  if (L.peste_prag_brambura) parti.push(`${n1(L.km_brambura ?? 0)} km brambura`);
  return `• <b>${escapeHtml(masina)}</b>${sofer ? ` (${escapeHtml(sofer)})` : ''} — ${parti.join('; ')}: unde a fost?`;
}

// ─── LEAR Ungheni / LEAR Florești ────────────────────────────────────────────
export type RandLear = Pick<MasinaRand, 'masina' | 'casa' | 'zile_lucrate' | 'rute' | 'r1' | 'r2' | 'r3' | 'liber'>;

export function indicatiiLear(
  raport: { saptamina: string; pana_la: string; masini: RandLear[] },
  uzina: { nume: string; uz: string },
  baseUrl: string,
): string | null {
  const M = raport.masini;
  // km/săpt = km/zi × zilele lucrate, ca pe poster; null = regula nu se poate socoti la mașina asta
  const sapt = (m: RandLear, v?: number | null) => (v == null ? null : v * (m.zile_lucrate || 0));
  const R = M.map((m) => ({ m, r1: sapt(m, m.r1?.km), r2: sapt(m, m.r2?.km), r3: sapt(m, m.r3?.km) }));
  // regula 2 mută rutele între mașini: cine câștigă și cine pierde se adună; sub prag pe flotă nu se propune,
  // oricât ar câștiga o mașină singură — altcineva ar merge mai mult
  const r2Net = R.reduce((s, x) => s + (x.r2 ?? 0), 0);
  const cuR2 = r2Net >= PRAG_INDICATII_KM_SAPT;
  const cea = (x: typeof R[number]): { regula: 1 | 2 | 3; km: number } | null => {
    const p: [1 | 2 | 3, number | null][] = [[1, x.r1], [3, x.r3], ...(cuR2 ? [[2, x.r2] as [2, number]] : [])];
    const best = p.filter(([, v]) => v != null && v > 0).sort((a, b) => b[1]! - a[1]!)[0];
    return best ? { regula: best[0], km: best[1]! } : null;
  };
  const alese = R.map((x) => ({ ...x, cea: cea(x) })).filter((x) => x.cea && x.cea.km >= PRAG_INDICATII_KM_SAPT)
    .sort((a, b) => b.cea!.km - a.cea!.km);
  const detinator = (id: string, nuEl: string) => M.find((m) => m.masina !== nuEl && m.rute.some((r) => r.id === id))?.masina ?? null;
  const ruteAcum = (m: RandLear) => m.rute.map((r) => r.id).join(' + ');
  const casa = (m: RandLear) => (m.casa ? ` (${escapeHtml(m.casa)})` : '');

  const linii: string[] = [];
  const b2 = alese.filter((x) => x.cea!.regula === 2);
  if (b2.length) {
    linii.push(`<b>Rutele împărțite altfel (regula 2)</b> — pe flotă −${nr(r2Net)} km/săpt.:`);
    const pomenite = new Set<string>();
    for (const x of b2) {
      const noi = [x.m.r2?.rute.A, x.m.r2?.rute.B].filter((s): s is string => !!s);
      // de la cine ia fiecare rută nouă, grupat pe mașină: «A9 + B5 de la 807MUM» sau «A9 de la X, B5 de la Y»
      const deLa = new Map<string, string[]>();
      for (const id of noi.filter((id) => !x.m.rute.some((r) => r.id === id))) {
        const cine = detinator(id, x.m.masina) ?? '—';
        deLa.set(cine, [...(deLa.get(cine) ?? []), id]);
      }
      const ia = [...deLa].map(([cine, ids]) => `${ids.join(' + ')} de la ${escapeHtml(cine)}`).join(', ');
      // dă doar rutele pe care le pierde; ce păstrează (aceeași rută pe o tură) nu se scrie
      const da = x.m.rute.map((r) => r.id).filter((id) => !noi.includes(id)).join(' + ');
      linii.push(`• <b>${escapeHtml(x.m.masina)}</b>${casa(x.m)}: ia ${ia || noi.join(' + ')}${da ? `, dă ${da}` : ''} — −${nr(x.cea!.km)} km/săpt.`);
      pomenite.add(x.m.masina);
      // partenerii: ce iau ei în schimb și cât îi costă (sau câștigă)
      for (const cine of deLa.keys()) {
        const p = R.find((y) => y.m.masina === cine);
        if (!p || pomenite.has(cine)) continue;
        pomenite.add(cine);
        const pn = [p.m.r2?.rute.A, p.m.r2?.rute.B].filter(Boolean).join(' + ');
        const kmP = p.r2 ?? 0;
        linii.push(`  ↳ ${escapeHtml(cine)} ia ${pn || '—'} (${kmP >= 0 ? `−${nr(kmP)}` : `+${nr(-kmP)}`} km/săpt.)`);
      }
    }
  }
  const b1 = alese.filter((x) => x.cea!.regula === 1);
  if (b1.length) {
    linii.push(`<b>Doarme lângă uzină (regula 1)</b> — fără drumul de acasă dimineața și seara:`);
    for (const x of b1) linii.push(`• <b>${escapeHtml(x.m.masina)}</b>${casa(x.m)} — −${nr(x.cea!.km)} km/săpt.`);
  }
  const b3 = alese.filter((x) => x.cea!.regula === 3);
  if (b3.length) {
    linii.push(`<b>Între ture nu pleacă acasă (regula 3)</b> — așteaptă la uzină sau la capătul rutei:`);
    for (const x of b3) linii.push(`• <b>${escapeHtml(x.m.masina)}</b>${casa(x.m)} — −${nr(x.cea!.km)} km/săpt.`);
  }
  const bl = M.map((m) => liniaLiber(m.masina, m.liber)).filter((s): s is string => !!s);
  if (bl.length) {
    linii.push(`<b>Km liberi și brambura (§11)</b> — peste 50 km pe săptămână:`);
    linii.push(...bl);
  }
  if (!linii.length) return null;

  const antet = `📋 <b>${escapeHtml(uzina.nume)} · ce facem săptămâna asta</b> · ${escapeHtml(perioada(raport.saptamina, raport.pana_la))}\n` +
    `Alexei, din posterul de mai sus — unde se taie cel mai mult:`;
  // totalul e al flotei, cu regula cea mai bună pe fiecare mașină (regulile nu se adună), ca pe poster
  const tot = R.reduce((s, x) => s + (cea(x)?.km ?? 0), 0);
  const link = `${baseUrl}/lde/reguli?saptamina=${encodeURIComponent(raport.saptamina)}${uzina.uz ? `&uz=${encodeURIComponent(uzina.uz)}` : ''}`;
  const subsol = `\nCu regula cea mai bună pe fiecare mașină: <b>−${nr(tot)} km/săpt.</b> (${luna(tot)}). Regulile nu se adună.` +
    `\n<a href="${link}">cifrele, zi cu zi — pe pagină</a>`;
  return impacheteaza(antet, linii, subsol);
}

// ─── trimiterea în grupa livrărilor de uzină ─────────────────────────────────
// Aceeași grupă ca posterul (app_config.livrare_poster_chat_id). O dată pe săptămână și pe uzină:
// `app_config.indicatii_alexei_last_<uz>` ține ultima săptămână trimisă; dedup separat de al posterului,
// ca un poster deja plecat de mână să nu lase indicațiile netrimise.
import { getSupabase } from '../supabase';
import { sendTelegram } from '../telegram-notify';
import { LIVRARE_POSTER_CHAT_KEY } from './livrare-poster';

export const cheiaIndicatiilor = (uz: string) => `indicatii_alexei_last_${uz || 'lear'}`;

export async function trimiteIndicatii(uz: string, saptamina: string, text: string | null, opts: { force?: boolean; dry?: boolean } = {}):
  Promise<{ trimis: boolean; motiv?: string; text?: string }> {
  if (!text) return { trimis: false, motiv: 'nimic semnificativ — tăcere' };
  const cheie = cheiaIndicatiilor(uz);
  const sb = getSupabase();
  const { data: last } = await sb.from('app_config').select('value').eq('key', cheie).maybeSingle();
  if (!opts.force && last?.value === saptamina) return { trimis: false, motiv: 'deja trimis pentru săptămâna asta' };
  const { data: g } = await sb.from('app_config').select('value').eq('key', LIVRARE_POSTER_CHAT_KEY).maybeSingle();
  const chat = (g?.value ?? '').trim();
  if (!chat) return { trimis: false, motiv: 'grupa livrărilor de uzină nu e legată (app_config.livrare_poster_chat_id)' };
  if (opts.dry) return { trimis: false, motiv: 'dry', text };
  const ok = await sendTelegram(chat, text);
  if (!ok) return { trimis: false, motiv: 'Telegram n-a primit mesajul' };
  await sb.from('app_config').upsert({ key: cheie, value: saptamina }, { onConflict: 'key' });
  return { trimis: true };
}
