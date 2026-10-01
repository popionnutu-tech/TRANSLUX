import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { mobiletLogin, mobiletSales, mobiletTrips, saleToCsvCols, type MobiletTrip } from '@/lib/mobilet';
import { normalizeRow, ticketKey, monthsBetween, type TikiRow } from '@/app/(dashboard)/numarare/tabs/bilete/ticketParse';

// Importul zilnic al biletelor din cabinetul Mobilet (ION-160). Ion, 01.10: «fă ca o dată în zi, pe ziua de ieri, să
// lucreze automatizarea: să intre pe site și să colecteze datele de bilete».
//
// Pornit din GitHub Actions (.github/workflows/tiki-mobilet.yml): Vercel Hobby are ambele sloturi de cron ocupate.
// Implicit ia ultimele 8 zile până ieri (ora Chișinăului): terminalele se sincronizează uneori cu zile întârziere, iar
// biletele deja importate se sar după ticket_key (migr. 448), deci reluarea nu dublează nimic. ?from=&to= pentru
// reimportul istoriei, câte o lună pe apel.
//
// Rândurile trec prin același normalizeRow ca exportul CSV, deci biletele din API și din CSV au aceeași cheie. Fiecare
// bilet primește și `mobilet_id` + `trip_id` (cursa concretă), iar cursele intră în tiki_trips cu ziua lor reală.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHUNK = 1000;
const MAX_DAYS = 62;

function chisinauDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Cheia generată din baza de date (448): prețul ca numeric(10,2)::text, deci cu două zecimale. */
function dbTicketKey(r: TikiRow): string {
  return [r.ticket_no, r.route_raw, r.vehicle ?? '', r.driver_name ?? '', r.price.toFixed(2)].join('|');
}

function tripRow(t: MobiletTrip) {
  return {
    trip_id: t.tripId,
    trip_date: t.date,
    dep_time: t.depTime,
    route_name: (t.routeName ?? '').trim(),
    from_point: t.fromPoint?.trim() || null,
    to_point: t.toPoint?.trim() || null,
    vehicle: t.vehicle?.replace(/\s+/g, ' ').trim().toUpperCase() || null,
    driver_name: t.driver?.replace(/\s+/g, ' ').trim().toUpperCase() || null,
    state: t.state,
    tickets_sold: t.ticketsSold,
    seats: t.seats,
    planned_org: t.plannedOrg,
    actual_org: t.actualOrg,
    swap: t.swap == null ? null : typeof t.swap === 'string' ? t.swap : JSON.stringify(t.swap),
    withdraw_reason: t.withdrawReason,
    fetched_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const qFrom = req.nextUrl.searchParams.get('from');
  const qTo = req.nextUrl.searchParams.get('to');
  const to = qTo ?? chisinauDay(-1);
  const from = qFrom ?? chisinauDay(-8);
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to || daysBetween(from, to) > MAX_DAYS) {
    return NextResponse.json({ error: `Interval invalid (max ${MAX_DAYS} zile): ${from} – ${to}` }, { status: 400 });
  }

  const sb = getSupabase();
  const b = await sb.from('tiki_import_batches').insert({
    file_name: `Mobilet ${from} – ${to}`, uploaded_by: 'mobilet (automat)', date_min: from, date_max: to,
  }).select('id').single();
  if (b.error) return NextResponse.json({ error: b.error.message }, { status: 500 });
  const batchId: number = b.data.id;

  let sent = 0, inserted = 0;
  const fail = async (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('tiki_import_batches').update({ status: 'failed', error: msg, rows_sent: sent, rows_inserted: inserted }).eq('id', batchId);
    console.error('[tiki-mobilet]', msg);
    return NextResponse.json({ error: msg, batchId }, { status: 502 });
  };

  try {
    const token = await mobiletLogin();
    const [sales, trips] = await Promise.all([mobiletSales(token, from, to), mobiletTrips(token, from, to)]);

    const excluded: Record<string, number> = {};
    const seen = new Set<string>();
    const rows: (TikiRow & { mobilet_id: number; trip_id: number | null })[] = [];
    let dup = 0;
    for (const s of sales) {
      const r = normalizeRow(saleToCsvCols(s));
      if ('excluded' in r) { excluded[r.excluded] = (excluded[r.excluded] ?? 0) + 1; continue; }
      const k = ticketKey(r);
      if (seen.has(k)) { dup++; continue; }
      seen.add(k);
      rows.push({ ...r, mobilet_id: s.id, trip_id: s.tripId ?? null });
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const ins = await sb.from('tiki_tickets').upsert(
        part.map(r => ({ ...r, pair_source: r.pair ? 'statii' : 'nedeterminat', import_batch_id: batchId })),
        { onConflict: 'ticket_key', ignoreDuplicates: true },
      ).select('ticket_no');
      if (ins.error) throw new Error(ins.error.message);
      inserted += ins.data?.length ?? 0;
      sent += part.length;
      // Biletele care erau deja în bază (din CSV) primesc vânzarea și cursa Mobilet.
      const ids = await sb.rpc('tiki_set_trip_ids', {
        p: part.map(r => ({ ticket_key: dbTicketKey(r), mobilet_id: r.mobilet_id, trip_id: r.trip_id })),
      });
      if (ids.error) throw new Error(ids.error.message);
    }

    for (let i = 0; i < trips.length; i += CHUNK) {
      const up = await sb.from('tiki_trips').upsert(trips.slice(i, i + CHUNK).map(tripRow), { onConflict: 'trip_id' });
      if (up.error) throw new Error(up.error.message);
    }

    const dates = rows.map(r => r.sale_date).sort();
    const months = dates.length ? monthsBetween(dates[0], dates[dates.length - 1]) : [];
    for (const month of months) {
      const [y, mo] = month.split('-').map(Number);
      const last = `${month}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
      const d = await sb.rpc('tiki_deduce_pairs', { p_from: `${month}-01`, p_to: last });
      if (d.error) throw new Error(d.error.message);
      const a = await sb.rpc('tiki_refresh_agg', { p_from: `${month}-01`, p_to: last });
      if (a.error) throw new Error(a.error.message);
    }

    await sb.from('tiki_import_batches').update({
      status: 'done', rows_in_file: sales.length, rows_excluded: excluded, rows_dup_in_file: dup,
      rows_sent: sent, rows_inserted: inserted, date_min: dates[0] ?? from, date_max: dates[dates.length - 1] ?? to,
    }).eq('id', batchId);

    return NextResponse.json({
      ok: true, batchId, from, to, vanzari: sales.length, bilete: rows.length, noi: inserted, curse: trips.length,
      excluse: excluded, luni: months,
    });
  } catch (e) {
    return fail(e);
  }
}
