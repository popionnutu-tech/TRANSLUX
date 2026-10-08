import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { clasaRaspuns, ECHIPAJ_PROBA, echipajDinGrafic, type EchipajCursa, type RandAtribuire, type RezultatTelegram } from './echipaj-reguli';

// Echipajul pe biletul online (migr. 538; Ion, 08.10.2026: «număr mașină și șofer final — să se trimită în chat»).
// O citire pe lot: bifa dispecerului (grafic_group_posts), TOT graficul zilei (daily_assignments), anulările
// (route_cancellations), apoi șoferii și mașinile găsite. Regulile — în echipaj-reguli.ts.

type Db = ReturnType<typeof getSupabase>;
export interface ComandaEchipaj { trip_date: string; crm_route_id: number; going_north: boolean; test?: boolean | null; proba_fizica?: boolean | null }
export type Echipaje = (c: ComandaEchipaj) => EchipajCursa | null;

/**
 * Echipajele pentru zilele date. Comanda de probă primește echipajul fix (fără să citească graficul real), comanda
 * test_admin — null (revizia de securitate #6). Baza căzută → aruncă; apelantul decide (biletul se arată și fără rând).
 */
export async function echipajeZile(db: Db, zile: string[]): Promise<Echipaje> {
  const unice = [...new Set(zile.filter((z) => /^\d{4}-\d{2}-\d{2}$/.test(z)))];
  const garda = (c: ComandaEchipaj): EchipajCursa | null | undefined => {
    if (c.proba_fizica === true) return ECHIPAJ_PROBA;
    if (c.test === true) return null;
    return undefined;
  };
  if (!unice.length) return (c) => garda(c) ?? { stare: 'astept' };
  const [rB, rA, rC] = await Promise.all([
    db.from('grafic_group_posts').select('ziua').in('ziua', unice),
    db.from('daily_assignments').select('assignment_date, crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id, auto_copied').in('assignment_date', unice),
    db.from('route_cancellations').select('crm_route_id, ziua').in('ziua', unice),
  ]);
  for (const r of [rB, rA, rC]) if (r.error) throw new Error(`echipaj: ${r.error.message}`);
  const bifate = new Set(((rB.data ?? []) as Array<{ ziua: string }>).map((r) => r.ziua));
  const anulate = new Set(((rC.data ?? []) as Array<{ crm_route_id: number; ziua: string }>).map((r) => `${r.ziua}|${r.crm_route_id}`));
  const peZi = new Map<string, RandAtribuire[]>();
  for (const r of (rA.data ?? []) as Array<RandAtribuire & { assignment_date: string }>) {
    if (!peZi.has(r.assignment_date)) peZi.set(r.assignment_date, []);
    peZi.get(r.assignment_date)!.push(r);
  }
  const toate = [...peZi.values()].flat();
  const idS = [...new Set(toate.flatMap((r) => [r.driver_id, r.driver_id_retur]).filter((x): x is string => Boolean(x)))];
  const idV = [...new Set(toate.flatMap((r) => [r.vehicle_id, r.vehicle_id_retur]).filter((x): x is string => Boolean(x)))];
  const [rS, rV] = await Promise.all([
    idS.length ? db.from('drivers').select('id, full_name, phone').in('id', idS) : Promise.resolve({ data: [], error: null }),
    idV.length ? db.from('vehicles').select('id, plate_number').in('id', idV) : Promise.resolve({ data: [], error: null }),
  ]);
  if (rS.error) throw new Error(`echipaj drivers: ${rS.error.message}`);
  if (rV.error) throw new Error(`echipaj vehicles: ${rV.error.message}`);
  const soferi = new Map(((rS.data ?? []) as Array<{ id: string; full_name: string | null; phone: string | null }>).map((s) => [s.id, s]));
  const masini = new Map(((rV.data ?? []) as Array<{ id: string; plate_number: string | null }>).map((v) => [v.id, v]));
  return (c) => {
    const g = garda(c);
    if (g !== undefined) return g;
    return echipajDinGrafic({
      bifat: bifate.has(c.trip_date), anulata: anulate.has(`${c.trip_date}|${c.crm_route_id}`),
      randuri: peZi.get(c.trip_date) ?? [], ruta: c.crm_route_id, goingNorth: c.going_north, soferi, masini,
    });
  };
}

/**
 * Mesajul către client, cu rezultatul CLASIFICAT (critica C1): trimis / blocat (doar blocarea sigură) / temporar /
 * incert (timeout după trimitere — considerat trimis). Timeout 4 s, ca bugetul cronului să ajungă (C3).
 */
export async function trimiteLaClient(chatId: number, text: string): Promise<RezultatTelegram> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 'temporar';
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(4000),
    });
    const j = await resp.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    return clasaRaspuns(j?.ok ? 200 : resp.status === 200 ? 502 : resp.status, j?.description, false);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return clasaRaspuns(null, null, timeout);
  }
}
