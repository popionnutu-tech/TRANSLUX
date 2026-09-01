// Deciziile proaste ale dispecerului, găsite post-factum.
// Ion, 01.09: «машина с Бельц едет в Констанцу, а машина с Кишинёва едет в
// Бердичев на загрузку — программа лично отправляет мне оповещение».
//
// Cazul e o ÎNCRUCIȘARE: două curse pornesc în aceeași zi, iar dacă schimbi
// camioanele între ele, drumul gol până la încărcare scade. Nu e o părere despre
// dispecer — e o diferență de kilometri, măsurabilă înainte ca cineva să plece.
//
// Funcții pure, fără I/O: primesc cursele cu coordonate, întorc încrucișările.
import { haversineKm } from './camioane';

export type CursaDeAnalizat = {
  id: string;
  vehicleId: string;
  plate: string;
  /** De unde pleacă efectiv camionul: ultima poziție GPS sau baza lui. */
  plecare: { lat: number; lng: number } | null;
  /** Punctul de încărcare al cursei. */
  incarcare: { lat: number; lng: number } | null;
  incarcareNume: string;
  loadPlannedAt: string;
  /** Tipul camionului: o cisternă nu se schimbă cu un zernovoz. */
  fleetType: string | null;
  /** Șoferul cursei — cel mai frecvent motiv legitim al unei atribuiri «greșite». */
  sofer: string | null;
};

export type Incrucisare = {
  a: { cursaId: string; plate: string; spre: string; km: number; sofer: string | null };
  b: { cursaId: string; plate: string; spre: string; km: number; sofer: string | null };
  /** Câți km goi s-ar fi economisit dacă cele două camioane se schimbau între ele. */
  kmEconomisiti: number;
  /** Cel puțin unul dintre camioane n-are tipul stabilit — schimbul poate fi imposibil. */
  tipNesigur: boolean;
};

/** Sub atâția km diferența e zgomot: drumuri, vamă, ordinea încărcării. */
const PRAG_KM = 100;
/** Și în procente, ca să nu alerteze la 100 km dintr-un total de 2000. */
const PRAG_PROCENT = 0.15;

const km = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): number | null =>
  a && b ? haversineKm(a, b) : null;

/**
 * Perechile de curse care ar fi trebuit schimbate între ele.
 * Se compară doar curse din aceeași zi și de același tip de camion — altfel
 * «economia» ar fi o poveste, nu o alternativă pe care dispecerul o avea.
 */
export function incrucisari(curse: CursaDeAnalizat[]): Incrucisare[] {
  const out: Incrucisare[] = [];

  for (let i = 0; i < curse.length; i++) {
    for (let j = i + 1; j < curse.length; j++) {
      const a = curse[i];
      const b = curse[j];
      if (a.vehicleId === b.vehicleId) continue;
      // Camioane de tipuri diferite nu se pot schimba între ele.
      if (a.fleetType && b.fleetType && a.fleetType !== b.fleetType) continue;

      const aa = km(a.plecare, a.incarcare);
      const bb = km(b.plecare, b.incarcare);
      const ab = km(a.plecare, b.incarcare);
      const ba = km(b.plecare, a.incarcare);
      if (aa === null || bb === null || ab === null || ba === null) continue;

      const acum = aa + bb;
      const schimbat = ab + ba;
      const economie = acum - schimbat;
      if (economie < PRAG_KM) continue;
      if (acum <= 0 || economie / acum < PRAG_PROCENT) continue;

      out.push({
        a: { cursaId: a.id, plate: a.plate, spre: a.incarcareNume, km: Math.round(aa), sofer: a.sofer },
        b: { cursaId: b.id, plate: b.plate, spre: b.incarcareNume, km: Math.round(bb), sofer: b.sofer },
        kmEconomisiti: Math.round(economie),
        // Tipul lipsă nu oprește alerta — profilul flotei e încă gol —, dar se
        // spune în mesaj: altfel Ion ar primi «schimbă-le» pentru o cisternă și
        // un zernovoz, iar schimbul e imposibil.
        tipNesigur: !a.fleetType || !b.fleetType,
      });
    }
  }

  // Împerechere, nu listă de posibilități: o cursă intră într-o SINGURĂ pereche.
  // Fără asta, cinci camioane spre sud și cinci spre nord dădeau 25 de perechi
  // care se exclud reciproc, iar totalul de km «economisibili» era de câteva ori
  // mai mare decât realitatea (audit business, 01.09).
  const folosite = new Set<string>();
  const alese: Incrucisare[] = [];
  for (const p of out.sort((x, y) => y.kmEconomisiti - x.kmEconomisiti)) {
    if (folosite.has(p.a.cursaId) || folosite.has(p.b.cursaId)) continue;
    folosite.add(p.a.cursaId);
    folosite.add(p.b.cursaId);
    alese.push(p);
  }
  return alese;
}

/** Textul mesajului către Ion. Scurt: plăcuță, unde a fost trimis, cât costă. */
export function mesajIncrucisare(zi: string, lista: Incrucisare[]): string {
  if (lista.length === 0) return '';
  const cine = (s: string | null) => (s ? ` (${s})` : '');
  const randuri = lista.slice(0, 5).map((x) =>
    `• ${x.a.plate}${cine(x.a.sofer)} → ${x.a.spre} (${x.a.km} km)\n`
    + `  ${x.b.plate}${cine(x.b.sofer)} → ${x.b.spre} (${x.b.km} km)\n`
    + `  schimbate între ele: −${x.kmEconomisiti} km goi`
    + (x.tipNesigur ? '\n  (tipul unui camion nu e stabilit — verifică dacă schimbul era posibil)' : ''));
  const coada = lista.length > 5 ? `\n… și încă ${lista.length - 5}` : '';
  // Distanțele sunt în linie dreaptă. Spus explicit: «−167 km» s-ar citi altfel ca
  // kilometri de drum, iar vămile schimbă raportul (audit business, 01.09).
  return `Camioane trimise încrucișat, ${zi}\n\n${randuri.join('\n')}${coada}`
    + '\n\nDistanțele sunt în linie dreaptă, de la ultima oprire dinaintea încărcării.'
    + ' Dacă șoferul sau drumul de întoarcere explică atribuirea, ignoră.';
}
