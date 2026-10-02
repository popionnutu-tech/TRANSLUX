import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyMaibCallback } from '@/lib/maib/signature';
import { stareEgala } from '@/lib/maib/client';

// Callback-ul maib Checkout (ION-188). Public — banca nu are sesiune la noi; autenticitatea e
// semnătura HMAC din X-Signature peste corpul brut + X-Signature-Timestamp (lib/maib/signature.ts).
//
// ORICE primire se scrie în maib_callbacks (și cele respinse), ca să putem arăta băncii exact ce a
// venit. Doar un callback valid atinge maib_checkouts. Idempotent: același callback de două ori
// scrie aceleași valori. checkoutId necunoscut → 200 (jurnalizat), ca banca să nu reîncerce la infinit.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const MAX_BODY = 20_000;

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
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function antete(req: NextRequest): Record<string, string | null> {
  return {
    'x-signature': req.headers.get('x-signature'),
    'x-signature-timestamp': req.headers.get('x-signature-timestamp'),
    'content-type': req.headers.get('content-type'),
    'user-agent': req.headers.get('user-agent'),
    'x-forwarded-for': req.headers.get('x-forwarded-for'),
  };
}

export async function POST(req: NextRequest) {
  const key = process.env.MAIB_SIGNATURE_KEY;
  if (!key) {
    console.error('[maib/callback] MAIB_SIGNATURE_KEY lipsește');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('x-signature');
  const ts = req.headers.get('x-signature-timestamp');
  const verdict = verifyMaibCallback(rawBody, sig, ts, key);

  let body: MaibCallbackBody | null = null;
  try { body = JSON.parse(rawBody) as MaibCallbackBody; } catch { body = null; }
  const checkoutId = body && typeof body.checkoutId === 'string' && UUID_RE.test(body.checkoutId) ? body.checkoutId : null;

  const supabase = getSupabase();
  const { error: jurnalErr } = await supabase.from('maib_callbacks').insert({
    checkout_id: checkoutId,
    semnatura_valida: verdict.ok,
    motiv: verdict.ok ? (body ? null : 'JSON nevalid') : verdict.motiv,
    headers: antete(req),
    body: rawBody.slice(0, MAX_BODY),
  });
  if (jurnalErr) console.error('[maib/callback] jurnal:', jurnalErr.message);

  if (!verdict.ok) {
    console.warn('[maib/callback] respins:', verdict.motiv);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false }, { status: 400 });
  if (!checkoutId) return NextResponse.json({ ok: false }, { status: 400 });

  const executat = stareEgala(body.paymentStatus, 'Executed');
  const { data, error } = await supabase
    .from('maib_checkouts')
    .update({
      status: executat ? 'Completed' : 'Failed',
      payment_id: body.paymentId && UUID_RE.test(body.paymentId) ? body.paymentId : null,
      payment_status: body.paymentStatus ?? null,
      callback: body,
      callback_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('checkout_id', checkoutId)
    .select('checkout_id');
  if (error) {
    console.error('[maib/callback] update:', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!data || data.length === 0) console.warn('[maib/callback] checkoutId necunoscut:', checkoutId);
  return NextResponse.json({ ok: true, cunoscut: Boolean(data && data.length) });
}
