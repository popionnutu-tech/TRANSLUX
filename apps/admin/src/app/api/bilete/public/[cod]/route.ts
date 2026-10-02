import { NextRequest, NextResponse } from 'next/server';
import { biletPublic } from '@/lib/bilete/public';

// GET /api/bilete/public/<cod> — biletul pasagerului, cu codul din link ca secret (128 de biți). Public în
// middleware (prefix /api/bilete/public/, listat exhaustiv în public-paths.test.ts). Fără cache, fără referrer.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  const c = await biletPublic(cod);
  if (!c) return NextResponse.json({ ok: false }, { status: 404, headers: ANTETE });
  return NextResponse.json({ ok: true, comanda: c }, { headers: ANTETE });
}
