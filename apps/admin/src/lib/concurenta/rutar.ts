// Monitorul rutar.md (Ion, 10.10.2026: «fă parsing zilnic și dacă apare o ofertă nouă față de ce noi propunem — să vină
// mie pe Telegram»). Rutar («RUTA REGALĂ» SRL) vinde din septembrie 2026 Chișinău ↔ Bălți prin Orhei, doar online.
//
// Site-ul e Next.js: datele stau în fluxul RSC din HTML (self.__next_f.push). Două surse:
//  • /schedule — toate rutele (cod, ora de plecare, zilele, prețul capăt-capăt);
//  • paginile de pereche din sitemap (/moldova-chisinau/moldova-orhei…) — prețul pe tronson și plata (online / la șofer).
// Partea de aici e pură (parsare + diferență + text), ca să se poată testa; citirea și trimiterea stau în ruta de cron.

export const RUTAR_BASE = 'https://rutar.md';

export interface RutarCursa {
  /** «chisinau>balti 06:10» — cheia după care comparăm zilele, nu codul lor intern. */
  cheie: string;
  cod: string;
  de: string;
  spre: string;
  ora: string;
  sosire: string;
  zile: number[];
  pret: number | null;
  km: number | null;
}

export interface RutarPereche {
  /** «chisinau>orhei» */
  cheie: string;
  de: string;
  spre: string;
  curse: number;
  pretMin: number | null;
  pretMax: number | null;
  /** true când măcar o cursă se poate plăti la șofer. */
  laSofer: boolean;
}

export interface RutarStare {
  la: string;
  curse: Record<string, RutarCursa>;
  perechi: Record<string, RutarPereche>;
}

/** Fluxul RSC lipit la loc din toate bucățile self.__next_f.push([1,"…"]). */
export function fluxRsc(html: string): string {
  let flux = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    flux += JSON.parse(`"${m[1]}"`);
  }
  return flux;
}

/** Obiectele JSON care încep cu `inceput` (ex. «{"id":"…","name":"…","referenceCode"»), tăiate pe acolade echilibrate. */
function obiecte(flux: string, inceput: RegExp): any[] {
  const out: any[] = [];
  for (const m of flux.matchAll(inceput)) {
    let adanc = 0;
    let inSir = false;
    let j = m.index!;
    for (; j < flux.length; j++) {
      const c = flux[j];
      if (inSir) {
        if (c === '\\') j++;
        else if (c === '"') inSir = false;
      } else if (c === '"') inSir = true;
      else if (c === '{') adanc++;
      else if (c === '}' && --adanc === 0) break;
    }
    try { out.push(JSON.parse(flux.slice(m.index!, j + 1))); } catch { /* bucată ruptă — o sărim */ }
  }
  return out;
}

/** «moldova/balti» → «balti» */
const oras = (citySlug: string | undefined) => (citySlug || '').split('/').pop() || '';

const lei = (preturi: { currency?: string; amount?: string }[] | undefined): number | null => {
  const p = (preturi || []).find((x) => x.currency === 'MDL');
  const n = p ? Number(p.amount) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Rutele din pagina /schedule. */
export function parseOrar(html: string): RutarCursa[] {
  const rute = obiecte(fluxRsc(html), /\{"id":"[^"]+","name":"[^"]*","referenceCode"/g);
  const curse: RutarCursa[] = [];
  for (const r of rute) {
    if (!r?.from?.time || !r?.to?.cityName) continue;
    const de = r.from.cityName as string;
    const spre = r.to.cityName as string;
    curse.push({
      cheie: `${oras(r.from.citySlug)}>${oras(r.to.citySlug)} ${r.from.time}`,
      cod: String(r.referenceCode ?? ''),
      de, spre,
      ora: r.from.time,
      sosire: r.to.time,
      zile: Array.isArray(r.daysOfWeek) ? r.daysOfWeek : [],
      pret: lei(r.priceFrom),
      km: typeof r.distanceKm === 'number' ? r.distanceKm : null,
    });
  }
  return curse;
}

/** Cursele zilei dintr-o pagină de pereche: prețul pe tronson și cum se plătește. */
export function parsePereche(html: string): RutarPereche | null {
  const curse = obiecte(fluxRsc(html), /\{"id":"vt1_[^"]*","routeId"/g);
  if (!curse.length) return null;
  const preturi = curse.map((c) => lei(c.prices)).filter((x): x is number => x !== null);
  const c0 = curse[0];
  return {
    cheie: `${oras(c0.from?.citySlug)}>${oras(c0.to?.citySlug)}`,
    de: c0.from?.cityName ?? '',
    spre: c0.to?.cityName ?? '',
    curse: curse.length,
    pretMin: preturi.length ? Math.min(...preturi) : null,
    pretMax: preturi.length ? Math.max(...preturi) : null,
    laSofer: curse.some((c) => c.payOnBoard?.available === true || (c.paymentMethods || []).some((m: string) => m !== 'online')),
  };
}

/** Căile perechilor din sitemap, doar varianta română (fără /ru, /en): «/moldova-chisinau/moldova-orhei». */
export function caiPerechi(sitemapXml: string): string[] {
  const cai = new Set<string>();
  for (const m of sitemapXml.matchAll(/<loc>https:\/\/rutar\.md(\/[^<]*)<\/loc>/g)) {
    const segm = m[1].split('/').filter(Boolean);
    if (segm.length === 2 && !['ru', 'en', 'ro'].includes(segm[0])) cai.add(`/${segm.join('/')}`);
  }
  return [...cai].sort();
}

// ─── Diferența dintre două zile ───────────────────────────────────────────────────────────────────

/** Prețul nostru pe o pereche (lei) sau null dacă n-o avem. Cheia: «chisinau>balti». */
export type PretNostru = (cheie: string, de: string, spre: string) => number | null;

const ZILE = ['', 'L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const zileText = (z: number[]) => (z.length === 7 || !z.length ? 'zilnic' : z.map((d) => ZILE[d] ?? d).join(','));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pretText(p: RutarPereche | undefined, cursa?: RutarCursa): string {
  const min = p?.pretMin ?? cursa?.pret ?? null;
  const max = p?.pretMax ?? min;
  if (min === null) return 'preț necunoscut';
  const suma = max !== null && max !== min ? `${min}–${max} lei` : `${min} lei`;
  return p?.laSofer ? suma : `${suma} la achiziție online`;
}

function noiText(cheie: string, de: string, spre: string, pretNostru: PretNostru, pretLor: number | null): string {
  const noi = pretNostru(cheie, de, spre);
  if (noi === null) return 'noi nu avem perechea';
  if (pretLor === null) return `noi: ${noi} lei`;
  const dif = noi - pretLor;
  return `noi: ${noi} lei${dif > 0 ? ` (cu ${dif} mai scump)` : dif < 0 ? ` (cu ${-dif} mai ieftin)` : ''}`;
}

/** Ore scurte: «06:10, 06:39, … (+5)» */
function ore(curse: RutarCursa[], max = 8): string {
  const o = curse.map((c) => c.ora).sort();
  return o.length > max ? `${o.slice(0, max).join(', ')} … (+${o.length - max})` : o.join(', ');
}

/**
 * Ce s-a schimbat la Rutar de ieri: perechi noi / dispărute, curse noi / scoase, prețuri, zile, plata la șofer.
 * Întoarce rândurile mesajului (HTML Telegram), gol dacă nu e nimic nou.
 */
export function diferente(ieri: RutarStare, azi: RutarStare, pretNostru: PretNostru): string[] {
  const rand: string[] = [];
  const grupe = new Map<string, { noi: RutarCursa[]; scoase: RutarCursa[]; zile: string[] }>();
  const grupa = (c: RutarCursa) => {
    const k = c.cheie.split(' ')[0];
    if (!grupe.has(k)) grupe.set(k, { noi: [], scoase: [], zile: [] });
    return grupe.get(k)!;
  };
  for (const c of Object.values(azi.curse)) {
    const v = ieri.curse[c.cheie];
    if (!v) grupa(c).noi.push(c);
    else if (zileText(v.zile) !== zileText(c.zile)) grupa(c).zile.push(`${c.ora}: ${zileText(v.zile)} → ${zileText(c.zile)}`);
  }
  for (const c of Object.values(ieri.curse)) if (!azi.curse[c.cheie]) grupa(c).scoase.push(c);

  const perechiTot = new Set([...Object.keys(azi.perechi), ...Object.keys(ieri.perechi), ...grupe.keys()]);
  for (const k of [...perechiTot].sort()) {
    const pa = azi.perechi[k];
    const pi = ieri.perechi[k];
    const g = grupe.get(k);
    const oCursa = Object.values(azi.curse).find((c) => c.cheie.startsWith(`${k} `)) ?? g?.scoase[0];
    const de = pa?.de ?? pi?.de ?? oCursa?.de ?? k.split('>')[0];
    const spre = pa?.spre ?? pi?.spre ?? oCursa?.spre ?? k.split('>')[1];
    const titlu = `<b>${esc(de)} → ${esc(spre)}</b>`;
    const pretLor = pa?.pretMin ?? oCursa?.pret ?? null;
    const sub: string[] = [];

    const eraInainte = !!pi || Object.values(ieri.curse).some((c) => c.cheie.startsWith(`${k} `));
    const esteAcum = !!pa || Object.values(azi.curse).some((c) => c.cheie.startsWith(`${k} `));
    if (!eraInainte && esteAcum) {
      const toate = Object.values(azi.curse).filter((c) => c.cheie.startsWith(`${k} `));
      sub.push(`🆕 pereche nouă: ${toate.length ? `${toate.length} curse (${ore(toate)}), ` : ''}${pretText(pa, oCursa)}`);
    } else if (eraInainte && !esteAcum) {
      sub.push('❌ perechea a dispărut de pe site');
    } else {
      if (g?.noi.length) sub.push(`➕ ${g.noi.length} curse noi: ${ore(g.noi)}`);
      if (g?.scoase.length) sub.push(`➖ ${g.scoase.length} curse scoase: ${ore(g.scoase)}`);
      if (g?.zile.length) sub.push(`📅 zilele s-au schimbat: ${g.zile.join('; ')}`);
      if (pa && pi && (pa.pretMin !== pi.pretMin || pa.pretMax !== pi.pretMax)) {
        sub.push(`💰 preț ${pretText(pi)} → ${pretText(pa)}`);
      }
      if (pa && pi && pa.laSofer !== pi.laSofer) {
        sub.push(pa.laSofer ? '💵 acum se poate plăti și la șofer' : '💳 de acum doar online');
      }
    }
    if (!sub.length) continue;
    if (esteAcum) sub.push(`↔️ ${noiText(k, de, spre, pretNostru, pretLor)}`);
    rand.push([titlu, ...sub.map((s) => `  ${s}`)].join('\n'));
  }
  return rand;
}

/** Rezumatul ofertei de azi, pentru primul mesaj (fără zi de comparat). */
export function rezumat(azi: RutarStare, pretNostru: PretNostru): string[] {
  const perechi = new Map<string, RutarCursa[]>();
  for (const c of Object.values(azi.curse)) {
    const k = c.cheie.split(' ')[0];
    perechi.set(k, [...(perechi.get(k) ?? []), c]);
  }
  for (const k of Object.keys(azi.perechi)) if (!perechi.has(k)) perechi.set(k, []);
  return [...perechi.keys()].sort().map((k) => {
    const p = azi.perechi[k];
    const curse = perechi.get(k)!;
    const de = p?.de ?? curse[0]?.de ?? k;
    const spre = p?.spre ?? curse[0]?.spre ?? '';
    const n = curse.length || p?.curse || 0;
    const interval = curse.length ? ` (${curse.map((c) => c.ora).sort()[0]}–${curse.map((c) => c.ora).sort().at(-1)})` : '';
    const pretLor = p?.pretMin ?? curse[0]?.pret ?? null;
    return `<b>${esc(de)} → ${esc(spre)}</b>: ${n} curse${curse.length ? '' : ' azi'}${interval}, ${pretText(p, curse[0])} · ${noiText(k, de, spre, pretNostru, pretLor)}`;
  });
}
