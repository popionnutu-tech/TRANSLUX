import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { parseWebhookPayload, verifySignature } from '@/lib/fb-bot/webhook-parser';
import { processEvent } from '@/lib/fb-bot/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  const expected = process.env.FB_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse('FB_VERIFY_TOKEN not configured', { status: 500 });
  }
  if (mode === 'subscribe' && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.FB_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: 'FB_APP_SECRET missing' }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, sig, appSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = parseWebhookPayload(payload as Parameters<typeof parseWebhookPayload>[0]);
  const supabase = getSupabase();

  const toProcess: typeof events = [];
  for (const ev of events) {
    const { error } = await supabase.from('fb_events').insert({
      event_id: ev.eventId,
      event_type: ev.eventType,
      page_id: ev.pageId,
      sender_id: ev.senderId,
      payload: ev.raw,
    });
    if (!error) {
      toProcess.push(ev);
    }
  }

  // Process synchronously so Vercel doesn't terminate background promises.
  // Claude with tool calling usually responds in 2-5s; Facebook allows 20s.
  await Promise.all(
    toProcess.map(ev =>
      processEvent(ev).catch(err => {
        console.error('processEvent failed', { eventId: ev.eventId, err });
      }),
    ),
  );

  return NextResponse.json({ received: events.length, accepted: toProcess.length });
}
