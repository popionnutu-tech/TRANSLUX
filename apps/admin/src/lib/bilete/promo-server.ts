import 'server-only';
import {
  alegeReducerea, aplicaReducere, cheieNume, cotaOnline, normalizeazaLocalitate, perechePromo, PROMO_LOCALITATE,
  returValid, type PlafoaneLocalitati, type TurPentruRetur,
} from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { verificareDupaJeton } from './student-ai';

// Promoțiile online Bălți ⇄ Chișinău pe server (migr. 546, planul docs/plans/2026-10-10-promotii-balti.md, pas 3).
// Un singur calcul pentru comandă și pentru cota de preț afișată pe site. Condițiile se reverifică în bază, sub lacăt.

export interface PromoConfig {
  activ: boolean;
  pct: number;
  returZile: number;
  /** 547: returul −20% se cumpără în cel mult atâtea minute după plata turului. */
  returMin: number;
  cotaDupaOra: number;
  cotaSeara: number;
  /** Prima zi de cursă care se vinde online pe localitate (bilete_localitati_de_la, ex. {"Bălți":"2026-10-13"}). */
  localitatiDeLa: Map<string, string>;
}

const CHEI = ['bilete_promo_activ', 'bilete_promo_pct', 'bilete_promo_retur_zile', 'bilete_promo_retur_min', 'bilete_cota_dupa_ora', 'bilete_cota_seara', 'bilete_localitati_de_la'];

export async function citestePromoConfig(): Promise<PromoConfig> {
  const { data, error } = await getSupabase().from('app_config').select('key, value').in('key', CHEI);
  if (error) throw new Error(`app_config (promo): ${error.message}`);
  const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const num = (k: string, d: number) => { const n = Number(m.get(k)); return Number.isFinite(n) && n >= 0 ? n : d; };
  const deLa = new Map<string, string>();
  try {
    const o = JSON.parse(m.get('bilete_localitati_de_la') || '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) deLa.set(normalizeazaLocalitate(k), v);
  } catch { console.error('[bilete] app_config.bilete_localitati_de_la nu e JSON — fără date de start pe localitate'); }
  return {
    activ: m.get('bilete_promo_activ') === 'true',
    pct: num('bilete_promo_pct', 20),
    returZile: num('bilete_promo_retur_zile', 30),
    returMin: num('bilete_promo_retur_min', 30),
    cotaDupaOra: num('bilete_cota_dupa_ora', 12),
    cotaSeara: num('bilete_cota_seara', 2),
    localitatiDeLa: deLa,
  };
}

/** Prima zi de vânzare a unei localități a cursei, dacă e după data cursei (ex. Bălți de pe 13.10), altfel null. */
export function localitateNeinceputa(cfg: PromoConfig, urcare: string, coborare: string, tripDate: string): string | null {
  for (const nume of [urcare, coborare]) {
    const de = cfg.localitatiDeLa.get(normalizeazaLocalitate(nume));
    if (de && tripDate < de) return de;
  }
  return null;
}

/** Cheile localităților cu cotă ale cursei și cota (cea mai mică); Bălți are cota de seară vineri/duminică. */
export function cotaCursei(plafoane: PlafoaneLocalitati | null, cfg: PromoConfig, a: { urcare: string; coborare: string; goingNorth: boolean; departureAt: string }): { chei: string[] | null; cota: number | null } {
  if (!plafoane) return { chei: null, cota: null };
  const chei: string[] = []; let cota: number | null = null;
  for (const nume of [a.urcare, a.coborare]) {
    const k = normalizeazaLocalitate(nume);
    const p = plafoane.get(k);
    if (!p || chei.includes(k)) continue;
    chei.push(k);
    const c = k === normalizeazaLocalitate(PROMO_LOCALITATE)
      ? cotaOnline(a.goingNorth, a.departureAt, { plafon: p.locuri, dupaOra: cfg.cotaDupaOra, seara: cfg.cotaSeara })
      : p.locuri;
    cota = cota == null ? c : Math.min(cota, c);
  }
  return chei.length ? { chei, cota } : { chei: null, cota: null };
}

export type MotivFaraReducere =
  | 'promo_inchis' | 'nu_e_pereche' | 'sofer' | 'cod_retur' | 'student' | 'student_locuri' | 'pret_mic';

export interface CalculPromo {
  pretIntreg: number;
  pret: number;
  reducere: null | { tip: 'retur' | 'student'; pct: number; turId?: string; verificareId?: string; numeCheie?: string };
  promoPereche: boolean;
  /** De ce nu se aplică reducerea CERUTĂ (cod de retur / jeton); fără cerere → undefined. */
  motiv?: MotivFaraReducere;
}

export interface IntrarePromo {
  mod: 'public' | 'test_admin' | 'proba';
  test: boolean;
  phone: string;          // normalizat
  passengerName: string;
  urcare: string;         // numele canonic al opririlor (crm_stop_fares.name_ro)
  coborare: string;
  goingNorth: boolean;
  crmRouteId: number;
  tripDate: string;
  departureAt: string;
  seats: number;
  pret: number;           // prețul întreg al cursei
  codRetur?: string | null;
  studentJeton?: string | null;
}

const COD_RETUR_RE = /^[0-9a-f]{64}$/;

/** Calculul promoției pentru o comandă / o cotă de preț. Nu aruncă pentru «nu se aplică»: întoarce motivul. */
export async function calculeazaPromo(x: IntrarePromo, cfg: PromoConfig): Promise<CalculPromo> {
  const promoPereche = perechePromo(x.urcare, x.coborare);
  const fara = (motiv?: MotivFaraReducere): CalculPromo => ({ pretIntreg: x.pret, pret: x.pret, reducere: null, promoPereche, motiv });
  const cerut = Boolean(x.codRetur || x.studentJeton);
  if (x.mod === 'proba' || !promoPereche) return fara(cerut ? 'nu_e_pereche' : undefined);
  if (!cfg.activ) return fara(cerut ? 'promo_inchis' : undefined);
  if (!cerut) return fara();
  const db = getSupabase();

  let student: CalculPromo['reducere'] = null;
  let motiv: MotivFaraReducere | undefined;
  if (x.studentJeton) {
    const v = await verificareDupaJeton(x.studentJeton);
    if (!v || v.telefon !== x.phone || v.nume_pasager_cheie !== cheieNume(x.passengerName)) motiv = 'student';
    else if (x.seats !== 1) motiv = 'student_locuri';
    else student = { tip: 'student', pct: cfg.pct, verificareId: v.id, numeCheie: v.nume_pasager_cheie };
  }
  let retur: CalculPromo['reducere'] = null;
  if (!student && x.codRetur) {
    if (!COD_RETUR_RE.test(x.codRetur)) motiv = 'cod_retur';
    else {
      const { data: t, error: eT } = await db.from('bilete_comenzi')
        .select('id, status, test, proba_fizica, promo_pereche, comanda_tur_id, reducere_tip, phone, passenger_name, going_north, crm_route_id, trip_date, departure_at, seats, from_name, to_name, paid_at')
        .eq('cod_retur', x.codRetur).maybeSingle();
      if (eT) throw new Error(`bilete_comenzi (cod retur): ${eT.message}`);
      const tur = t as (TurPentruRetur & { from_name: string; to_name: string }) | null;
      const ok = tur && returValid(tur, {
        phone: x.phone, passengerName: x.passengerName, goingNorth: x.goingNorth, crmRouteId: x.crmRouteId,
        tripDate: x.tripDate, departureAt: x.departureAt, seats: x.seats, test: x.test,
        urcare: x.urcare, coborare: x.coborare, turUrcare: tur.from_name, turCoborare: tur.to_name,
      }, cfg.returZile, { minuteDupaPlata: cfg.returMin });
      // Codul greșit și codul bun cu altă persoană dau același motiv (security L3: fără oracol).
      if (!tur || !ok || !ok.ok) motiv = motiv ?? 'cod_retur';
      else retur = { tip: 'retur', pct: cfg.pct, turId: tur.id };
    }
  }
  const tip = alegeReducerea({ student: Boolean(student), retur: Boolean(retur) });
  const red = tip === 'student' ? student : tip === 'retur' ? retur : null;
  if (!red) return fara(motiv);
  // Telefonul unui șofer nu primește promoții (Ion, 10.10: «ca să nu facă fraudă șoferul»). Verificat DUPĂ cod/jeton și
  // cu același motiv ca un cod nevalid: răspunsul nu spune cuiva că un număr e al unui șofer (security M2).
  const { data: sof, error: eS } = await db.from('drivers').select('id').eq('phone', x.phone).limit(1);
  if (eS) throw new Error(`drivers: ${eS.message}`);
  if (sof && sof.length > 0) return fara(red.tip === 'student' ? 'student' : 'cod_retur');
  const pret = aplicaReducere(x.pret, red.pct);
  if (pret == null) return fara('pret_mic');
  return { pretIntreg: x.pret, pret, reducere: red, promoPereche, motiv: undefined };
}
