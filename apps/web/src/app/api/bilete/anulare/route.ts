import { NextRequest, NextResponse } from 'next/server';
import { anulareLaPanou } from '@/lib/bilete-api';

// POST /api/bilete/anulare — anularea de pe pagina biletului (557): codul biletului + 4 cifre ale telefonului → panoul.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, cod: 'json' }, { status: 400 }); }
  const cod = String(b?.cod ?? '').trim().toLowerCase(), cifre = String(b?.cifre ?? '').replace(/\D/g, '').slice(0, 4);
  if (!/^[0-9a-f]{32}$/.test(cod) || cifre.length !== 4) return NextResponse.json({ ok: false, cod: 'date' }, { status: 400 });
  return NextResponse.json(await anulareLaPanou({ cod, cifre, actiune: b?.actiune === 'confirma' ? 'confirma' : 'oferta', suma: Number(b?.suma ?? 0), sursa: 'site' }));
}
