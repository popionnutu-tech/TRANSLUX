import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { efectEveniment, verificaWebhookResend } from '@/lib/resend/webhook-semnatura';

// Webhook-ul Resend (ION-250): Resend anunță ce s-a întâmplat cu e-mailul biletului. Respins (bounce), marcat spam
// sau eșuat → `email_eroare` pe comandă + alertă `email_esuat` (o dată), care ajunge la Ion prin împăcarea de 10 min
// (ION-207). Livrat → `email_livrat_la`. Public în middleware (exact); se apără prin semnătura Svix
// (RESEND_WEBHOOK_SECRET). Evenimentele mesajelor care nu sunt bilete (probe, anulări) se ignoră.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CORP = 64 * 1024;

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 500 });
  const corp = await req.text();
  if (corp.length > MAX_CORP) return NextResponse.json({ ok: false }, { status: 413 });
  const valid = verificaWebhookResend({
    corp,
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    semnatura: req.headers.get('svix-signature'),
    secret,
    nowMs: Date.now(),
  });
  if (!valid) return NextResponse.json({ ok: false }, { status: 401 });

  let ev: { type?: string; data?: { email_id?: string; bounce?: { message?: string; type?: string } | null } };
  try { ev = JSON.parse(corp); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const emailId = ev.data?.email_id;
  const efect = efectEveniment(String(ev.type ?? ''), ev.data);
  if (!emailId || efect.fel === 'ignorat') return NextResponse.json({ ok: true, aplicat: false });

  const db = getSupabase();
  const { data: c, error } = await db.from('bilete_comenzi').select('id').eq('email_resend_id', emailId).maybeSingle();
  if (error) return NextResponse.json({ ok: false }, { status: 500 }); // Resend reîncearcă
  if (!c) return NextResponse.json({ ok: true, aplicat: false });

  if (efect.fel === 'livrat') {
    await db.from('bilete_comenzi').update({ email_livrat_la: new Date().toISOString() }).eq('id', c.id).is('email_livrat_la', null);
    return NextResponse.json({ ok: true, aplicat: true });
  }

  await db.from('bilete_comenzi').update({ email_eroare: efect.motiv.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', c.id);
  const { data: exista } = await db.from('bilete_alerte').select('id').eq('comanda_id', c.id).eq('tip', 'email_esuat').limit(1);
  if (!exista || exista.length === 0) {
    await db.from('bilete_alerte').insert({ comanda_id: c.id, tip: 'email_esuat', detalii: `biletul pe e-mail: ${efect.motiv}`.slice(0, 500) });
  }
  return NextResponse.json({ ok: true, aplicat: true });
}
