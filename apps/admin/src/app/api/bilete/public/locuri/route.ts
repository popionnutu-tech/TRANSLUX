import { NextResponse, type NextRequest } from 'next/server';
import { BazaIndisponibilaError, locuriOcupate, plafonPublic } from '@/lib/bilete/public';

// GET /api/bilete/public/locuri?crm_route_id=7&trip_date=2026-10-06&going_north=true — harta locurilor unei curse
// pentru formularul de pe site (ION-239; Ion, 05.10: pe retur pasagerul își alege locul). Răspuns:
//   { ok: true, capacitate: 20, ocupate: [2,3,8], rezervate: [8], expira_la: '2026-10-05T11:35:00.000Z' | null }
// ocupate = bilete vii + rezervările comenzilor deschise (30 min); rezervate = partea temporară; expira_la = cea mai
// apropiată expirare (formularul reîncarcă atunci). Fără date personale. Public (prefix /api/bilete/public/, listat
// în public-paths.test.ts); no-store; plafon pe IP (60/min, în bază) ca pagina biletului.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTETE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const crmRouteId = Number(q.get('crm_route_id'));
  const tripDate = q.get('trip_date') ?? '';
  const north = q.get('going_north');
  if (!Number.isInteger(crmRouteId) || crmRouteId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || (north !== 'true' && north !== 'false')) {
    return NextResponse.json({ ok: false, eroare: 'parametri: crm_route_id, trip_date (YYYY-MM-DD), going_north (true|false)' }, { status: 400, headers: ANTETE });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
  if (!(await plafonPublic(ip))) return NextResponse.json({ ok: false, eroare: 'prea multe cereri' }, { status: 429, headers: ANTETE });
  try {
    const r = await locuriOcupate(tripDate, crmRouteId, north === 'true');
    return NextResponse.json({ ok: true, ...r }, { headers: ANTETE });
  } catch (e) {
    if (e instanceof BazaIndisponibilaError) {
      console.error('[bilete/locuri] baza indisponibilă:', e.message);
      return NextResponse.json({ ok: false, eroare: 'temporar indisponibil' }, { status: 503, headers: { ...ANTETE, 'Retry-After': '5' } });
    }
    throw e;
  }
}
