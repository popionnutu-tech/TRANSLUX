import { NextRequest, NextResponse } from 'next/server';
import { locuriCursa } from '@/lib/bilete-api';
import { cerereLocuriValida } from '@/lib/locuri';

// GET /api/bilete/locuri?crm_route_id=7&trip_date=2026-10-13&going_north=true — harta locurilor pentru formular, citită
// din browser cu fetch în loc de acțiunea de server locuriCursei (Ion, 10.10.2026: «vezi cum de făcut ultra fast toată
// procedura»): acțiunile de server merg la coadă, una câte una, și reîncărcarea hărții la 30 s întârzia «Plătește».
// Aceeași validare ca acțiunea (cerereLocuriValida); locuriCursa trimite panoului amprenta IP-ului omului
// (X-Bilete-Client) pentru plafonul public. Răspuns: { ok: true, capacitate, ocupate } sau { ok: false } (fără alegere).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTETE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ruta = q.get('crm_route_id') ?? '';
  const cerere = cerereLocuriValida(/^\d{1,7}$/.test(ruta) ? Number(ruta) : NaN, q.get('trip_date'), q.get('going_north') === 'true');
  if (!cerere) return NextResponse.json({ ok: false }, { status: 400, headers: ANTETE });
  const r = await locuriCursa(cerere.crmRouteId, cerere.tripDate, true);
  if (!r) return NextResponse.json({ ok: false }, { status: 503, headers: ANTETE });
  return NextResponse.json({ ok: true, capacitate: r.capacitate, ocupate: r.ocupate }, { headers: ANTETE });
}
