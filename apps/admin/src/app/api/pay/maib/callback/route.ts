import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyMaibCallback } from '@/lib/maib/signature';
import { stareEgala } from '@/lib/maib/client';

// Callback-ul maib Checkout (ION-188). Public (lib/public-paths.ts) — banca nu are sesiune la noi;
// autenticitatea e semnătura HMAC din X-Signature peste corpul brut + X-Signature-Timestamp
// (lib/maib/signature.ts).
//
// ORICE primire se scrie în maib_callbacks (și cele respinse — doar începutul corpului), ca să
// putem arăta băncii exact ce a venit. Doar un callback valid atinge maib_checkouts, și doar
// înainte: Completed nu se întoarce în Failed, o plată cu refund nu redevine «Executed», iar un
// callback a cărui sumă / comandă nu bate cu rândul se jurnalizează și NU se aplică. Idempotent.
// checkoutId necunoscut → 200 (jurnalizat), ca banca să nu reîncerce la infinit.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** Un callback real are ~1 KB; peste atât e altceva. Refuzăm înainte să citim corpul. */
const MAX_BODY = 16_384;
/** Din corpurile RESPINSE păstrăm doar începutul: jurnalul nu trebuie să devină groapa oricui. */
const MAX_BODY_RESPINS = 512;

interface MaibCallbackBody {
  checkoutId?: string;
  orderId?: string | null;
  amount?: number;
  currency?: string;
  completedAt?: string;
  paymentId?: string;
  paymentAmount?: number;
  paymentStatus?: string;
  paymentExecutedAt?: string;
  paymentMethod?: string | null;
  // date personale pe care NU le copiem în maib_checkouts (rămân doar în jurnalul brut)
  senderIban?: unknown; senderName?: unknown; payerEmail?: unknown; payerPhone?: unknown; payerIp?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function antete(req: NextRequest): Record<string, string | null> {
  return {
    'x-signature': req.headers.get('x-signature'),
    'x-signature-timestamp': req.headers.get('x-signature-timestamp'),
    'content-type': req.headers.get('content-type'),
    'content-length': req.headers.get('content-length'),
    'user-agent': req.headers.get('user-agent'),
    'x-forwarded-for': req.headers.get('x-forwarded-for'),
  };
}

/** Ce păstrăm din callback în maib_checkouts: fără IBAN, nume, e-mail, telefon, IP (Legea 195). */
function faraDatePersonale(b: MaibCallbackBody): Record<string, unknown> {
  const { senderIban: _i, senderName: _n, payerEmail: _e, payerPhone: _p, payerIp: _ip, ...rest } = b as Record<string, unknown> & MaibCallbackBody;
  void _i; void _n; void _e; void _p; void _ip;
  return rest;
}

async function jurnal(req: NextRequest, checkoutId: string | null, valid: boolean, motiv: string | null, body: string) {
  const { error } = await getSupabase().from('maib_callbacks').insert({
    checkout_id: checkoutId,
    semnatura_valida: valid,
    motiv,
    headers: antete(req),
    body: body.slice(0, valid ? MAX_BODY : MAX_BODY_RESPINS),
  });
  if (error) console.error('[maib/callback] jurnal:', error.message);
}

export async function POST(req: NextRequest) {
  const key = process.env.MAIB_SIGNATURE_KEY;
  if (!key) {
    console.error('[maib/callback] MAIB_SIGNATURE_KEY lipsește');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const lungime = Number(req.headers.get('content-length') ?? '0');
  if (lungime > MAX_BODY) {
    await jurnal(req, null, false, `corp prea mare (${lungime} B)`, '');
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY) {
    await jurnal(req, null, false, `corp prea mare (${rawBody.length} car.)`, '');
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const verdict = verifyMaibCallback(rawBody, req.headers.get('x-signature'), req.headers.get('x-signature-timestamp'), key);

  let body: MaibCallbackBody | null = null;
  try { body = JSON.parse(rawBody) as MaibCallbackBody; } catch { body = null; }
  if (body !== null && (typeof body !== 'object' || Array.isArray(body))) body = null;
  const checkoutId = body && typeof body.checkoutId === 'string' && UUID_RE.test(body.checkoutId) ? body.checkoutId : null;

  if (!verdict.ok) {
    await jurnal(req, checkoutId, false, verdict.motiv, rawBody);
    console.warn('[maib/callback] respins:', verdict.motiv);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!body || !checkoutId) {
    await jurnal(req, checkoutId, true, body ? 'fără checkoutId valid' : 'JSON nevalid', rawBody);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: rand, error: citire } = await supabase
    .from('maib_checkouts')
    .select('checkout_id, order_id, amount, currency, status, payment_status, refund_id')
    .eq('checkout_id', checkoutId)
    .maybeSingle();
  if (citire) {
    await jurnal(req, checkoutId, true, `citire: ${citire.message}`, rawBody);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!rand) {
    await jurnal(req, checkoutId, true, 'checkoutId necunoscut', rawBody);
    console.warn('[maib/callback] checkoutId necunoscut:', checkoutId);
    return NextResponse.json({ ok: true, cunoscut: false });
  }

  // Suma și comanda semnate de bancă trebuie să fie ale rândului nostru; altfel nu aplicăm nimic.
  const nepotriviri: string[] = [];
  if (typeof body.amount === 'number' && Math.abs(body.amount - Number(rand.amount)) >= 0.005) nepotriviri.push(`sumă ${body.amount} ≠ ${rand.amount}`);
  if (body.currency && rand.currency && body.currency !== rand.currency) nepotriviri.push(`valută ${body.currency} ≠ ${rand.currency}`);
  if (body.orderId && body.orderId !== rand.order_id) nepotriviri.push(`comandă ${body.orderId} ≠ ${rand.order_id}`);
  if (nepotriviri.length) {
    await jurnal(req, checkoutId, true, `neaplicat: ${nepotriviri.join('; ')}`, rawBody);
    console.error('[maib/callback] nepotrivire:', checkoutId, nepotriviri.join('; '));
    return NextResponse.json({ ok: true, aplicat: false });
  }

  const executat = stareEgala(body.paymentStatus, 'Executed');
  const dejaCompleta = stareEgala(rand.status, 'Completed');
  const areRefund = Boolean(rand.refund_id);
  const upd: Record<string, unknown> = {
    callback: faraDatePersonale(body),
    callback_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!dejaCompleta) upd.status = executat ? 'Completed' : 'Failed'; // doar înainte: Completed nu se mai întoarce
  if (body.paymentId && UUID_RE.test(body.paymentId) && !areRefund) upd.payment_id = body.paymentId;
  if (body.paymentStatus && !(areRefund && executat)) upd.payment_status = body.paymentStatus; // după refund nu redevine Executed

  await jurnal(req, checkoutId, true, null, rawBody);
  const { error } = await supabase.from('maib_checkouts').update(upd).eq('checkout_id', checkoutId);
  if (error) {
    console.error('[maib/callback] update:', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cunoscut: true, aplicat: true });
}
