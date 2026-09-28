// «Ziua ideală» a mașinii Drăxlmaier (ION-123, 28.09.2026; cererea lui Ion: «ideal ar fi 15–17 km × 6 drumuri … minus km total se primește economie»).
// Ideal = cursele cu oameni și munca (km GPS) + drumul direct între curse (mediana GPS observată, altfel Valhalla × 1,05) + noaptea la capăt;
// economie = km făcuți − ideal, pe cauze: noaptea departe de capăt (și cea de weekend — Ion 28.09: «count in total»), acasă între curse, drum mai lung
// decât cel direct. Nopțile în Bălți și mașinile cu posibilă cursă nedetectată sunt separat. Cifrele vin din rândul săptămânii (date.ziIdeala, VPS: drax/cod/saptamanal/{ziua-ideala,
// scrie-ziua-ideala}.mjs), după dezbaterea Claude + Codex (r3 10/10). Aici doar textul, funcții pure.

export interface CauzeZiIdeala { noapte: number; acasa: number; drumLung: number; drumMaiScurt: number }
export interface IntervalZiIdeala { ora: string; km: number; obl: number; munca: number; leg: number; src: string; ocol: number; economie: number; intreUzine: string | null }
export interface ZiIdealaZi {
  z: string; gps: number; ideal: number; economie: number; cuOameni: number; obligatorii: number; legaturi: number; noapteIdeala: number;
  cauze: CauzeZiIdeala; separat: { weekend?: number; balti: number; pauza: number }; steaguri: string[];
  intervale: IntervalZiIdeala[]; jumatati: { part: string; noapte: string; cat: string; real: number; economie: number }[];
}
export interface ZiIdealaMasina {
  m: string; separat: boolean; zileLV: number; zileMasurate: number; kmSapt: number; peZi: number; pestePrag: boolean; cauze: CauzeZiIdeala;
  separatKm: Partial<Record<'weekend' | 'balti' | 'pauza', { economie: number; maiScurt: number }>>; zile: ZiIdealaZi[];
}
export interface ZiIdealaDrax {
  versiune: string; rulat: string;
  flota: { zile: number; gps: number; ideal: number; economie: number; extrapolat: number; cauze: CauzeZiIdeala;
    separat: Partial<Record<'weekend' | 'balti' | 'pauza', { economie: number; maiScurt: number }>> };
  separatMasini: { masini: string[]; economie: number; motiv: string };
  legaturi: { perechi: number; gps: number; valhalla: number }; prag: number;
  zileSubMinus5: { m: string; z: string; e: number }[];
  masini: ZiIdealaMasina[];
}

const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');
const ZILE_S = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
export const ziScurtZi = (z: string) => { const t = new Date(`${z}T12:00:00Z`); return `${ZILE_S[t.getUTCDay()]} ${t.getUTCDate()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };

/** cauzele unei zile / mașini, doar cele ≥ 0,5 km: «noapte 37, acasă 72» */
export function textCauze(c: CauzeZiIdeala): string {
  const p = [c.noapte >= 0.5 ? `noapte ${nr(c.noapte)}` : '', c.acasa >= 0.5 ? `acasă ${nr(c.acasa)}` : '', c.drumLung >= 0.5 ? `drum mai lung ${nr(c.drumLung)}` : '',
    c.drumMaiScurt <= -0.5 ? `mai scurt decât idealul ${nr(c.drumMaiScurt)}` : ''].filter(Boolean);
  return p.join(', ') || '—';
}

/** o zi: «mar 15.09 · făcut 238 km · ideal 129 · economie 109 (noapte 37, acasă 72)» */
export function textZiIdeala(d: ZiIdealaZi): string {
  const we = d.separat.weekend ?? 0, s = we + d.separat.balti + d.separat.pauza;
  const sep = s >= 0.5 ? ` · separat ${nr(s)} (${we >= 0.5 ? 'weekend' : d.separat.balti >= 0.5 ? 'Bălți' : 'pauză'})` : '';
  return `${ziScurtZi(d.z)} · făcut ${nr(d.gps)} km · ideal ${nr(d.ideal)} · economie ${nr(d.economie)} (${textCauze(d.cauze)})${sep}`;
}

/** un drum între curse: «06:07–14:08 · făcut 60 km · ideal 23 (muncă 4 + drum direct 19, estimat pe hartă) · economie 37» */
export function textIntervalIdeal(i: IntervalZiIdeala): string {
  const parti = [i.munca >= 0.5 ? `muncă ${nr(i.munca)}` : '', i.obl - i.munca >= 0.5 ? `lângă uzină ${nr(i.obl - i.munca)}` : '',
    i.leg >= 0.5 ? `drum direct ${nr(i.leg)}${i.src === 'valhalla' ? ', estimat pe hartă' : ''}` : ''].filter(Boolean);
  const ideal = i.obl + i.leg;
  return `${i.ora} · făcut ${nr(i.km)} km · ideal ${nr(ideal)}${parti.length ? ` (${parti.join(' + ')})` : ''} · economie ${nr(i.economie)}`;
}

/** mașinile măsurate, după economia pe săptămână; cele separate la coadă */
export function randuriZiIdeala(z: ZiIdealaDrax): ZiIdealaMasina[] {
  return z.masini.filter((m) => m.zileMasurate > 0 || m.separat).sort((a, b) => Number(a.separat) - Number(b.separat) || b.kmSapt - a.kmSapt);
}
