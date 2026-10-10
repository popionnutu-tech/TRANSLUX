import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { gasesteBileteLaPanou } from '@/lib/bilete-api';
import { normalizeazaTelefon } from '@/lib/bilete-reguli';

// POST /api/bilete/gaseste — «Găsește biletul meu» (552): telefonul + amprenta IP merg la panou, care trimite linkurile
// prin SMS pe acel număr. Răspunsul nu spune dacă pe număr există bilete. Cât SMS-ul nu e gata: biletele pe ecran,
// doar cu telefon + numele de pe bilet (Ion, 10.10.2026).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, motiv: 'json' }, { status: 400 }); }
  if (String(b?.website ?? '').trim()) return NextResponse.json({ ok: true }); // capcana pentru roboți
  const tel = normalizeazaTelefon(String(b?.phone ?? ''));
  if (!tel) return NextResponse.json({ ok: false, motiv: 'telefon' }, { status: 400 });
  const sare = process.env.BILETE_IP_SALT;
  if (!sare) return NextResponse.json({ ok: false, motiv: 'config' }, { status: 500 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'necunoscut';
  const ipHash = createHash('sha256').update(`${sare}|${ip}`).digest('hex');
  const nume = String(b?.nume ?? '').trim().slice(0, 80);
  return NextResponse.json(await gasesteBileteLaPanou({ phone: tel, ipHash, lang: b?.lang === 'ru' ? 'ru' : 'ro', nume }));
}
