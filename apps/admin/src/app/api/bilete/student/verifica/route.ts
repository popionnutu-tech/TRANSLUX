import { NextRequest, NextResponse } from 'next/server';
import { cheieSiteValida } from '@/lib/bilete/site-auth';
import { eJpegValid, verificaCarnet } from '@/lib/bilete/student-ai';

// POST /api/bilete/student/verifica — verificarea AI a carnetului de student (migr. 544, plan pas 4). Site-ul trimite,
// prin route handler-ul lui (nu acțiune de server: limita de 1 MB), două JPEG-uri ≤ 1 MB în base64 + telefon + nume.
// Public în middleware (cale EXACTĂ), apărat prin BILETE_API_KEY; plafoanele pe zi sunt în bază (bilete_student_incepe).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!cheieSiteValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 3_200_000) return NextResponse.json({ ok: false, eroare: 'pozele sunt prea mari' }, { status: 413 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, eroare: 'JSON nevalid' }, { status: 400 }); }
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const nume = s(b?.passengerName, 80).trim(), telefon = s(b?.phone, 32), ip = s(b?.ipHash, 64);
  if (nume.length < 2 || !telefon || !ip) return NextResponse.json({ ok: false, eroare: 'nume, telefon și ip_hash sunt obligatorii' }, { status: 400 });
  if (b?.consimtamant !== true) return NextResponse.json({ ok: false, eroare: 'lipsește acordul pentru prelucrarea actelor' }, { status: 400 });
  const buf = (v: unknown) => { try { return Buffer.from(s(v, 1_500_000), 'base64'); } catch { return Buffer.alloc(0); } };
  const carnet = buf(b.carnet), act = buf(b.act);
  if (!eJpegValid(carnet) || !eJpegValid(act)) return NextResponse.json({ ok: false, eroare: 'pozele trebuie să fie JPEG sub 1 MB' }, { status: 400 });
  try {
    const r = await verificaCarnet({ telefon, nume, ipHash: ip, carnet, act });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[bilete/student]', e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
