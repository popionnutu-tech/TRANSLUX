import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ComandaError, creeazaComanda, statusPentru, type ComandaInput } from '@/lib/bilete/comenzi';

// POST /api/bilete/comanda — site-ul (translux.md, server action) creează comanda și primește adresa de plată.
// Public în middleware (cale EXACTĂ), apărat prin BILETE_API_KEY (≥ 256 biți, doar pe server, separată de
// celelalte chei). Plafoanele sunt în bază (migr. 483), nu în memoria instanței.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BEARER_RE = /^Bearer\s+(.+)$/i;

function cheieValida(req: NextRequest): boolean {
  const asteptat = process.env.BILETE_API_KEY;
  if (!asteptat || asteptat.length < 32) {
    console.error('[bilete/comanda] BILETE_API_KEY lipsește sau e prea scurtă');
    return false;
  }
  const primit = BEARER_RE.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (!primit) return false;
  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bazaAdmin(req: NextRequest): string {
  const fix = process.env.MAIB_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (fix) return fix;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'central-hub-md.vercel.app';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  if (!cheieValida(req)) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });

  let body: Partial<ComandaInput> & { ip_hash?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, eroare: 'JSON nevalid' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, eroare: 'corp lipsă' }, { status: 400 });

  const input: ComandaInput = {
    tripDate: String(body.tripDate ?? ''),
    crmRouteId: Number(body.crmRouteId),
    goingNorth: Boolean(body.goingNorth),
    fromRo: String(body.fromRo ?? '').slice(0, 80),
    toRo: String(body.toRo ?? '').slice(0, 80),
    seats: Number(body.seats),
    passengerName: String(body.passengerName ?? ''),
    phone: String(body.phone ?? ''),
    email: body.email ? String(body.email).slice(0, 120) : null,
    lang: body.lang === 'ru' ? 'ru' : 'ro',
    idempotencyKey: String(body.idempotencyKey ?? ''),
    ipHash: body.ipHash ? String(body.ipHash).slice(0, 64) : (body.ip_hash ? String(body.ip_hash).slice(0, 64) : null),
  };

  const siteUrl = (process.env.SITE_URL || 'https://translux.md').replace(/\/+$/, '');
  try {
    const r = await creeazaComanda(input, { mod: 'public', bazaAdmin: bazaAdmin(req), bazaSite: siteUrl, createdBy: 'site' });
    return NextResponse.json({ ok: true, checkoutUrl: r.checkoutUrl, cod: r.comanda.cod, total: r.comanda.total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ComandaError) return NextResponse.json({ ok: false, cod: e.cod, eroare: e.message }, { status: statusPentru(e) });
    console.error('[bilete/comanda]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
