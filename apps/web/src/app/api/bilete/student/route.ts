import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verificaCarnetLaPanou } from '@/lib/bilete-api';
import { normalizeazaTelefon } from '@/lib/bilete-reguli';

// POST /api/bilete/student — verificarea carnetului de student (migr. 544, plan pas 4). Route handler, nu acțiune de
// server: acțiunile au limita de 1 MB, iar două poze trec de ea. Pozele vin convertite în browser (JPEG ≤ 1600 px,
// ≤ 700 KB fiecare); aici doar se verifică forma, se face amprenta IP și se trimite la panou cu BILETE_API_KEY.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(req: NextRequest) {
  if (Number(req.headers.get('content-length') || 0) > 2_200_000) return NextResponse.json({ verdict: 'eroare', motiv: 'prea_mare' }, { status: 413 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ verdict: 'eroare', motiv: 'json' }, { status: 400 }); }
  if (String(b?.website ?? '').trim()) return NextResponse.json({ verdict: 'eroare', motiv: 'indisponibil' }); // capcana pentru roboți
  const nume = String(b?.passengerName ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const tel = normalizeazaTelefon(String(b?.phone ?? ''));
  const carnet = String(b?.carnet ?? ''), act = String(b?.act ?? '');
  if (nume.length < 3 || !tel) return NextResponse.json({ verdict: 'eroare', motiv: 'date' }, { status: 400 });
  if (b?.consimtamant !== true) return NextResponse.json({ verdict: 'eroare', motiv: 'consimtamant' }, { status: 400 });
  if (!B64.test(carnet) || !B64.test(act) || carnet.length > 1_000_000 || act.length > 1_000_000) return NextResponse.json({ verdict: 'eroare', motiv: 'poze' }, { status: 400 });
  const sare = process.env.BILETE_IP_SALT;
  if (!sare) return NextResponse.json({ verdict: 'eroare', motiv: 'config' }, { status: 500 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'necunoscut';
  const ipHash = createHash('sha256').update(`${sare}|${ip}`).digest('hex');
  const r = await verificaCarnetLaPanou({ passengerName: nume, phone: tel, ipHash, carnet, act, consimtamant: true });
  return NextResponse.json(r);
}
