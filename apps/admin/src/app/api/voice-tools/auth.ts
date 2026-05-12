import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function validateVoiceApiKey(req: NextRequest): NextResponse | null {
  const key = req.headers.get('x-voice-api-key');
  const expected = process.env.VOICE_API_KEY;
  if (!expected || !key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
