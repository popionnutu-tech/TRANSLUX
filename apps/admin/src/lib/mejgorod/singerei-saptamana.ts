// Citirea săptămânii pentru analiza Sîngerei (ION-251): cursele fără trecere prin Sîngerei din mesajul zilnic
// (ziua-db.ts) + numărarea pe camere a sensului lor (counting_entries) → verdict plin / abatere / nenumărat.
// Judecata e în singerei-plin.ts; trimiterea în /api/cron/mejgorod-singerei-saptamana.

import { getSupabase } from '../supabase';
import { citesteNume, citesteZiua } from './ziua-db';
import { judeca, textAnaliza, type CursaFaraSingerei, type OprireNumarata, type Verdict } from './singerei-plin';

export function zileleSaptaminii(luni: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${luni}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Numărarea pe camere a sensurilor cerute: cheie `${date}:${ruta}:${tur|retur}` → opriri. */
async function numararile(zile: string[], cerute: Set<string>): Promise<Map<string, OprireNumarata[]>> {
  const sb = getSupabase();
  const out = new Map<string, OprireNumarata[]>();
  if (!cerute.size) return out;
  const { data: sesiuni, error } = await sb.from('counting_sessions')
    .select('id, assignment_date, crm_route_id')
    .gte('assignment_date', zile[0]).lte('assignment_date', zile[zile.length - 1]);
  if (error) throw new Error(error.message);
  const cheiaSesiunii = new Map<string, string>();
  for (const s of sesiuni ?? []) {
    const k = `${s.assignment_date}:${s.crm_route_id}`;
    if (cerute.has(`${k}:tur`) || cerute.has(`${k}:retur`)) cheiaSesiunii.set(s.id as string, k);
  }
  const ids = [...cheiaSesiunii.keys()];
  // ~82 de opriri pe sesiune (tur + retur): câte 10 sesiuni rămân sub plafonul PostgREST de 1000 de rânduri.
  for (let i = 0; i < ids.length; i += 10) {
    const { data, error: e } = await sb.from('counting_entries')
      .select('session_id, direction, stop_order, stop_name_ro, total_passengers')
      .in('session_id', ids.slice(i, i + 10));
    if (e) throw new Error(e.message);
    for (const r of data ?? []) {
      const k = `${cheiaSesiunii.get(r.session_id as string)}:${r.direction}`;
      if (cerute.has(k)) out.set(k, [...(out.get(k) ?? []), r as OprireNumarata]);
    }
  }
  return out;
}

export interface AnalizaSaptamana {
  saptamina: string;
  curseJudecate: number;
  faraSingerei: number;
  verdicte: Record<Verdict, number>;
  zileFaraGps: string[];
  rows: CursaFaraSingerei[];
  mesaje: string[];
}

/** Săptămâna care începe lunea `luni`: judecata fiecărei curse fără Sîngerei + textul pentru Ion. */
export async function analizaSaptamana(luni: string): Promise<AnalizaSaptamana> {
  const sb = getSupabase();
  const zile = zileleSaptaminii(luni);
  const [ziData, nume, cap] = await Promise.all([
    Promise.all(zile.map(citesteZiua)),
    citesteNume(),
    sb.from('app_config').select('value').eq('key', 'bus_seat_capacity').maybeSingle(),
  ]);
  const locuriImplicite = Number(cap.data?.value) > 0 ? Number(cap.data?.value) : 20;

  const abateri = ziData.flatMap((z) => z.rezultat.lista
    .filter((x) => x.tip === 'singerei')
    .map((x) => ({ date: z.date, ruta: x.ruta, retur: x.retur, driver_id: x.driver_id, vehicle_id: x.vehicle_id })));
  const cheie = (a: { date: string; ruta: number; retur: boolean }) => `${a.date}:${a.ruta}:${a.retur ? 'retur' : 'tur'}`;
  const num = await numararile(zile, new Set(abateri.map(cheie)));
  const rows = abateri.map((a) =>
    // Ion, 07.10: «20 de locuri pune peste tot» — aceleași locuri pe toate microbuzele, nu vehicles.passenger_seats
    judeca(a, num.get(cheie(a)), locuriImplicite));

  const curseJudecate = ziData.reduce((s, z) => s + z.curse.length - z.rezultat.faraGps.length, 0);
  const zileFaraGps = ziData.filter((z) => !z.treceri.length).map((z) => z.date);
  const mesaje = textAnaliza(rows, {
    perioada: `${ddmm(zile[0])}–${ddmm(zile[6])}.${zile[6].slice(0, 4)}`,
    curseJudecate, locuriImplicite, zileFaraGps: zileFaraGps.map(ddmm),
  }, {
    sofer: (id) => (id ? nume.sofer.get(id) ?? null : null),
    masina: (id) => (id ? nume.masina.get(id) ?? null : null),
  });
  const n = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return {
    saptamina: luni, curseJudecate, faraSingerei: rows.length,
    verdicte: { abatere: n('abatere'), plin: n('plin'), nenumarat: n('nenumarat') },
    zileFaraGps, rows, mesaje,
  };
}
