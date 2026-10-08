// Echipajul pe biletul online (migr. 538; Ion, 08.10.2026: «Pe bilet cum apare număr mașină și șofer final — să se
// trimită în chat actualizat la client»; final = la bifa dispecerului; număr + prenume + telefon). Reguli PURE, fără
// bază și fără importuri de server (testate în echipaj-reguli.test.ts). Planul: docs/plans/2026-10-08-echipaj-pe-bilet.md.

export interface RandAtribuire {
  crm_route_id: number; driver_id: string; vehicle_id: string | null;
  vehicle_id_retur?: string | null; driver_id_retur?: string | null; retur_route_id?: number | null;
  auto_copied?: boolean | null;
}

/**
 * Rândul din graficul zilei care dă echipajul cursei — ACEEAȘI regulă ca buildTurAssignmentMap / buildReturAssignmentMap
 * (packages/db/src/assignments.ts; mini app-ul șoferului și botul o folosesc): tur = primul rând al rutei; retur = ultimul
 * rând cu retur_route_id spre rută (override), altfel primul rând al rutei fără retur_route_id. Întoarce și rândul, ca
 * să se vadă dacă e copia automată de la 20:00 (auto_copied).
 */
export function randulEchipajului(randuri: RandAtribuire[], ruta: number, goingNorth: boolean):
  { rand: RandAtribuire; driver_id: string; vehicle_id: string | null } | null {
  if (!goingNorth) {
    const r = randuri.find((a) => a.crm_route_id === ruta);
    return r ? { rand: r, driver_id: r.driver_id, vehicle_id: r.vehicle_id } : null;
  }
  let over: RandAtribuire | null = null;
  for (const a of randuri) if (a.retur_route_id === ruta) over = a; // ca map.set: ultimul câștigă
  const r = over ?? randuri.find((a) => a.crm_route_id === ruta && !a.retur_route_id) ?? null;
  return r ? { rand: r, driver_id: r.driver_id_retur ?? r.driver_id, vehicle_id: r.vehicle_id_retur ?? r.vehicle_id } : null;
}

/** «651AKD» → «651 AKD» (ca site-assistant/cards.ts fmtPlate). */
export function placaFormatata(raw: string | null | undefined): string | null {
  const p = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return null;
  const m = p.match(/^(\d{3})([A-Z]{3})$/) ?? p.match(/^([A-Z]{3})(\d{3})$/);
  return m ? `${m[1]} ${m[2]}` : p;
}

/** «069123456» / «37369123456» → «+373 69 123 456» (Ion, 23.09: mereu +373); altfel null. */
export function telefonPublic(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  const n = /^373\d{8}$/.test(d) ? d.slice(3) : /^0\d{8}$/.test(d) ? d.slice(1) : /^\d{8}$/.test(d) ? d : null;
  return n ? `+373 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : null;
}

export type EchipajCursa =
  | { stare: 'astept' }
  | { stare: 'anulat' }
  | { stare: 'gata'; placa: string; prenume: string | null; telefon: string | null; vehicle_id: string; driver_id: string; proba?: boolean };

/** Echipajul fix al probei fizice (migr. 532): șoferul de probă, fără telefon — nu se citește graficul real. */
export const ECHIPAJ_PROBA: EchipajCursa = { stare: 'gata', placa: 'PROBĂ', prenume: 'Iurie', telefon: null, vehicle_id: 'proba', driver_id: 'proba', proba: true };

/**
 * Echipajul unei curse din graficul zilei: fără bifa dispecerului → astept; ruta anulată în ziua aceea → anulat; rândul
 * care dă echipajul e copia automată (auto_copied) → astept (copia nu e graficul dispecerului); fără mașină → astept.
 */
export function echipajDinGrafic(a: {
  bifat: boolean; anulata: boolean; randuri: RandAtribuire[]; ruta: number; goingNorth: boolean;
  soferi: Map<string, { full_name: string | null; phone: string | null }>; masini: Map<string, { plate_number: string | null }>;
}): EchipajCursa {
  if (!a.bifat) return { stare: 'astept' };
  if (a.anulata) return { stare: 'anulat' };
  const r = randulEchipajului(a.randuri, a.ruta, a.goingNorth);
  if (!r || r.rand.auto_copied === true || !r.vehicle_id) return { stare: 'astept' };
  const placa = placaFormatata(a.masini.get(r.vehicle_id)?.plate_number);
  if (!placa) return { stare: 'astept' };
  const s = a.soferi.get(r.driver_id);
  return { stare: 'gata', placa, prenume: prenumeSofer(s?.full_name), telefon: telefonPublic(s?.phone), vehicle_id: r.vehicle_id, driver_id: r.driver_id };
}

const INITIALA = /^\p{Lu}\.?$/u;
/** Prenumele = al doilea cuvânt plin din «Nume Prenume» (ca lib/driver-name.ts driverFirstName); inițialele nu-s nume. */
export function prenumeSofer(fullName: string | null | undefined): string | null {
  const cuv = String(fullName ?? '').trim().split(/\s+/).filter(Boolean).filter((t) => !INITIALA.test(t));
  return cuv.length >= 2 ? cuv[1] : null;
}

/** Telefonul șoferului se arată doar de la plecare − 3 h până la plecare + 3 h (revizia de securitate #3). */
export const FEREASTRA_TELEFON_MS = 3 * 3_600_000;
export function inFereastraTelefon(departureAt: string, nowMs: number): boolean {
  const t = Date.parse(departureAt);
  return Number.isFinite(t) && nowMs >= t - FEREASTRA_TELEFON_MS && nowMs <= t + FEREASTRA_TELEFON_MS;
}

/** Forma de pe bilet (pagina, mini app-ul): telefonul doar în fereastră. */
export interface EchipajBilet { stare: 'astept' | 'anulat' | 'gata'; placa: string | null; sofer: string | null; telefon: string | null }
export function echipajPentruBilet(e: EchipajCursa, departureAt: string, nowMs: number): EchipajBilet {
  if (e.stare !== 'gata') return { stare: e.stare, placa: null, sofer: null, telefon: null };
  return { stare: 'gata', placa: e.placa, sofer: e.prenume, telefon: inFereastraTelefon(departureAt, nowMs) ? e.telefon : null };
}

/** Cheia mesajului: ce i s-a spus clientului. Telefonul intră în cheie doar dacă îl poate primi (cont verificat, fereastră). */
export function cheieEchipaj(e: EchipajCursa, cuTelefon: boolean): string {
  if (e.stare !== 'gata') return e.stare;
  return `${e.vehicle_id}|${e.driver_id}|${cuTelefon && e.telefon ? 'tel' : '-'}`;
}

export type FelMesaj = 'prima' | 'schimbare' | 'telefon' | 'retras';

/**
 * Ce mesaj pleacă (sau nimic): `gata` nou → prima / schimbare (mașină sau șofer altele) / telefon (doar a intrat
 * telefonul); `anulat`/`astept` după ce s-a spus deja un echipaj → retras. Schimbările se opresc după 3 mesaje; noaptea
 * (22:00–07:00 Chișinău) nu pleacă nimic pentru cursele care nu sunt în următoarele 12 h.
 */
export function deTrimis(a: { trimis: string | null; nou: string; mesaje: number; oraChisinau: number; pleacaInMs: number }): FelMesaj | null {
  if (a.nou === a.trimis) return null;
  const noapte = a.oraChisinau >= 22 || a.oraChisinau < 7;
  if (noapte && a.pleacaInMs > 12 * 3_600_000) return null;
  const aFostGata = Boolean(a.trimis && a.trimis.includes('|'));
  if (a.nou === 'astept') return aFostGata ? (a.mesaje < 4 ? 'retras' : null) : null;
  if (a.nou === 'anulat') return a.mesaje < 4 ? 'retras' : null;
  if (!aFostGata) return 'prima';
  const [v0, d0] = String(a.trimis).split('|');
  const [v1, d1] = a.nou.split('|');
  if (v0 === v1 && d0 === d1) return 'telefon';
  return a.mesaje < 3 ? 'schimbare' : null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mesajul din chat (Telegram, HTML; fiecare câmp scăpat). */
export function mesajEchipaj(a: {
  lang: 'ro' | 'ru'; fel: FelMesaj; from: string; to: string; plecare: string; e: EchipajCursa; cuTelefon: boolean;
}): string {
  const ru = a.lang === 'ru';
  const cursa = `${esc(a.from)} → ${esc(a.to)}, ${esc(a.plecare)}`;
  if (a.fel === 'retras') {
    if (a.e.stare === 'anulat') {
      return ru ? `⚠️ <b>Рейс ${cursa} отменён.</b>\nПозвоните диспетчеру: +373 60 401 010.`
        : `⚠️ <b>Cursa ${cursa} a fost anulată.</b>\nSună la dispecerat: +373 60 401 010.`;
    }
    return ru ? `ℹ️ Автобус для рейса ${cursa} ещё уточняется. Пришлём, как только диспетчер подтвердит.`
      : `ℹ️ Autobuzul pentru cursa ${cursa} se mai stabilește. Îți scriem imediat ce îl confirmă dispecerul.`;
  }
  if (a.e.stare !== 'gata') return '';
  const sofer = a.e.prenume ? (ru ? ` · водитель ${esc(a.e.prenume)}` : ` · șofer ${esc(a.e.prenume)}`) : '';
  const tel = a.cuTelefon && a.e.telefon ? `\n📞 ${esc(a.e.telefon)}` : '';
  const echipaj = `<b>${esc(a.e.placa)}</b>${sofer}${tel}`;
  if (a.fel === 'schimbare') return ru ? `🔄 <b>Сменился автобус</b> для рейса ${cursa}:\n🚌 ${echipaj}` : `🔄 <b>S-a schimbat autobuzul</b> pentru cursa ${cursa}:\n🚌 ${echipaj}`;
  if (a.fel === 'telefon') return ru ? `📞 Телефон водителя рейса ${cursa}: ${esc(a.e.telefon ?? '')}` : `📞 Telefonul șoferului pentru cursa ${cursa}: ${esc(a.e.telefon ?? '')}`;
  return ru ? `🚌 <b>Ваш автобус</b> на рейс ${cursa}:\n${echipaj}` : `🚌 <b>Autobuzul tău</b> pentru cursa ${cursa}:\n${echipaj}`;
}

export type RezultatTelegram = 'trimis' | 'blocat' | 'temporar' | 'incert';

/** Clasa răspunsului Telegram (critica C1): DOAR blocarea sigură oprește trimiterile pentru totdeauna. */
export function clasaRaspuns(status: number | null, descriere: string | null | undefined, timeout: boolean): RezultatTelegram {
  if (timeout) return 'incert';
  if (status === 200) return 'trimis';
  const d = String(descriere ?? '').toLowerCase();
  if (status === 403 && (d.includes('bot was blocked by the user') || d.includes('user is deactivated'))) return 'blocat';
  if (status === 400 && d.includes('chat not found')) return 'blocat';
  return 'temporar';
}
