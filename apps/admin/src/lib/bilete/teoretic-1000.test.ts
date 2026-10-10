import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// «1000 de testări teoretice ca tot lucrează» (Ion, 10.10.2026): scenarii GENERATE cu un seed fix (reproductibil) pe
// regulile biletelor online de azi — prețul fix Bălți ⇄ Chișinău pe sens și dată, tur-retur −20% într-o plată, studentul
// −20% (fără cumul), returul doar împreună cu turul, cotele 4/2 și plafoanele (pachetul = o comandă), anularea și suma
// returnată, telefonul străin. Valorile AȘTEPTATE se scot din regulile scrise de Ion (docs/plans/2026-10-10-promotii-
// balti.md, 2026-10-10-tur-retur-ux-simplu.md, comentariile migrațiilor 546–551), nu din implementare. Regulile care
// trăiesc doar în SQL sunt portate aici (secțiunile «port SQL»), iar textul migrațiilor e comparat static cu TS-ul.
// Testele marcate `.fails` documentează o nepotrivire găsită (nu se repară codul aici) — vezi comentariul fiecăruia.

const fake = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (_q: { table: string; f: Record<string, unknown> }, _mode: 'single' | 'maybe' | 'list'): any => ({ data: null, error: null }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (_name: string, _args: Record<string, unknown>): any => ({ data: null, error: null }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jeton: (_j: string): any => null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => {
  class Q {
    f: Record<string, unknown> = {};
    constructor(public table: string) {}
    select() { return this; }
    eq(k: string, v: unknown) { this.f[k] = v; return this; }
    in(k: string, v: unknown) { this.f[`in:${k}`] = v; return this; }
    is(k: string, v: unknown) { this.f[`is:${k}`] = v; return this; }
    or() { return this; }
    limit() { return this; }
    order() { return this; }
    update() { this.f.__update = true; return this; }
    insert() { return Promise.resolve({ data: null, error: null }); }
    maybeSingle() { return Promise.resolve(fake.resolve(this, 'maybe')); }
    single() { return Promise.resolve(fake.resolve(this, 'single')); }
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(fake.resolve(this, 'list')).then(res, rej); }
  }
  return { getSupabase: () => ({ from: (t: string) => new Q(t), rpc: async (n: string, a: Record<string, unknown>) => fake.rpc(n, a) }) };
});
vi.mock('./student-ai', () => ({ verificareDupaJeton: async (j: string) => fake.jeton(j), hashJeton: (j: string) => j }));
vi.mock('@/lib/maib/refund', () => ({ elibereazaRefund: vi.fn(), executaRefund: vi.fn(), revendicaRefund: vi.fn() }));
vi.mock('./comenzi', () => ({
  ComandaError: class ComandaError extends Error {
    constructor(public readonly cod: string, mesaj: string) { super(mesaj); this.name = 'ComandaError'; }
  },
}));

import {
  alegeReducerea, aplicaReducere, baltiChisinauFixedPrice, calculeazaCurse, cheieNume, cotaOnline, decizieCarnet,
  formateazaTelefonPasager, normalizeazaTelefonPasager, perechePromo, resolveOfferPriceForDate, returValid,
  verificaPlafonLocalitati, DURATA_COMANDA_DESCHISA_MS, PROMO_PRET_MINIM, SUMA_MINIMA_PLATA_MDL,
  type ComandaPentruPlafon, type DateCurse, type ExtrasCarnet, type ReturCerut, type TurPentruRetur,
} from '@translux/db';
import { calculeazaPromo, cotaCursei, localitateNeinceputa, type PromoConfig } from './promo-server';
import { noimiRestituire, sumaRestituire } from './refund-reguli';
import { anuleazaSiReturneaza } from './refund';
// Regulile pure ale site-ului (apps/web) — importate direct, depind doar de @translux/db.
import { curseReturPotrivite, pasageriText, politicaChei, rezumatTurRetur } from '../../../../web/src/lib/tur-retur';
import { parseazaConfig, vanzareDeschisaPeSite } from '../../../../web/src/lib/bilete-reguli';

// ── Generatorul determinist ─────────────────────────────────────────────────────────────────────────────────────────
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20261010;
const rnd = prng(SEED);
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const bool = () => rnd() < 0.5;
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Offset-ul Chișinăului: ora de vară până duminică 25.10.2026 03:00, apoi +02:00 (regulă calendaristică, nu Intl). */
const offsetChisinau = (zi: string, ora: number) => (zi < '2026-10-25' || (zi === '2026-10-25' && ora < 3) ? '+03:00' : '+02:00');
const isoLocal = (zi: string, ora: number, min: number) => `${zi}T${pad(ora)}:${pad(min)}:00${offsetChisinau(zi, ora)}`;
/** Ziua săptămânii ISO (1 luni … 7 duminică) a unei date calendaristice. */
const isodowDe = (zi: string) => ((new Date(`${zi}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

// ── Referințele scoase din reguli (nu din implementare) ────────────────────────────────────────────────────────────
/**
 * Prețul redus ca în CHECK-ul 546 (`round(pret_intreg*(100-pct)/100.0)`, numeric Postgres = rotunjire «half away from
 * zero»), calculat EXACT pe bani întregi (BigInt), plus pragul minim al plății maib (10 lei, Anexa 1E).
 */
function redusRef(pret: number, pct: number): number | null {
  if (!(pct >= 1 && pct <= 50) || !(pret > 0)) return null;
  const bani = BigInt(Math.round(pret * 100));
  const num = bani * BigInt(100 - pct);          // în 1/10000 lei
  const lei = (2n * num + 10000n) / 20000n;      // floor(x + 0,5) pentru x > 0
  const r = Number(lei);
  return r >= 10 ? r : null;
}

const VARIANTE_BALTI = ['Bălți', 'Balti', 'BĂLȚI', 'Bălţi', ' bălți ', 'BALTI'];
const VARIANTE_CHISINAU = ['Chișinău', 'Chisinau', 'CHIȘINĂU', 'Chişinău', ' chisinau ', 'Chişinǎu'.replace('ǎ', 'ă')];

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// A. Prețul pe sens și pe dată
// Reguli: Bălți → Chișinău 150 lei fix din cursa de 02.10.2026 (ION-165); Chișinău → Bălți 150 lei fix din cursa de
// 10.10.2026 (Ion 10.10: «Bălți–Chișinău și Chișinău–Bălți prețul 150 lei pe site»); înainte — oferta pe tarif
// (133 km × rata − reducerea din rândul offers); altă pereche — nimic fix.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('A1. prețul fix Bălți ⇄ Chișinău pe dată și sens', () => {
  const cazuri: Array<{ n: string; de: string; spre: string; zi: string; astept: number | null }> = [];
  for (let z = 0; z < 70; z++) {
    const zi = addDays('2026-09-25', z);
    cazuri.push({ n: `B→C ${zi}`, de: pick(VARIANTE_BALTI), spre: pick(VARIANTE_CHISINAU), zi, astept: zi >= '2026-10-02' ? 150 : null });
    cazuri.push({ n: `C→B ${zi}`, de: pick(VARIANTE_CHISINAU), spre: pick(VARIANTE_BALTI), zi, astept: zi >= '2026-10-10' ? 150 : null });
  }
  for (let i = 0; i < 20; i++) {
    const zi = addDays('2026-10-01', int(0, 60));
    const [de, spre] = pick([['Edineț', 'Chișinău'], ['Chișinău', 'Briceni'], ['Bălți', 'Edineț'], ['Bălți', 'Bălți'], ['Chișinău', 'Chișinău']] as const);
    cazuri.push({ n: `${de}→${spre} ${zi}`, de, spre, zi, astept: null });
  }
  for (const [i, c] of cazuri.entries()) {
    it(`#${i} ${c.n} → ${c.astept ?? 'fără preț fix'}`, () => {
      expect(baltiChisinauFixedPrice(c.de, c.spre, c.zi)).toBe(c.astept);
    });
  }
});

describe('A2. prețul ofertei pe rata zilei (rândurile reale din offers, 10.10.2026)', () => {
  // SELECT offers (read-only, 10.10.2026): Bălți→Chișinău 156/136 (reducere 20), Chișinău→Bălți 157/150 (reducere 7).
  const BC = { from_locality: 'Bălți', to_locality: 'Chișinău', original_price: 156, offer_price: 136 };
  const CB = { from_locality: 'Chișinău', to_locality: 'Bălți', original_price: 157, offer_price: 150 };
  for (let i = 0; i < 120; i++) {
    const sensBC = bool();
    const offer = sensBC ? BC : CB;
    const rata = Math.round((0.9 + rnd() * 0.5) * 100) / 100;
    const zi = addDays('2026-09-28', int(0, 30));
    const gate = sensBC ? '2026-10-02' : '2026-10-10';
    const reducere = offer.original_price - offer.offer_price;
    const astept = zi >= gate ? 150 : Math.max(0, Math.round(133 * rata) - reducere);
    it(`#${i} ${sensBC ? 'B→C' : 'C→B'} ${zi} rata ${rata} → ${astept}`, () => {
      expect(resolveOfferPriceForDate(offer, rata, zi)).toBe(astept);
    });
  }
});

describe('A3. cursele zilei: toate au același preț al ofertei, tariful rămâne tăiat', () => {
  const baza: DateCurse = {
    fromStops: [{ crm_route_id: 11, stop_order: 10, hour_from_chisinau: '19:40', hour_from_nord: '06:10' }, { crm_route_id: 12, stop_order: 10, hour_from_chisinau: '20:10', hour_from_nord: '09:00' }],
    toStops: [{ crm_route_id: 11, stop_order: 200, hour_from_chisinau: '17:30', hour_from_nord: '08:20' }, { crm_route_id: 12, stop_order: 200, hour_from_chisinau: '18:00', hour_from_nord: '11:10' }],
    matchingRouteIds: [11, 12],
    routes: [
      { id: 11, dest_to_ro: 'Chișinău - Bălți', dest_to_ru: 'Кишинёв - Бельцы', dest_from_ro: 'Bălți - Chișinău', dest_from_ru: 'Бельцы - Кишинёв', time_chisinau: '17:30 - 19:40', time_nord: '06:10 - 08:20', tariff_id_tur: 1, tariff_id_retur: 2, retur_ascuns: false, tur_ascuns: false },
      { id: 12, dest_to_ro: 'Chișinău - Bălți', dest_to_ru: 'Кишинёв - Бельцы', dest_from_ro: 'Bălți - Chișinău', dest_from_ru: 'Бельцы - Кишинёв', time_chisinau: '18:00 - 20:10', time_nord: '09:00 - 11:10', tariff_id_tur: 1, tariff_id_retur: 2, retur_ascuns: false, tur_ascuns: false },
    ],
    kmPairs: [
      { tariff_id: 1, km: 133, from_district: 'balti', to_district: null, start_district: 'balti' },
      { tariff_id: 2, km: 134, from_district: null, to_district: 'balti', start_district: 'balti' },
    ],
    rates: { rateLong: 1.17, rateSub: 1.29 },
    offer: { from_locality: 'Bălți', to_locality: 'Chișinău', original_price: 156, offer_price: 136 },
  };
  for (let i = 0; i < 40; i++) {
    const zi = addDays('2026-09-28', int(0, 40));
    const rata = Math.round((1 + rnd() * 0.3) * 100) / 100;
    const astept = zi >= '2026-10-02' ? 150 : Math.round(133 * rata) - 20;
    it(`#${i} ${zi} rata ${rata}: fiecare cursă ${astept} lei, prețul tarifului e originalul`, () => {
      const curse = calculeazaCurse({ ...baza, rates: { rateLong: rata, rateSub: 1.29 } }, zi);
      expect(curse.length).toBeGreaterThan(0);
      for (const c of curse) {
        expect(c.price).toBe(astept);
        expect(c.originalPrice).toBeGreaterThan(0);
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B. Reducerea −20% și tur-returul într-o plată
// Reguli: prețul redus pe loc = round(preț × (100 − pct)/100), pe întregi, ca CHECK-ul 546; sub 10 lei fără reducere
// (minimul maib, nu «se fixează» la 10); tur-retur = turul la preț întreg + returul redus, × pasageri, O plată;
// turul nu e niciodată redus.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('B1. aplicaReducere = formula CHECK-ului 546 calculată exact + pragul de 10 lei', () => {
  const cazuri: Array<[number, number]> = [];
  for (let i = 0; i < 160; i++) cazuri.push([int(1, 400), 20]);
  for (let i = 0; i < 90; i++) cazuri.push([int(1, 400), int(1, 50)]);
  for (const p of [0, 51, -5, 100, 0.5]) cazuri.push([int(10, 300), p]);
  for (let i = 0; i < 60; i++) cazuri.push([Math.round(int(1000, 30000)) / 100, int(1, 50)]); // prețuri cu bani
  for (const [pret, pct] of [[150, 20], [156, 20], [157, 20], [12, 20], [13, 20], [11, 20], [62.5, 20], [0, 20], [-150, 20]] as const) cazuri.push([pret, pct]);
  for (const [i, [pret, pct]] of cazuri.entries()) {
    const astept = redusRef(pret, pct);
    it(`#${i} ${pret} lei −${pct}% → ${astept ?? 'fără reducere'}`, () => {
      expect(aplicaReducere(pret, pct)).toBe(astept);
    });
  }
});

describe('B2. rezumatul tur-retur (o plată): tur întreg + retur redus pe loc, × pasageri', () => {
  const cazuri: Array<{ pretTur: number; pretRetur: number; pasageri: number; pct: number }> = [];
  for (let n = 1; n <= 4; n++) cazuri.push({ pretTur: 150, pretRetur: 150, pasageri: n, pct: 20 }); // canonicul: 270 × n
  for (let i = 0; i < 200; i++) {
    cazuri.push({ pretTur: pick([150, int(10, 300)]), pretRetur: pick([150, int(8, 300)]), pasageri: int(1, 4), pct: pick([20, 20, 15, 25, int(1, 50)]) });
  }
  for (const [i, c] of cazuri.entries()) {
    const loc = redusRef(c.pretRetur, c.pct);
    it(`#${i} tur ${c.pretTur} + retur ${c.pretRetur} −${c.pct}% × ${c.pasageri}`, () => {
      const r = rezumatTurRetur(c);
      expect(r.tur).toBe(c.pretTur * c.pasageri);                 // turul nu se reduce
      expect(r.pretRetur).toBe(loc);
      expect(r.retur).toBe(loc == null ? 0 : loc * c.pasageri);   // rotunjirea pe LOC, apoi × pasageri
      expect(r.total).toBe(r.tur + r.retur);
      if (c.pretTur === 150 && c.pretRetur === 150 && c.pct === 20) expect(r.total).toBe(270 * c.pasageri);
      if (loc != null) {
        // reducerea pe loc nu depășește pct% + jumătate de leu (rotunjirea), nu e niciodată negativă
        expect(c.pretRetur - loc).toBeGreaterThanOrEqual(0);
        expect(Math.abs((c.pretRetur - loc) - (c.pretRetur * c.pct) / 100)).toBeLessThanOrEqual(0.5);
        // suma pe care o cere banca = Σ total al rândurilor (CHECK total = price_per_seat × seats pe fiecare)
        expect(r.total).toBe(c.pretTur * c.pasageri + loc * c.pasageri);
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// C. Reducerile nu se cumulează; studentul doar 1 loc; șoferul fără promoții (calculeazaPromo cu baza falsă)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('C1. alegeReducerea: niciodată două', () => {
  for (const s of [true, false]) for (const r of [true, false]) {
    it(`student=${s} retur=${r}`, () => {
      const t = alegeReducerea({ student: s, retur: r });
      expect(t).toBe(s ? 'student' : r ? 'retur' : null);
    });
  }
});

describe('C2. calculeazaPromo: combinații generate (mod, pereche, steag, cod de retur, jeton, locuri, șofer, preț)', () => {
  const ACUM = Date.now();
  const cfg = (activ: boolean): PromoConfig => ({ activ, pct: 20, returZile: 30, returMin: 30, cotaDupaOra: 12, cotaSeara: 2, localitatiDeLa: new Map([['balti', '2026-10-13']]) });
  type Jeton = 'fara' | 'valid' | 'expirat' | 'alt_telefon' | 'alt_nume';
  type Cod = 'fara' | 'stricat' | 'necunoscut' | 'valid' | 'aceeasi_ruta' | 'vechi';
  const COD_HEX = (c: string) => c.repeat(64).slice(0, 64);
  interface Caz { mod: 'public' | 'test_admin' | 'proba'; pereche: boolean; activ: boolean; seats: number; pret: number; jeton: Jeton; cod: Cod; sofer: boolean }
  const cazuri: Caz[] = [];
  for (let i = 0; i < 320; i++) {
    cazuri.push({
      mod: pick(['public', 'public', 'public', 'test_admin', 'proba'] as const), pereche: rnd() < 0.85, activ: rnd() < 0.85,
      seats: pick([1, 1, 1, 2, 3, 4]), pret: pick([150, 150, 156, int(8, 40), int(100, 300)]),
      jeton: pick(['fara', 'fara', 'valid', 'valid', 'expirat', 'alt_telefon', 'alt_nume'] as const),
      cod: pick(['fara', 'fara', 'valid', 'valid', 'stricat', 'necunoscut', 'aceeasi_ruta', 'vechi'] as const), sofer: rnd() < 0.15,
    });
  }
  const PHONE = '37369111222', NUME = 'Popescu Ion';
  for (const [i, c] of cazuri.entries()) {
    // Așteptarea, din reguli: …
    const cerut = c.jeton !== 'fara' || c.cod !== 'fara';
    const studentOk = c.jeton === 'valid' && c.seats === 1;
    // returul −20%: tur plătit acum ≤ 30 min, aceeași persoană, sens opus, altă rută; tur.test (false) = retur.test → doar `public`
    const returOk = c.cod === 'valid' && c.mod === 'public';
    let astTip: 'student' | 'retur' | null = null;
    if (c.mod !== 'proba' && c.pereche && c.activ && cerut) {
      astTip = studentOk ? 'student' : returOk ? 'retur' : null;      // studentul are prioritate, fără cumul
      if (astTip && c.sofer) astTip = null;                          // telefonul unui șofer: nicio promoție
      if (astTip && redusRef(c.pret, 20) == null) astTip = null;     // sub 10 lei: fără reducere
    }
    it(`#${i} ${JSON.stringify(c)} → ${astTip ?? 'preț întreg'}`, async () => {
      const urcare = c.pereche ? 'Chișinău' : 'Edineț', coborare = c.pereche ? 'Bălți' : 'Chișinău';
      const tur = {
        id: 'tur-1', status: 'platita', test: false, proba_fizica: false, promo_pereche: true, comanda_tur_id: null, reducere_tip: null,
        phone: PHONE, passenger_name: 'Ion Popescu', going_north: false, crm_route_id: c.cod === 'aceeasi_ruta' ? 9 : 7,
        trip_date: '2026-10-14', departure_at: '2026-10-14T06:00:00+03:00', seats: 4, from_name: 'Bălți', to_name: 'Chișinău',
        paid_at: new Date(ACUM - (c.cod === 'vechi' ? 45 : 5) * 60_000).toISOString(),
      };
      fake.resolve = (q, mode) => {
        if (q.table === 'bilete_comenzi' && mode === 'maybe') return { data: q.f.cod_retur === COD_HEX('a') ? tur : null, error: null };
        if (q.table === 'drivers') return { data: c.sofer && q.f.phone === PHONE ? [{ id: 'd' }] : [], error: null };
        return { data: null, error: null };
      };
      fake.jeton = () => c.jeton === 'valid' ? { id: 'v1', telefon: PHONE, nume_pasager_cheie: cheieNume(NUME) }
        : c.jeton === 'alt_telefon' ? { id: 'v1', telefon: '37369000000', nume_pasager_cheie: cheieNume(NUME) }
        : c.jeton === 'alt_nume' ? { id: 'v1', telefon: PHONE, nume_pasager_cheie: cheieNume('Altcineva Vasile') } : null;
      const r = await calculeazaPromo({
        mod: c.mod, test: c.mod !== 'public', phone: PHONE, passengerName: NUME, urcare, coborare, goingNorth: true, crmRouteId: 9,
        tripDate: '2026-10-16', departureAt: '2026-10-16T17:00:00+03:00', seats: c.seats, pret: c.pret,
        codRetur: c.cod === 'fara' ? null : c.cod === 'stricat' ? 'xyz' : c.cod === 'necunoscut' ? COD_HEX('b') : COD_HEX('a'),
        studentJeton: c.jeton === 'fara' ? null : 'j'.repeat(30),
      }, cfg(c.activ));
      expect(r.reducere?.tip ?? null).toBe(astTip);
      expect(r.pretIntreg).toBe(c.pret);
      expect(r.pret).toBe(astTip ? redusRef(c.pret, 20) : c.pret);
      expect(r.promoPereche).toBe(c.pereche);
      if (astTip === 'student') expect(c.seats).toBe(1);
      if (!cerut) expect(r.motiv).toBeUndefined();
      if (cerut && !astTip) expect(r.motiv).toBeDefined();   // cererea refuzată are mereu un motiv (comanda o refuză)
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// D. Returul −20% (calea 547): fiecare regulă încălcată singură → motivul ei; toate respectate → valid
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('D. returValid: o singură regulă încălcată pe caz', () => {
  const NUME = ['Popescu Maria', 'Ciobanu Ion', 'Rusu Ana-Maria', 'Țurcanu Ștefan', 'Иванов Пётр'];
  const varianta = (n: string) => pick([
    n, n.split(/[\s]+/).reverse().join(' '), n.toUpperCase(), n.normalize('NFD').replace(/[̀-ͯ]/g, ''), `  ${n}  `, n.replace('-', ' '),
  ]);
  type Def = { motiv: string | null; f: (t: TurPentruRetur, r: ReturCerut, a: { now: number }) => void };
  const DEFECTE: Def[] = [
    { motiv: null, f: () => {} },
    { motiv: null, f: (t, r) => { r.passengerName = varianta(t.passenger_name); } },
    { motiv: null, f: (t, r) => { r.tripDate = addDays(t.trip_date, 30); r.departureAt = isoLocal(r.tripDate, 15, 0); } },  // exact 30 zile
    { motiv: null, f: (t, r) => { r.seats = t.seats; } },
    { motiv: null, f: (t, _r, a) => { t.paid_at = new Date(a.now - 30 * 60_000).toISOString(); } },                         // exact 30 min
    { motiv: 'tur_neplatit', f: (t) => { t.status = pick(['noua', 'anulata', 'returnata', 'expirata', 'platita_fara_bilet', 'eroare_creare']); } },
    { motiv: 'dupa_tur', f: (t, _r, a) => { t.paid_at = new Date(a.now - int(31, 600) * 60_000).toISOString(); } },
    { motiv: 'dupa_tur', f: (t) => { t.paid_at = null; } },
    { motiv: 'tur_test', f: (t) => { t.test = true; } },
    { motiv: 'tur_test', f: (t, r) => { t.proba_fizica = true; r.test = t.test; } },
    { motiv: 'tur_e_retur', f: (t) => { t.comanda_tur_id = 'alt-tur'; } },
    { motiv: 'tur_e_retur', f: (t) => { t.reducere_tip = 'retur'; } },
    { motiv: 'nu_e_pereche', f: (t) => { t.promo_pereche = false; } },
    { motiv: 'nu_e_pereche', f: (_t, r) => { r.urcare = 'Edineț'; } },
    { motiv: 'nu_e_pereche', f: (_t, r) => { const u = r.urcare; r.urcare = r.coborare; r.coborare = u; } },  // același sens al numelor
    { motiv: 'alta_persoana', f: (_t, r) => { r.phone = '37360000001'; } },
    { motiv: 'alta_persoana', f: (_t, r) => { r.passengerName = 'Altcineva Vasile'; } },
    { motiv: 'acelasi_sens', f: (t, r) => { r.goingNorth = t.going_north; } },
    { motiv: 'aceeasi_ruta', f: (t, r) => { r.crmRouteId = t.crm_route_id; } },
    { motiv: 'inainte_de_tur', f: (t, r) => { r.departureAt = t.departure_at; r.tripDate = t.trip_date; } },
    { motiv: 'inainte_de_tur', f: (t, r) => { r.tripDate = t.trip_date; r.departureAt = new Date(Date.parse(t.departure_at) - int(1, 600) * 60_000).toISOString(); } },
    { motiv: 'peste_termen', f: (t, r) => { r.tripDate = addDays(t.trip_date, int(31, 60)); r.departureAt = isoLocal(r.tripDate, 10, 0); } },
    { motiv: 'prea_multe_locuri', f: (t, r) => { r.seats = t.seats + int(1, 3); } },
  ];
  for (let i = 0; i < 345; i++) {
    const def = DEFECTE[i % DEFECTE.length];
    const now = Date.parse('2026-10-12T09:00:00Z') + int(0, 10_000) * 60_000;
    const turSpreSud = bool();               // tur Bălți → Chișinău (going_north=false) sau Chișinău → Bălți
    const zi = addDays('2026-10-13', int(0, 40));
    const ora = int(5, 18);
    const seats = int(1, 4);
    const nume = pick(NUME);
    const tur: TurPentruRetur = {
      id: `t${i}`, status: 'platita', test: false, proba_fizica: false, promo_pereche: true, comanda_tur_id: null, reducere_tip: null,
      phone: '37369123456', passenger_name: nume, going_north: !turSpreSud, crm_route_id: int(1, 30), trip_date: zi,
      departure_at: isoLocal(zi, ora, int(0, 59)), seats, paid_at: new Date(now - int(0, 29) * 60_000).toISOString(),
    };
    const ziR = addDays(zi, int(0, 29));
    const r: ReturCerut = {
      phone: tur.phone, passengerName: nume, goingNorth: turSpreSud, crmRouteId: tur.crm_route_id + int(1, 5), tripDate: ziR,
      departureAt: ziR === zi ? new Date(Date.parse(tur.departure_at) + int(60, 300) * 60_000).toISOString() : isoLocal(ziR, int(5, 20), 0),
      seats: int(1, seats), test: false,
      urcare: turSpreSud ? pick(VARIANTE_CHISINAU) : pick(VARIANTE_BALTI), coborare: turSpreSud ? pick(VARIANTE_BALTI) : pick(VARIANTE_CHISINAU),
      turUrcare: turSpreSud ? 'Bălți' : 'Chișinău', turCoborare: turSpreSud ? 'Chișinău' : 'Bălți',
    };
    def.f(tur, r, { now });
    it(`#${i} ${def.motiv ?? 'valid'} (tur ${turSpreSud ? 'B→C' : 'C→B'} ${zi}, retur ${r.tripDate})`, () => {
      const v = returValid(tur, r, 30, { minuteDupaPlata: 30, nowMs: now });
      expect(v).toEqual(def.motiv ? { ok: false, motiv: def.motiv } : { ok: true });
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// E. Cotele online: 4 pe cursă la Bălți; vineri spre Bălți și duminică spre Chișinău, plecarea ≥ 12:00 → 2
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('E1. cotaOnline pe zi, oră și sens (inclusiv trecerea la ora de iarnă, 25.10)', () => {
  const cfg = { plafon: 4, dupaOra: 12, seara: 2 };
  for (let i = 0; i < 420; i++) {
    const zi = addDays('2026-10-12', int(0, 60));
    let ora = int(0, 23);
    if (zi === '2026-10-25' && ora === 3) ora = 4;   // ora 03:00 locală nu e ambiguă, dar o ocolim
    const min = pick([0, 0, 59, 30, int(0, 59)]);
    const north = bool();
    const dow = isodowDe(zi);
    const aglomerat = (dow === 5 && north) || (dow === 7 && !north);
    // Ion 10.10: vineri spre Bălți, plecarea 11:00–11:59 → 7.
    const astept = dow === 5 && north && ora === 11 ? 7 : dow === 5 && north && ora < 11 ? 20 : aglomerat && ora >= 12 ? 2 : 4;
    it(`#${i} ${zi} (zi ${dow}) ${pad(ora)}:${pad(min)} ${north ? 'spre Bălți' : 'spre Chișinău'} → ${astept}`, () => {
      expect(cotaOnline(north, isoLocal(zi, ora, min), cfg)).toBe(astept);
    });
  }
  for (const [plafon, seara, astept] of [[1, 2, 1], [0, 2, 0], [3, 2, 2], [6, 5, 5]] as const) {
    it(`cota de seară nu depășește plafonul (plafon ${plafon}, seara ${seara}) → ${astept}`, () => {
      expect(cotaOnline(true, '2026-10-16T14:00:00+03:00', { plafon, dupaOra: 12, seara })).toBe(astept);
    });
  }
});

describe('E2. cotaCursei: cheia «balti» doar pe cursele cu Bălți; cota = cotaOnline', () => {
  const plafoane = new Map([['balti', { nume: 'Bălți', locuri: 4 }]]);
  const cfg: PromoConfig = { activ: true, pct: 20, returZile: 30, returMin: 30, cotaDupaOra: 12, cotaSeara: 2, localitatiDeLa: new Map() };
  for (let i = 0; i < 60; i++) {
    const cuBalti = rnd() < 0.7;
    const north = bool();
    const zi = addDays('2026-10-13', int(0, 20));
    const ora = int(5, 21);
    const urcare = north ? 'Chișinău' : cuBalti ? pick(VARIANTE_BALTI) : 'Edineț';
    const coborare = north ? (cuBalti ? pick(VARIANTE_BALTI) : 'Briceni') : 'Chișinău';
    const dow = isodowDe(zi);
    const cota = cuBalti ? (dow === 5 && north && ora === 11 ? 7 : dow === 5 && north && ora < 11 ? 20 : ((dow === 5 && north) || (dow === 7 && !north)) && ora >= 12 ? 2 : 4) : null;
    it(`#${i} ${urcare.trim()}→${coborare.trim()} ${zi} ${pad(ora)}:00 → ${cota ?? 'fără cotă'}`, () => {
      const r = cotaCursei(plafoane, cfg, { urcare, coborare, goingNorth: north, departureAt: isoLocal(zi, ora, 0) });
      expect(r).toEqual(cuBalti ? { chei: ['balti'], cota } : { chei: null, cota: null });
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// F. Plafoanele: locurile luate pe cursă și plafoanele de comenzi (pachetul tur-retur = o comandă, 551)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('F1. verificaPlafonLocalitati: locurile luate = plătite + deschise < 30 min, pe ambele capete', () => {
  const plafoane = new Map([['balti', { nume: 'Bălți', locuri: 4 }]]);
  const NOW = Date.parse('2026-10-14T08:00:00Z');
  for (let i = 0; i < 220; i++) {
    const comenzi: ComandaPentruPlafon[] = [];
    let luate = 0;
    for (let k = int(0, 5); k > 0; k--) {
      const status = pick(['platita', 'noua', 'eroare_creare', 'expirata', 'anulata', 'returnata'] as const);
      const minute = pick([1, 10, 29, 30, 31, 90]);
      const seats = int(1, 3);
      const cuBalti = rnd() < 0.8;
      comenzi.push({ from_name: cuBalti ? pick(VARIANTE_BALTI) : 'Edineț', to_name: 'Chișinău', seats, status, created_at: new Date(NOW - minute * 60_000).toISOString() });
      const ocupa = status === 'platita' || ((status === 'noua' || status === 'eroare_creare') && minute < 30);
      if (cuBalti && ocupa) luate += seats;
    }
    const seats = int(1, 4);
    const ramase = Math.max(0, 4 - luate);
    it(`#${i} luate ${luate}, cerute ${seats} → ${seats <= ramase ? 'încape' : `refuz (mai sunt ${ramase})`}`, () => {
      const v = verificaPlafonLocalitati({ plafoane, urcare: 'Bălți', coborare: 'Chișinău', seats, comenziCursa: comenzi, nowMs: NOW });
      expect(v).toEqual(seats <= ramase ? { ok: true } : { ok: false, localitate: 'Bălți', plafon: 4, ramase });
    });
  }
});

/**
 * Port SQL: blocul plafoanelor din bilete_creeaza_comanda (551), citit din migrație. `randuri` = comenzile deja în bază,
 * `pachet` = cererea e returul din pachet.
 */
interface RandPlafon { phone: string; ip: string; status: 'noua' | 'platita'; in_pachet: boolean; minute: number }
function plafonSql551(randuri: RandPlafon[], cerere: { phone: string; ip: string; pachet: boolean }): string | null {
  if (!cerere.pachet) {
    if (randuri.filter((r) => r.ip === cerere.ip && !r.in_pachet && r.minute < 10).length >= 5) return 'PLAFON_IP';
    if (randuri.filter((r) => r.phone === cerere.phone && r.status === 'noua' && !r.in_pachet && r.minute < 30).length >= 3) return 'PLAFON_TELEFON';
  }
  // 553: și plafonul global numără pachetul o dată (returul din pachet nu intră).
  if (randuri.filter((r) => r.status === 'noua' && !r.in_pachet && r.minute < 30).length >= 50) return 'PLAFON_GLOBAL';
  return null;
}

describe('F2. port SQL 551: un tur-retur e O comandă la plafonul pe telefon și pe IP; returul din pachet nu cade pe plafon', () => {
  for (let i = 0; i < 160; i++) {
    // Un telefon face pe rând cumpărări (tur simplu sau tur-retur), neplătite, în 30 de minute.
    const unitati = Array.from({ length: int(1, 6) }, () => bool() ? 'pachet' as const : 'simplu' as const);
    const ip = `ip${i}`;
    it(`#${i} [${unitati.join(', ')}]: primele 3 cumpărări trec, a 4-a cade pe PLAFON_TELEFON; returul din pachet niciodată`, () => {
      const randuri: RandPlafon[] = [];
      unitati.forEach((u, k) => {
        const minute = 5;                 // toate în aceeași fereastră, IP diferit pe unitate ca să judecăm telefonul
        const tur = plafonSql551(randuri, { phone: 'p', ip: `${ip}-${k}`, pachet: false });
        expect(tur).toBe(k < 3 ? null : 'PLAFON_TELEFON');   // Ion: «pachetul contează o singură comandă la plafoane»
        if (tur) return;
        randuri.push({ phone: 'p', ip: `${ip}-${k}`, status: 'noua', in_pachet: false, minute });
        if (u === 'pachet') {
          expect(plafonSql551(randuri, { phone: 'p', ip: `${ip}-${k}`, pachet: true })).toBeNull();
          randuri.push({ phone: 'p', ip: `${ip}-${k}`, status: 'noua', in_pachet: true, minute });
        }
      });
    });
  }
  it('PLAFON_IP: 5 cumpărări pe IP în 10 min (tur-retur = 1), a 6-a refuzată', () => {
    const randuri: RandPlafon[] = [];
    for (let k = 0; k < 6; k++) {
      const r = plafonSql551(randuri, { phone: `p${k}`, ip: 'x', pachet: false });
      expect(r).toBe(k < 5 ? null : 'PLAFON_IP');
      randuri.push({ phone: `p${k}`, ip: 'x', status: 'noua', in_pachet: false, minute: 1 }, { phone: `p${k}`, ip: 'x', status: 'noua', in_pachet: true, minute: 1 });
    }
  });
  // NEPOTRIVIRE (551): PLAFON_GLOBAL (50 comenzi «noua» / 30 min) numără și returul din pachet, deci 25 de tur-retururi
  // deschise blochează vânzarea pentru toți, deși sunt 25 de comenzi (regula lui Ion: «pachetul contează o singură
  // comandă la plafoane»). Repro: 30 de tur-retururi neplătite de pe telefoane/IP-uri diferite → al 31-lea tur simplu
  // primește PLAFON_GLOBAL; așteptat: trece (31 < 50). Sursa: 551_bilete_plafon_tur_retur.sql:51-52.
  // Reparat în 553 (revizia 10.10).
  it('PLAFON_GLOBAL numără un tur-retur ca o comandă (30 de pachete deschise → al 31-lea cumpărător trece)', () => {
    const randuri: RandPlafon[] = [];
    for (let k = 0; k < 30; k++) randuri.push({ phone: `p${k}`, ip: `i${k}`, status: 'noua', in_pachet: false, minute: 3 }, { phone: `p${k}`, ip: `i${k}`, status: 'noua', in_pachet: true, minute: 3 });
    expect(plafonSql551(randuri, { phone: 'nou', ip: 'nou', pachet: false })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// G. Anularea și suma returnată
// Reguli: grila Ion 05.10 (≥24 h 9/9, ≥12 h 8/9, ≥6 h 7/9, ≥4 h 6/9, altfel 0; vina noastră 9/9), rotunjire în jos la bani;
// tur-returul plătit o dată se anulează doar împreună, din tur, până la plecarea turului (după — doar dispecerul cu «vina
// noastră» sau sistemul); returul din pachet singur doar «vina noastră»/sistem; returul 547 legat: «doar turul» pierde
// reducerea dată returului, «ambele» — fiecare cu grila lui, «vina noastră» — fără scădere.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('G1. grila de restituire și suma (bani întregi, în jos, niciodată peste plată)', () => {
  for (let i = 0; i < 200; i++) {
    const total = pick([150, 120, 270, 135, 300, int(10, 1200), Math.round(int(1000, 120000)) / 100]);
    const minute = pick([24 * 60, 24 * 60 - 1, 12 * 60, 12 * 60 - 1, 6 * 60, 6 * 60 - 1, 240, 239, 0, -30, int(-600, 4000)]);
    const vina = rnd() < 0.15;
    const ore = minute / 60;
    const noimi = vina ? 9 : ore >= 24 ? 9 : ore >= 12 ? 8 : ore >= 6 ? 7 : ore >= 4 ? 6 : 0;
    const bani = Math.round(total * 100);
    const suma = Math.floor((bani * noimi) / 9) / 100;
    it(`#${i} ${total} lei, cu ${minute} min înainte${vina ? ', vina noastră' : ''} → ${noimi}/9 = ${suma}`, () => {
      const plecare = '2026-10-20T07:00:00+03:00';
      const now = Date.parse(plecare) - minute * 60_000;
      expect(noimiRestituire(plecare, now, vina)).toBe(noimi);
      const s = sumaRestituire(total, noimi);
      expect(s).toBe(suma);
      expect(s).toBeLessThanOrEqual(total);
      expect(s).toBeGreaterThanOrEqual(0);
    });
  }
  for (const [ore, astept] of [[25, 135], [13, 120], [7, 105], [5, 90], [3, 0]] as const) {
    it(`biletul de 135 lei al lui Ion cu ${ore} h înainte → ${astept}`, () => {
      const plecare = '2026-10-20T07:00:00+03:00';
      expect(sumaRestituire(135, noimiRestituire(plecare, Date.parse(plecare) - ore * 3_600_000))).toBe(astept);
    });
  }
});

/** Port SQL: bilete_anuleaza (versiunea 548), pe rânduri în memorie. Întoarce eroarea sau rândurile [{id, suma, scazut}]. */
interface RandAnulare { id: string; status: string; total: number; seats: number; in_pachet: boolean; comanda_tur_id: string | null; reducere_lei_loc: number; urcat: boolean }
function anuleazaSql548(c: RandAnulare, rt: RandAnulare | null, p: { sursa: string; grila: number | null; vina: boolean; siReturul: boolean; grilaRetur: number | null }):
  { eroare: string } | { randuri: Array<{ id: string; suma: number; scazut?: number }> } {
  if (!['pasager', 'admin', 'sistem', 'ai'].includes(p.sursa)) return { eroare: 'SURSA_NEVALIDA' };
  if (p.grila == null || p.grila < 0) return { eroare: 'GRILA_NEVALIDA' };
  if (c.status === 'anulata' || c.status === 'returnata') return { eroare: 'DEJA' };
  if (c.status !== 'platita' && c.status !== 'platita_fara_bilet') return { eroare: `STARE_${c.status.toUpperCase()}` };
  if (c.in_pachet && !(p.vina || p.sursa === 'sistem')) return { eroare: 'PACHET_DOAR_IMPREUNA' };
  if (c.urcat) return { eroare: 'BILET_URCAT' };
  if (p.grila > c.total) return { eroare: 'GRILA_PESTE_TOTAL' };
  let suma = p.grila, scazut = 0;
  const rez: Array<{ id: string; suma: number; scazut?: number }> = [];
  const legat = c.comanda_tur_id == null && rt && (rt.status === 'platita' || (rt.in_pachet && rt.status === 'platita_fara_bilet')) ? rt : null;
  if (legat) {
    if (p.siReturul || legat.in_pachet) {
      if (legat.urcat) return { eroare: 'RETUR_URCAT' };
      const g = p.grilaRetur ?? legat.total;
      if (g < 0 || g > legat.total) return { eroare: 'GRILA_RETUR_NEVALIDA' };
      rez.push({ id: legat.id, suma: g });
    } else if (!p.vina) {
      suma = Math.max(0, p.grila - legat.reducere_lei_loc * legat.seats);
      scazut = p.grila - suma;
    }
  }
  return { randuri: [{ id: c.id, suma, scazut }, ...rez] };
}

describe('G2. port SQL bilete_anuleaza (548): sumele respectă regulile lui Ion', () => {
  for (let i = 0; i < 220; i++) {
    const seats = int(1, 4);
    const fel = pick(['pachet', 'retur547', 'fara'] as const);
    const tur: RandAnulare = { id: 'tur', status: pick(['platita', 'platita', 'platita', 'platita_fara_bilet', 'noua', 'anulata']), total: 150 * seats, seats, in_pachet: false, comanda_tur_id: null, reducere_lei_loc: 0, urcat: rnd() < 0.08 };
    const rt: RandAnulare | null = fel === 'fara' ? null : {
      id: 'ret', status: pick(['platita', 'platita', 'platita_fara_bilet', 'anulata']), total: 120 * seats, seats, in_pachet: fel === 'pachet',
      comanda_tur_id: 'tur', reducere_lei_loc: 30, urcat: rnd() < 0.08,
    };
    const dinRetur = fel === 'pachet' && rnd() < 0.25;           // cererea vine pe biletul de retur din pachet
    const p = {
      sursa: pick(['pasager', 'admin', 'sistem', 'ai'] as const), grila: pick([tur.total, sumaRestituire(tur.total, int(0, 9)), tur.total + 1, null]),
      vina: rnd() < 0.3, siReturul: bool(), grilaRetur: pick([null, null, rt ? rt.total : 0, rt ? sumaRestituire(rt.total, int(0, 9)) : 0]),
    };
    it(`#${i} ${fel}${dinRetur ? ' (din retur)' : ''} ${tur.status}/${rt?.status ?? '-'} ${JSON.stringify(p)}`, () => {
      const c = dinRetur ? rt! : tur;
      const r = anuleazaSql548(c, dinRetur ? null : rt, p);
      if ('eroare' in r) {
        // erorile au mereu o cauză din reguli
        const cauze = [p.grila == null || (p.grila ?? 0) < 0, !['platita', 'platita_fara_bilet'].includes(c.status),
          c.in_pachet && !(p.vina || p.sursa === 'sistem'), c.urcat, (p.grila ?? 0) > c.total, !!rt?.urcat, true];
        expect(cauze.some(Boolean)).toBe(true);
        if (dinRetur && !(p.vina || p.sursa === 'sistem') && ['platita', 'platita_fara_bilet'].includes(c.status) && p.grila != null && p.grila >= 0) {
          expect(r.eroare).toBe('PACHET_DOAR_IMPREUNA');   // returul din pachet nu se anulează singur
        }
        return;
      }
      const [primul, ...rest] = r.randuri;
      expect(primul.suma).toBeGreaterThanOrEqual(0);
      expect(primul.suma).toBeLessThanOrEqual(c.total);
      expect(primul.scazut ?? 0).toBeGreaterThanOrEqual(0);
      expect(primul.suma + (primul.scazut ?? 0)).toBe(p.grila);
      const legatActiv = !dinRetur && rt && (rt.status === 'platita' || (rt.in_pachet && rt.status === 'platita_fara_bilet'));
      if (legatActiv && rt!.in_pachet) {
        // pachetul: anularea turului anulează ÎNTOTDEAUNA și returul (o plată → un refund), fără scădere
        expect(rest.map((x) => x.id)).toEqual(['ret']);
        expect(primul.scazut).toBe(0);
        // totalul returnat ≤ plata băncii (tur + retur)
        expect(primul.suma + rest[0].suma).toBeLessThanOrEqual(tur.total + rt!.total);
      } else if (legatActiv && p.siReturul) {
        expect(rest.length).toBe(1);
        expect(rest[0].suma).toBeLessThanOrEqual(rt!.total);
        expect(primul.scazut).toBe(0);
      } else if (legatActiv && !p.vina) {
        expect(rest.length).toBe(0);
        expect(primul.suma).toBe(Math.max(0, (p.grila as number) - 30 * rt!.seats));   // «doar turul» pierde reducerea
      } else {
        expect(rest.length).toBe(0);
        expect(primul.suma).toBe(p.grila);                                         // vina noastră / fără retur: grila întreagă
      }
    });
  }
});

describe('G3. anuleazaSiReturneaza: tur-returul doar împreună și doar până la plecarea turului (baza falsă)', () => {
  type Sursa = 'pasager' | 'admin' | 'sistem' | 'ai';
  for (let i = 0; i < 200; i++) {
    const sursa = pick(['pasager', 'admin', 'sistem', 'ai'] as const) as Sursa;
    const vina = pick([true, false, undefined]);
    const fel = pick(['tur_pachet', 'retur_pachet', 'tur_simplu'] as const);
    const minuteInainte = pick([-180, -10, 30, 200, 300, 1500, int(-600, 3000)]);
    const status = pick(['platita', 'platita', 'platita', 'platita_fara_bilet', 'anulata', 'noua']);
    // Așteptarea, din reguli:
    let ast: 'rpc' | 'inchis' | 'validare' | 'deja' = 'rpc';
    const plecat = minuteInainte <= 0;
    if (status === 'anulata') ast = 'deja';
    else if (status === 'noua') ast = 'validare';
    else if (fel === 'retur_pachet') ast = sursa === 'sistem' || (sursa === 'admin' && vina === true) ? 'rpc' : 'inchis';
    else if (fel === 'tur_pachet') {
      // Ion, 10.10.2026: «niciodată nu trebuie decide dispecerul» — din bot/site se anulează și pachetul, până la plecarea
      // turului și în fereastra pasagerului (4 h).
      if (plecat && !(sursa === 'admin' && vina === true) && sursa !== 'sistem') ast = 'inchis';
      else if (sursa === 'ai' || sursa === 'pasager') ast = minuteInainte >= 240 ? 'rpc' : 'inchis';
    } else if (sursa === 'ai' || sursa === 'pasager') ast = minuteInainte >= 240 ? 'rpc' : 'inchis';  // plasa de 4 h
    it(`#${i} ${fel} ${status} sursa=${sursa} vina=${vina} plecare peste ${minuteInainte} min → ${ast}`, async () => {
      const dep = new Date(Date.now() + minuteInainte * 60_000 + (minuteInainte >= 0 ? 30_000 : -30_000)).toISOString();
      const c = { id: 'c1', status, total: fel === 'retur_pachet' ? 120 : 150, departure_at: dep, in_pachet: fel === 'retur_pachet', comanda_tur_id: fel === 'retur_pachet' ? 't0' : null, checkout_id: 'ck' };
      const apeluri: Array<Record<string, unknown>> = [];
      fake.resolve = (q, mode) => {
        if (q.table === 'app_config') return { data: { value: q.f.key === 'bilete_anulare_pasager_min' ? '240' : '' }, error: null };
        if (q.table === 'bilete_comenzi' && q.f.comanda_tur_id) return { data: fel === 'tur_pachet' ? [{ id: 'r1' }] : [], error: null };
        if (q.table === 'bilete_comenzi' && (mode === 'maybe' || mode === 'single')) return { data: c, error: null };
        return { data: [], error: null };
      };
      fake.rpc = (n, a) => { apeluri.push({ n, ...a }); return { data: [{ id: 'c1', suma: null, deja: true }], error: null }; };
      let rezultat: string;
      try {
        await anuleazaSiReturneaza('c1', { sursa, motiv: 'test', vinaNoastra: vina, suma: sursa === 'ai' ? 100 : undefined });
        rezultat = apeluri.length ? 'rpc' : 'deja';
      } catch (e) {
        rezultat = (e as { cod?: string }).cod ?? `eroare: ${(e as Error).message}`;
      }
      expect(rezultat).toBe(ast);
      if (ast === 'rpc') {
        expect(apeluri[0].n).toBe('bilete_anuleaza');
        if (fel === 'tur_pachet') expect(apeluri[0].p_si_returul).toBe(true);           // returul se anulează cu turul
        expect(apeluri[0].p_vina_noastra).toBe(vina ?? sursa === 'sistem');
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// H. Telefonul pasagerului (Ion 10.10: «pot fi și bilete din Ucraina cu +380 sau altă țară, dar de bază e MD»)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('H. normalizarea telefonului: Moldova implicit, străinul doar cu «+»/«00»', () => {
  const cifre = (n: number) => Array.from({ length: n }, () => String(int(0, 9))).join('');
  const sep = (s: string) => s.split('').map((ch, k) => (k > 0 && rnd() < 0.25 ? pick([' ', '-', '.', ' (', ') ']) : '') + ch).join('');
  const cazuri: Array<{ n: string; in: string; out: string | null }> = [];
  for (let i = 0; i < 360; i++) {
    const fel = i % 12;
    const md8 = String(int(1, 9)) + cifre(7);
    if (fel === 0) cazuri.push({ n: 'MD 0XX', in: sep(`0${md8}`), out: `373${md8}` });
    else if (fel === 1) cazuri.push({ n: 'MD 8 cifre', in: sep(md8), out: `373${md8}` });
    else if (fel === 2) cazuri.push({ n: 'MD +373', in: `+${sep(`373${md8}`)}`, out: `373${md8}` });
    else if (fel === 3) cazuri.push({ n: 'MD 00373', in: sep(`00373${md8}`), out: `373${md8}` });
    else if (fel === 4) cazuri.push({ n: 'MD 373 fără +', in: `373${md8}`, out: `373${md8}` });
    else if (fel === 5) { const d = `380${int(1, 9)}${cifre(8)}`; cazuri.push({ n: 'UA +380', in: `+${sep(d)}`, out: d }); }
    else if (fel === 6) { const cc = pick(['40', '49', '7', '1', '44', '90', '39', '48']); const d = `${cc}${int(1, 9)}${cifre(int(7, 10))}`.slice(0, 15); cazuri.push({ n: 'altă țară +', in: `+${sep(d)}`, out: d.length >= 8 ? d : null }); }
    else if (fel === 7) { const d = `380${int(1, 9)}${cifre(8)}`; cazuri.push({ n: 'UA 00380', in: `00${d}`, out: d }); }
    else if (fel === 8) { const d = `380${int(1, 9)}${cifre(8)}`; cazuri.push({ n: 'străin FĂRĂ prefix (ambiguu)', in: pick([d, `0${d.slice(3)}`]), out: null }); }
    else if (fel === 9) cazuri.push({ n: '+373 lungime greșită', in: `+373${cifre(pick([6, 7, 9, 10]))}`, out: null });
    else if (fel === 10) cazuri.push({ n: 'prea scurt / prea lung / +0', in: pick([cifre(int(1, 6)), `+${int(1, 9)}${cifre(16)}`, `+0${cifre(9)}`, `+${int(1, 9)}${cifre(5)}`]), out: null });
    else cazuri.push({ n: 'gol / litere', in: pick(['', '   ', 'abc', 'telefon', '+', '++']), out: null });
  }
  for (const [i, c] of cazuri.entries()) {
    it(`#${i} ${c.n}: «${c.in}» → ${c.out ?? 'null'}`, () => {
      const d = normalizeazaTelefonPasager(c.in);
      expect(d).toBe(c.out);
      if (d) {
        expect(normalizeazaTelefonPasager(formateazaTelefonPasager(d))).toBe(d);   // forma afișată se citește înapoi la fel
        expect(normalizeazaTelefonPasager(d.startsWith('373') ? d : `+${d}`)).toBe(d);   // idempotent
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// I. Carnetul de student: AI-ul extrage, codul decide (un singur defect pe caz)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('I. decizieCarnet: Moldova, anul universitar de acum, numele = actul = pasagerul, fața', () => {
  const AZI = '2026-10-10';
  const bun = (): ExtrasCarnet => ({
    e_carnet_student: true, tip_institutie: pick(['universitate', 'colegiu'] as const),
    institutie: pick(['Universitatea de Stat din Moldova', 'USM', 'Colegiul de Medicină Bălți', 'Universitatea „Alecu Russo”', 'Universitatea Tehnică a Moldovei']),
    tara_institutie: pick(['MD', null] as const), nume_carnet: 'Popescu Ana', nume_act: 'Ana Popescu', tip_act: pick(['pasaport', 'buletin'] as const),
    valabil_pana: null, an_studii: pick(['2026-2027', '2026/2027', '2026 - 2027']), numar_carnet: 'AB1234', claritate: 'buna', semne_ecran: false, semne_editare: false, fata_compatibila: true,
  });
  type D = { v: string; m?: string; f: (x: ExtrasCarnet) => void };
  const DEF: D[] = [
    { v: 'accept', f: () => {} },
    { v: 'accept', f: (x) => { x.an_studii = null; x.valabil_pana = pick([AZI, '2027-06-30']); } },
    { v: 'poza_neclara', m: 'poza_neclara', f: (x) => { x.claritate = 'slaba'; } },
    { v: 'respins', m: 'poza_ecranului', f: (x) => { x.semne_ecran = true; } },
    { v: 'respins', m: 'editata', f: (x) => { x.semne_editare = true; } },
    { v: 'respins', m: 'nu_e_carnet', f: (x) => { if (bool()) x.e_carnet_student = false; else x.tip_institutie = 'altul'; } },
    { v: 'respins', m: 'lipsa_act', f: (x) => { x.tip_act = pick(['altul', null] as const); } },
    { v: 'poza_neclara', m: 'institutie_ilizibila', f: (x) => { x.institutie = pick(['', '   ', null]); } },
    { v: 'respins', m: 'institutie_straina', f: (x) => { if (bool()) x.tara_institutie = 'alta'; else { x.tara_institutie = null; x.institutie = 'Universitatea din București'; } } },
    { v: 'poza_neclara', m: 'nume_ilizibil', f: (x) => { x.nume_carnet = null; } },
    { v: 'respins', m: 'nume_carnet_act', f: (x) => { x.nume_act = 'Ionescu Ana'; } },
    { v: 'respins', m: 'nume_pasager', f: (x) => { x.nume_carnet = 'Rusu Elena'; x.nume_act = 'Elena Rusu'; } },
    { v: 'respins', m: 'fata', f: (x) => { x.fata_compatibila = false; } },
    { v: 'poza_neclara', m: 'fata_neclara', f: (x) => { x.fata_compatibila = null; } },
    { v: 'respins', m: 'expirat', f: (x) => { x.an_studii = '2025-2026'; } },
    { v: 'respins', m: 'an_studii_nevalid', f: (x) => { x.an_studii = '2027-2028'; } },
    { v: 'poza_neclara', m: 'valabilitate_ilizibila', f: (x) => { x.an_studii = '2026-2028'; } },
    { v: 'respins', m: 'expirat', f: (x) => { x.an_studii = null; x.valabil_pana = '2026-10-09'; } },
    { v: 'poza_neclara', m: 'valabilitate_ilizibila', f: (x) => { x.an_studii = null; x.valabil_pana = pick([null, '31.12.2026']); } },
    { v: 'poza_neclara', m: 'numar_ilizibil', f: (x) => { x.numar_carnet = pick([null, 'A1', '  ']); } },
  ];
  for (let i = 0; i < 200; i++) {
    const d = DEF[i % DEF.length];
    const x = bun();
    d.f(x);
    const pasager = pick(['Popescu Ana', 'ANA POPESCU', 'Ana  Popescu']);
    it(`#${i} ${d.m ?? 'accept'} (${x.institutie}, ${x.an_studii ?? x.valabil_pana})`, () => {
      expect(decizieCarnet(x, pasager, AZI, [])).toEqual(d.m ? { verdict: d.v, motiv: d.m } : { verdict: 'accept' });
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// J. Pașii site-ului tur-retur: retururile potrivite, cheile după răspuns, pluralul
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('J1. curseReturPotrivite: se vinde, altă rută, după sosirea turului', () => {
  const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  for (let i = 0; i < 120; i++) {
    const tur = { crm_route_id: int(1, 30), trip_date: '2026-10-14', arrivalTime: hm(int(7 * 60, 21 * 60)) };
    const lista = Array.from({ length: int(0, 12) }, (_, k) => ({
      id: k, sale_open: rnd() < 0.8, crm_route_id: pick([tur.crm_route_id, int(1, 30)]), trip_date: pick(['2026-10-13', '2026-10-14', '2026-10-14', '2026-10-15']), time: hm(int(5 * 60, 22 * 60)),
    }));
    const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    const astept = lista.filter((t) => t.sale_open && t.crm_route_id !== tur.crm_route_id
      && (t.trip_date > tur.trip_date || (t.trip_date === tur.trip_date && min(t.time) > min(tur.arrivalTime)))).map((t) => t.id);
    it(`#${i} ${lista.length} curse, turul sosește ${tur.arrivalTime} → ${astept.length} potrivite`, () => {
      expect(curseReturPotrivite(tur, lista).map((t) => t.id)).toEqual(astept);
    });
  }
  // TEORETIC: turul care sosește după miezul nopții (pleacă 22:00, sosește 00:30 a doua zi) — returul de 23:00 în ziua
  // turului e propus, deși pleacă înainte ca turul să ajungă (comparația e pe «HH:MM» al aceleiași zile). Pe Bălți ⇄
  // Chișinău nu am găsit cursă care să sosească după 00:00, deci azi nu se întâmplă; serverul cere doar plecarea
  // returului după plecarea turului (548), deci nu l-ar opri. apps/web/src/lib/tur-retur.ts:24-26.
  // Reparat 10.10: cu ora plecării turului (22:00), sosirea de 00:30 e socotită în ziua următoare.
  it('teoretic: turul care sosește după miezul nopții nu primește un retur care pleacă înainte de sosire', () => {
    const r = curseReturPotrivite({ crm_route_id: 1, trip_date: '2026-10-14', arrivalTime: '00:30', time: '22:00' },
      [{ sale_open: true, crm_route_id: 2, trip_date: '2026-10-14', time: '23:00' }]);
    expect(r).toEqual([]);
  });
});

describe('J2. politicaChei: chei noi la alegere schimbată sau refuz clar; aceleași doar când banca/rețeaua n-au răspuns', () => {
  const CODURI = [null, undefined, '', 'maib', 'in_lucru', 'validare', 'inchis', 'idempotenta', 'plafon', 'loc_ocupat', 'config', 'necunoscut'];
  let i = 0;
  for (const schimbata of [true, false]) for (const cod of CODURI) for (let rep = 0; rep < 3; rep++) {
    const aceleasi = !schimbata && (cod == null || cod === '' || cod === 'maib' || cod === 'in_lucru');
    it(`#${i++} schimbată=${schimbata} cod=${String(cod)} → ${aceleasi ? 'aceleași' : 'noi + înlocuire'}`, () => {
      expect(politicaChei({ alegereSchimbata: schimbata, codEroare: cod })).toEqual(aceleasi ? { chei: 'aceleasi', inlocuieste: false } : { chei: 'noi', inlocuieste: true });
    });
  }
});

describe('J3. pasageriText RO/RU', () => {
  for (let n = 1; n <= 60; n++) {
    const m10 = n % 10, m100 = n % 100;
    const ru = m10 === 1 && m100 !== 11 ? 'пассажир' : m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14) ? 'пассажира' : 'пассажиров';
    it(`${n}`, () => {
      expect(pasageriText(n, 'ru')).toBe(`${n} ${ru}`);
      expect(pasageriText(n, 'ro')).toBe(`${n} ${n === 1 ? 'pasager' : 'pasageri'}`);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// K. Ziua de start a Bălțiului (13.10) pe site și pe panou
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('K1. vanzareDeschisaPeSite: Bălți din 13.10, Edineț/Briceni din 12.10, doar perechile cu Chișinău, șofer pe zi', () => {
  const cfg = parseazaConfig({
    activ: true, inchidere_tur_min: 0, inchidere_retur_min: 120, rute: [{ id: 5, tur: true, retur: true }],
    localitati: ['Briceni', 'Edineț', 'Bălți'], destinatii: ['Chișinău'], curse_de_la: '2026-10-12', localitati_de_la: { 'Bălți': '2026-10-13' },
  });
  const NOW = Date.parse('2026-10-10T10:00:00+03:00');
  for (let i = 0; i < 120; i++) {
    const zi = addDays('2026-10-10', int(1, 10));
    const north = bool();
    const loc = pick(['Bălți', 'Balti', 'Edineț', 'Briceni', 'Soroca']);
    const altul = rnd() < 0.85 ? 'Chișinău' : 'Edineț';
    const urcare = north ? altul : loc, coborare = north ? loc : altul;
    const sofer = rnd() < 0.9;
    const nl = loc.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const cuChisinau = altul === 'Chișinău' && nl !== 'soroca';
    const start = nl === 'balti' ? '2026-10-13' : '2026-10-12';
    const astept = sofer && cuChisinau && zi >= start;
    it(`#${i} ${urcare}→${coborare} ${zi} șofer=${sofer} → ${astept ? 'se vinde' : 'nu'}`, () => {
      expect(vanzareDeschisaPeSite({ cfg, routeId: 5, goingNorth: north, tripDate: zi, time: north ? '17:30' : '07:00', pornireRuta: north ? '17:30' : '06:00', urcare, coborare, soferPeZi: sofer, nowMs: NOW })).toBe(astept);
    });
  }
});

describe('K2. localitateNeinceputa (panoul): Bălți se vinde din cursa de 13.10', () => {
  const cfg: PromoConfig = { activ: true, pct: 20, returZile: 30, returMin: 30, cotaDupaOra: 12, cotaSeara: 2, localitatiDeLa: new Map([['balti', '2026-10-13']]) };
  for (let i = 0; i < 60; i++) {
    const zi = addDays('2026-10-08', int(0, 12));
    const cuBalti = rnd() < 0.75;
    const [u, c] = bool() ? [cuBalti ? pick(VARIANTE_BALTI) : 'Edineț', 'Chișinău'] : ['Chișinău', cuBalti ? pick(VARIANTE_BALTI) : 'Briceni'];
    const astept = cuBalti && zi < '2026-10-13' ? '2026-10-13' : null;
    it(`#${i} ${u.trim()}→${c.trim()} ${zi} → ${astept ?? 'se vinde'}`, () => {
      expect(localitateNeinceputa(cfg, u, c, zi)).toBe(astept);
    });
  }
});

describe('K3. perechea promoțiilor e exact Bălți ⇄ Chișinău', () => {
  const ALTE = ['Edineț', 'Briceni', 'Soroca', 'Bălți Gară', 'Chișinău Centru'];
  for (let i = 0; i < 40; i++) {
    const caz = int(0, 3);
    const [a, b, ast] = caz === 0 ? [pick(VARIANTE_BALTI), pick(VARIANTE_CHISINAU), true] : caz === 1 ? [pick(VARIANTE_CHISINAU), pick(VARIANTE_BALTI), true]
      : caz === 2 ? [pick(VARIANTE_BALTI), pick(ALTE), false] : [pick(ALTE), pick(VARIANTE_CHISINAU), false];
    it(`#${i} «${a}» → «${b}» → ${ast}`, () => { expect(perechePromo(a, b)).toBe(ast); });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// L. Comparația statică SQL ↔ TS (aceleași constante, date, rotunjiri; ultima definiție a fiecărei funcții)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('L. SQL (migrațiile 546–551) ↔ TS', () => {
  const AICI = path.dirname(fileURLToPath(import.meta.url));
  const RADACINA = path.resolve(AICI, '../../../../..');
  const MIGR = path.join(RADACINA, 'packages/db/migrations');
  const fisiere = readdirSync(MIGR).filter((f) => f.endsWith('.sql')).sort();
  const citeste = (f: string) => readFileSync(path.join(MIGR, f), 'utf8');
  const sursa = (p: string) => readFileSync(path.join(RADACINA, p), 'utf8');
  /** Textul ultimei definiții a funcției (ordinea fișierelor = ordinea aplicării). */
  const ultimaDefinitie = (semnatura: string): { fisier: string; text: string } => {
    let gasit = { fisier: '', text: '' };
    for (const f of fisiere) {
      const t = citeste(f);
      const k = t.lastIndexOf(`FUNCTION public.${semnatura}`);
      if (k >= 0) { const end = t.indexOf('END $$;', k); gasit = { fisier: f, text: t.slice(k, end) }; }
    }
    return gasit;
  };
  const m546 = citeste('546_bilete_promotii_balti.sql');
  const m547 = citeste('547_bilete_retur_acelasi_moment.sql');
  const promoServer = sursa('apps/admin/src/lib/bilete/promo-server.ts');
  const promoTs = sursa('packages/db/src/bilete-promo.ts');
  const localitatiTs = sursa('packages/db/src/bilete-localitati.ts');
  const comenziTs = sursa('apps/admin/src/lib/bilete/comenzi.ts');
  const creeaza = ultimaDefinitie('bilete_creeaza_comanda(p jsonb)');
  const anuleaza = ultimaDefinitie('bilete_anuleaza(p_id uuid, p_sursa text, p_motiv text, p_grila numeric,');
  const activa = ultimaDefinitie('bilete_comanda_activa(');
  const platita = ultimaDefinitie('bilete_marcheaza_platita(p_checkout_id uuid)');

  const cfgSql = (k: string, t: string) => Number(new RegExp(`\\('${k}', '(\\d+)'\\)`).exec(t)?.[1]);
  const cfgTs = (k: string) => Number(new RegExp(`num\\('${k}', (\\d+)\\)`).exec(promoServer)?.[1]);
  for (const [k, t] of [['bilete_promo_pct', m546], ['bilete_promo_retur_zile', m546], ['bilete_promo_retur_min', m547], ['bilete_cota_dupa_ora', m546], ['bilete_cota_seara', m546]] as const) {
    it(`implicitul ${k}: app_config din migrație = rezerva din promo-server.ts`, () => {
      expect(cfgSql(k, t)).toBeGreaterThan(0);
      expect(cfgTs(k)).toBe(cfgSql(k, t));
    });
  }
  it('rezervele din SQL (coalesce(..., N)) = valorile din app_config: retur_zile 30, retur_min 30, student_max_7z 4', () => {
    expect(creeaza.text).toMatch(/'bilete_promo_retur_zile'\), 30\)/);
    expect(creeaza.text).toMatch(/'bilete_promo_retur_min'\), 30\)/);
    expect(creeaza.text).toMatch(/'bilete_student_max_7z'\), 4\)/);
    expect(cfgSql('bilete_student_max_7z', m546)).toBe(4);
  });
  it('rotunjirea: CHECK round(pret_intreg*(100-pct)/100.0) ↔ aplicaReducere Math.round(pret*(100-pct)/100), pct 1–50 în ambele', () => {
    expect(m546).toContain('price_per_seat = round(pret_intreg * (100 - reducere_pct) / 100.0)');
    expect(m546).toContain('reducere_pct BETWEEN 1 AND 50');
    expect(promoTs).toContain('Math.round((pret * (100 - pct)) / 100)');
    expect(promoTs).toContain('pct >= 1 && pct <= 50');
    expect(m546).toContain('reducere_lei_loc = pret_intreg - price_per_seat');
    expect(m546).toContain('CHECK (total = price_per_seat * seats)');
  });
  it('minimul plății: PROMO_PRET_MINIM = SUMA_MINIMA_PLATA_MDL = 10 (SQL nu verifică minimul; îl verifică doar TS)', () => {
    expect(PROMO_PRET_MINIM).toBe(10);
    expect(SUMA_MINIMA_PLATA_MDL).toBe(10);
  });
  it('studentul: un singur loc în CHECK-ul SQL și în TS', () => {
    expect(m546).toContain("CHECK (reducere_tip IS DISTINCT FROM 'student' OR seats = 1)");
    expect(promoServer).toContain('x.seats !== 1');
    expect(creeaza.text).toContain("IF v_seats <> 1 THEN RAISE EXCEPTION 'STUDENT_UN_LOC'");
  });
  it('fereastra comenzii deschise: 30 min în bilete_comanda_activa = DURATA_COMANDA_DESCHISA_MS', () => {
    expect(activa.text).toContain("creat > now() - interval '30 minutes'");
    expect(DURATA_COMANDA_DESCHISA_MS).toBe(30 * 60_000);
  });
  // NEPOTRIVIRE (minoră): cota în SQL (bilete_comanda_activa) numără și «platita_fara_bilet»; prevalidarea TS
  // (verificaPlafonLocalitati / STARI_PLAFON în comenzi.ts) numără doar «platita» + deschisele. Efect: TS lasă să treacă,
  // SQL refuză cu COTA_PLINA (mesajul vine din bază, nu cel «mai sunt N»). Banii nu sunt afectați; SQL e autoritatea.
  // Repro: o comandă platita_fara_bilet de 4 locuri Bălți pe cursă → verificaPlafonLocalitati({seats:1}) = ok:true,
  // bilete_cota_ocupata = 4 → COTA_PLINA:0. packages/db/src/bilete-localitati.ts:146 vs 546_bilete_promotii_balti.sql:121.
  // Reparat 10.10 (revizia): TS numără și platita_fara_bilet.
  it('stările care țin cota: aceleași în TS și în SQL (platita_fara_bilet)', () => {
    expect(activa.text).toContain("'platita_fara_bilet'");
    expect(localitatiTs).toMatch(/c\.status === 'platita_fara_bilet'|'platita_fara_bilet'/);
    expect(comenziTs).toMatch(/STARI_PLAFON = \[[^\]]*platita_fara_bilet/);
  });
  // Revizia 10.10 (M2): «platita_fara_bilet» cu banii în drum înapoi (intenția 558, bani_inapoi) nu ține loc — în SQL
  // (ultima bilete_comanda_activa + bilete_cota_ocupata) și în TS (comandaOcupaLoc + coloana citită în comenzi.ts).
  it('banii care se întorc nu țin cota: aceeași regulă în SQL și în TS (bani_inapoi)', () => {
    const cota = ultimaDefinitie('bilete_cota_ocupata(');
    expect(activa.fisier).toBe('558_bilete_refund_intentii.sql');
    expect(activa.text).toContain("(s = 'platita_fara_bilet' AND (cu_refund_in_curs OR NOT coalesce(bani_inapoi, false)))");
    expect(cota.fisier).toBe('558_bilete_refund_intentii.sql');
    expect(cota.text).toContain('bilete_comanda_activa(status, created_at, refund_finalizat_la, false, bani_inapoi)');
    expect(localitatiTs).toContain("if (c.status === 'platita_fara_bilet') return !c.bani_inapoi;");
    expect(comenziTs).toMatch(/select\('from_name, to_name, seats, status, created_at, bani_inapoi'\)/);
  });
  // Revizia 10.10 (L4): plata fără bilet cu banii în drum înapoi nu e bilet activ și nu se oferă la anulare — botul, site-ul,
  // asistentul și anularea din panou o recunosc după același câmp (bani_inapoi, ținut de declanșatorul din 558).
  it('L4: site, bot și anularea nu tratează «platita_fara_bilet» cu banii înapoi ca bilet activ', () => {
    const bot = sursa('apps/admin/src/lib/bilete/retur-bot.ts');
    const site = sursa('apps/admin/src/lib/bilete/anulare-site.ts');
    const pub = sursa('apps/admin/src/lib/bilete/public.ts');
    const ref = sursa('apps/admin/src/lib/bilete/refund.ts');
    expect(bot).toContain("if (c.status === 'platita_fara_bilet' && c.bani_inapoi) return { ok: false, cod: 'bani_inapoi' };");
    expect(bot).toMatch(/\.in\('status', \['platita', 'platita_fara_bilet'\]\)\s*\.eq\('bani_inapoi', false\)/);
    expect(bot).toContain(".or('bani_inapoi.eq.false,status.in.(anulata,returnata)')");
    expect(site).toContain("if (tur.status === 'platita_fara_bilet' && tur.bani_inapoi) return { ok: false, r: { ok: false, cod: 'bani_inapoi' } };");
    expect(site).toMatch(/\.eq\('bani_inapoi', false\)\.order/);
    expect(pub).toContain("(c.status === 'platita' || (c.status === 'platita_fara_bilet' && !c.bani_inapoi))");
    expect(pub).toContain("if (r.status === 'platita_fara_bilet' && r.bani_inapoi) return null;");
    expect(ref).toContain("if (inainte.status === 'platita_fara_bilet' && inainte.bani_inapoi) throw new ComandaError('inchis'");
    expect(sursa('apps/bot/src/services/panouBilete.ts')).toContain("const CODURI_REFUZ = ['nelegat', 'stare', 'inexistent', 'bani_inapoi'] as const;");
    expect(sursa('apps/web/src/components/bilet/AnuleazaBilet.tsx')).toMatch(/bani_inapoi: "Plata a ajuns fără bilet; banii se întorc automat/);
    expect(sursa('apps/web/src/components/bilet/AnuleazaBilet.tsx')).toMatch(/bani_inapoi: "Оплата пришла без билета; деньги вернутся автоматически/);
  });
  it('returul (calea 547) în ultima definiție SQL: toate condițiile din returValid au pereche', () => {
    for (const s of ["t.status <> 'platita'", 't.proba_fizica', 't.test <> v_test', 't.comanda_tur_id IS NOT NULL', "t.reducere_tip = 'retur'",
      'NOT t.promo_pereche', 't.phone <> v_phone', 't.going_north = v_north', 't.crm_route_id = v_route', 'v_seats > t.seats',
      "(p->>'departure_at')::timestamptz <= t.departure_at", 'v_date > t.trip_date + zile', 't.paid_at < now() - make_interval(mins => v_min)']) {
      expect(creeaza.text, s).toContain(s);
    }
  });
  // NEPOTRIVIRE (apărare în adâncime): SQL-ul nu compară NUMELE pasagerului cu al turului (TS da: cheieNume, motiv
  // «alta_persoana») și nu verifică că returul ÎNSUȘI e pe perechea Bălți ⇄ Chișinău (TS: perechePromo(r.urcare, r.coborare)
  // + perechea inversă). Singurul apelant e TS-ul, care le verifică, deci azi nu se poate ocoli; o cerere directă la RPC
  // (service_role) ar primi reducerea pe alt nume / altă pereche. 551_bilete_plafon_tur_retur.sql:73-82.
  // 553: perechea returului e verificată și în SQL (promo_pereche al rândului nou).
  it('returul în SQL verifică perechea returului (553)', () => {
    expect(creeaza.text).toContain("OR NOT t.promo_pereche OR NOT coalesce((p->>'promo_pereche')::boolean, false)");
  });
  // Rămâne documentat: numele pasagerului se compară doar în TS (cheieNume); singurul apelant e TS-ul.
  it.fails('returul în SQL verifică și numele pasagerului', () => {
    expect(creeaza.text).toMatch(/t\.passenger_name|t\.nume_pasager_cheie/);
  });
  it('pachetul (548): turul neplătit, fără sesiune, creat în 30 min, ACELEAȘI locuri; fără fereastra de 30 min după plată', () => {
    expect(creeaza.text).toContain("WHEN v_pachet THEN t.status NOT IN ('noua', 'eroare_creare') OR t.checkout_id IS NOT NULL");
    expect(creeaza.text).toContain("t.created_at < now() - interval '30 minutes' OR v_seats <> t.seats");
    expect(creeaza.text).toContain('IF NOT v_pachet AND (t.paid_at IS NULL');
    expect(citeste('548_bilete_tur_retur_o_plata.sql')).toContain("CHECK (NOT in_pachet OR (comanda_tur_id IS NOT NULL AND reducere_tip = 'retur' AND checkout_id IS NULL))");
  });
  it('553 e ultima definiție a bilete_creeaza_comanda și păstrează 546/547/548/551 (copiere textuală fără pierderi)', () => {
    expect(creeaza.fisier).toBe('553_bilete_revizie_tur_retur.sql');
    for (const s of ['PROMO_SOFER', 'RETUR_FOLOSIT', 'RETUR_DUPA_TUR', 'STUDENT_JETON_FOLOSIT', 'STUDENT_PLAFON', 'COTA_PLINA', 'RETUR_TERMEN', 'LOC_OCUPAT', 'in_pachet)']) {
      expect(creeaza.text, s).toContain(s);
    }
    expect(creeaza.text).toMatch(/ip_hash = coalesce\(v_ip, ''\) AND NOT in_pachet/);
    expect(creeaza.text).toMatch(/phone = v_phone AND status = 'noua' AND NOT in_pachet/);
  });
  it('anularea (560, ultima definiție — copiată din 559/558/548): pachetul doar împreună; «doar turul» scade reducere_lei_loc × seats; vina noastră nu scade', () => {
    expect(anuleaza.fisier).toBe('560_bilete_plata_tarzie_bani_inapoi.sql');
    expect(anuleaza.text).toContain("IF c.in_pachet AND NOT (coalesce(p_vina_noastra, false) OR p_sursa = 'sistem') THEN RAISE EXCEPTION 'PACHET_DOAR_IMPREUNA'");
    expect(anuleaza.text).toContain('IF coalesce(p_si_returul, false) OR rt.in_pachet THEN');
    expect(anuleaza.text).toContain('v_suma := greatest(0, p_grila - rt.reducere_lei_loc * rt.seats);');
    expect(anuleaza.text).toContain('ELSIF NOT coalesce(p_vina_noastra, false) THEN');
    expect(anuleaza.text).toContain("IF p_grila > c.total THEN RAISE EXCEPTION 'GRILA_PESTE_TOTAL'");
  });
  it('N1 (559): anularea blochează biletele comenzii și ale returului ÎNAINTE de verificarea «urcat»; intenția în aceeași tranzacție (558)', () => {
    const lacat = anuleaza.text.indexOf('PERFORM 1 FROM bilete WHERE comanda_id IN (c.id, rt.id) ORDER BY id FOR UPDATE;');
    const retur = anuleaza.text.indexOf('SELECT * INTO rt FROM bilete_comenzi r WHERE comanda_tur_id = c.id');
    const urcat = anuleaza.text.indexOf("SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';");
    const urcatRt = anuleaza.text.indexOf("SELECT EXISTS (SELECT 1 FROM bilete WHERE comanda_id = rt.id AND status = 'urcat')");
    expect(retur).toBeGreaterThan(0);
    expect(lacat).toBeGreaterThan(retur);
    expect(urcat).toBeGreaterThan(lacat);
    expect(urcatRt).toBeGreaterThan(lacat);
    expect(anuleaza.text).toContain('bilete_refund_intentie_noua(');
  });
  it('plata pachetului (548): suma băncii = tur + retur din pachet; codul de retur NU se dă pe tur-retur (fără a doua reducere)', () => {
    expect(platita.fisier).toBe('560_bilete_plata_tarzie_bani_inapoi.sql');
    expect(platita.text).toContain('v_suma := c.total + coalesce((SELECT sum(total) FROM bilete_comenzi WHERE comanda_tur_id = c.id AND in_pachet), 0);');
    expect(platita.text).toContain('AND NOT proba_fizica AND rt.id IS NULL');
    expect(comenziTs).toContain("return Number(comanda.total) + (data || []).reduce(");
  });
  it('plata târzie (560, D2): ora execuției la bancă, ordinea clasificării = clasificaPlata din impacare-reguli.ts; intenția de refund în aceeași tranzacție', () => {
    const t = platita.text;
    const ordine = ['IF v_exec IS NULL THEN RETURN 0; END IF;', 'IF v_exec >= c.departure_at THEN', "v_tarziu := 'plata_dupa_plecare';",
      "ELSIF c.status = 'expirata' OR v_exec > c.created_at + bilete_rezervare_durata() THEN", "v_tarziu := 'loc_vandut';",
      'v_alerta := coalesce(v_tarziu, bilete_revalideaza_plata(c));', 'bilete_refund_intentie_noua(p_checkout_id'];
    let k = 0;
    for (const x of ordine) { const j = t.indexOf(x, k); expect(j, x).toBeGreaterThan(-1); k = j; }
    expect(t).not.toMatch(/coalesce\(m\.executat_la, now\(\)\)/);
    expect(sursa('apps/admin/src/lib/bilete/impacare-reguli.ts')).toContain('if (exec >= Date.parse(p.departureAt)) return \'plata_dupa_plecare\';');
  });
  it('codul de retur: 64 hex în TS = două UUID fără liniuțe în SQL', () => {
    expect(promoServer).toContain('/^[0-9a-f]{64}$/');
    expect(platita.text).toContain("replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')");
  });
  it('data de start a Bălțiului: 13.10 în migrația 546 (app_config) — aceeași valoare live (SELECT 10.10.2026)', () => {
    expect(m546).toContain(`('bilete_localitati_de_la', '{"Bălți":"2026-10-13"}')`);
  });
  it('prețul fix 150 (offer-calc.ts): B→C din 02.10, C→B din 10.10 — nu e în SQL; cota 4/2 în comentariul coloanei', () => {
    expect(sursa('packages/db/src/offer-calc.ts')).toContain("{ lei: 150, from: '2026-10-02', fromRetur: '2026-10-10' }");
    expect(m546).toContain('4, sau 2 vineri spre Bălți / duminică spre Chișinău după 12:00');
  });
  // NEPOTRIVIRE (551): vezi F2 — PLAFON_GLOBAL numără și rândul returului din pachet.
  // Reparat în 553.
  it('PLAFON_GLOBAL exclude returul din pachet (pachetul = o comandă)', () => {
    expect(creeaza.text).toMatch(/status = 'noua' AND NOT in_pachet AND created_at > now\(\) - interval '30 minutes';\s*IF n >= 50/);
  });
});


