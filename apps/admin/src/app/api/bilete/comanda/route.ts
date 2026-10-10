import { NextRequest, NextResponse } from 'next/server';
import { ComandaError, creeazaComanda, statusPentru, type ComandaInput } from '@/lib/bilete/comenzi';
import { cheieSiteValida } from '@/lib/bilete/site-auth';
import { telegramDinInitData } from '@/lib/bilete/client-bilete';
import { getSupabase } from '@/lib/supabase';

// POST /api/bilete/comanda — site-ul (translux.md, server action) creează comanda și primește adresa de plată.
// Public în middleware (cale EXACTĂ), apărat prin BILETE_API_KEY (≥ 256 biți, doar pe server, separată de
// celelalte chei). Plafoanele sunt în bază (migr. 483), nu în memoria instanței.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Bugetul: token + creare (+ reîmprospătare la 401) × 8 s + căutarea sesiunii + baza — încape în 60 s (Codex X9).
export const maxDuration = 60;

function locuriDin(v: unknown): number[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return [NaN];
  return v.slice(0, 8).map((x) => (typeof x === 'number' ? x : (typeof x === 'string' && /^\d{1,2}$/.test(x) ? Number(x) : NaN)));
}

function returDin(v: unknown): ComandaInput['retur'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const zi = String(o.tripDate ?? ''), cheie = String(o.idempotencyKey ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(zi) || !/^[0-9a-f-]{36}$/i.test(cheie) || !Number.isInteger(Number(o.crmRouteId))) return null;
  return { tripDate: zi, crmRouteId: Number(o.crmRouteId), goingNorth: o.goingNorth === true, fromRo: String(o.fromRo ?? '').slice(0, 80), toRo: String(o.toRo ?? '').slice(0, 80), idempotencyKey: cheie, locuriAlese: locuriDin(o.locuriAlese) };
}

function bazaAdmin(req: NextRequest): string {
  const fix = process.env.MAIB_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (fix) return fix;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'central-hub-md.vercel.app';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  if (!cheieSiteValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });

  let body: Partial<ComandaInput> & { ip_hash?: string; locuri_alese?: unknown; cod_retur?: unknown; student_jeton?: unknown; retur?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, eroare: 'JSON nevalid' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, eroare: 'corp lipsă' }, { status: 400 });

  const input: ComandaInput = {
    tripDate: String(body.tripDate ?? ''),
    crmRouteId: Number(body.crmRouteId),
    goingNorth: body.goingNorth === true, // nu Boolean(): «false» ca text ar fi devenit true
    fromRo: String(body.fromRo ?? '').slice(0, 80),
    toRo: String(body.toRo ?? '').slice(0, 80),
    seats: Number(body.seats),
    passengerName: String(body.passengerName ?? ''),
    phone: String(body.phone ?? ''),
    email: body.email ? String(body.email).slice(0, 120) : null,
    lang: body.lang === 'ru' ? 'ru' : 'ro',
    idempotencyKey: String(body.idempotencyKey ?? ''),
    ipHash: body.ipHash ? String(body.ipHash).slice(0, 64) : (body.ip_hash ? String(body.ip_hash).slice(0, 64) : null),
    // doar un întreg (număr sau text de cifre); orice altceva (true, [5], «abc») → validare în alegePunct
    punctUrcareId: body.punctUrcareId == null || body.punctUrcareId === ('' as unknown) ? null
      : (typeof body.punctUrcareId === 'number' || (typeof body.punctUrcareId === 'string' && /^\d{1,12}$/.test(body.punctUrcareId)) ? Number(body.punctUrcareId) : -1),
    // ION-239: locurile alese pe hartă (retur) — `locuriAlese` sau `locuri_alese`; lipsă/gol → automat. Orice element
    // ne-număr devine NaN și cade la validare (valideazaLocuriAlese).
    locuriAlese: locuriDin(body.locuriAlese ?? body.locuri_alese),
    // 546 (Codex r2 C1): promoțiile — fără ele aici, câmpurile s-ar pierde și s-ar plăti prețul întreg.
    codRetur: typeof body.codRetur === 'string' && /^[0-9a-f]{64}$/.test(body.codRetur) ? body.codRetur
      : (typeof body.cod_retur === 'string' && /^[0-9a-f]{64}$/.test(body.cod_retur) ? body.cod_retur : null),
    // 548: returul din pachet (o singură plată cu turul); forma se verifică aici, restul în creeazaComanda.
    retur: returDin(body.retur),
    studentJeton: typeof body.studentJeton === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(body.studentJeton) ? body.studentJeton
      : (typeof body.student_jeton === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(body.student_jeton) ? body.student_jeton : null),
  };

  const siteUrl = (process.env.SITE_URL || 'https://translux.md').replace(/\/+$/, '');
  try {
    const r = await creeazaComanda(input, { mod: 'public', bazaAdmin: bazaAdmin(req), bazaSite: siteUrl, createdBy: 'site' });
    // ION-249: cumpărat din mini app-ul Telegram → comanda se leagă de cont acum (biletul apare în «Biletele mele» și
    // în bot fără alt pas). Contul vine DOAR din initData verificat cu tokenul botului; doar o comandă încă nelegată.
    const tg = telegramDinInitData(req.headers.get('x-telegram-init-data'), process.env.TELEGRAM_BOT_TOKEN, Date.now());
    if (tg) {
      const { error: eL } = await getSupabase().from('bilete_comenzi')
        .update({ telegram_id: tg, telegram_verificat_pentru: tg }).eq('id', r.comanda.id).is('telegram_id', null);
      if (eL) console.warn('[bilete/comanda] legarea Telegram:', eL.message);
    }
    return NextResponse.json({ ok: true, checkoutUrl: r.checkoutUrl, cod: r.comanda.cod, total: r.comanda.total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // ION-239: la loc_ocupat răspunsul duce și lista locurilor luate (formularul le marchează și cere altă alegere).
    if (e instanceof ComandaError) return NextResponse.json({ ok: false, cod: e.cod, eroare: e.cod === 'loc_ocupat' ? 'loc_ocupat' : e.message, ...(e.cod === 'loc_ocupat' ? { ocupate: e.ocupate, mesaj: e.message } : {}) }, { status: statusPentru(e) });
    console.error('[bilete/comanda]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
