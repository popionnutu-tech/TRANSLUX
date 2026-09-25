import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { verificaLuni, saptaminaLunii } from '@/lib/lde/luni-paznic';

// Paznicul rulării de luni (ION-62): ce n-a plecat din postere/indicații/rapoarte ajunge la ADMIN.
// Ion, 25.09: «dacă nu se trimit, îmi dai mie în bot». Îl cheamă lear-saptamanal.sh la sfârșit; luni seara
// îl cheamă și copy-assignments (dacă scriptul n-a pornit deloc). Fără dedup: două mesaje sunt mai bune
// decât niciunul, și pleacă doar când lipsește ceva.
//   ?dry=1 doar arată · ?saptamina=YYYY-MM-DD altă săptămână (implicit: cea a lui «ieri»)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = new URL(req.url).searchParams;
  const saptamina = saptaminaLunii(q.get('saptamina'));
  try {
    const r = await verificaLuni(saptamina, { dry: q.get('dry') === '1' });
    return NextResponse.json({ saptamina, ...r });
  } catch (e) {
    console.error('[luni-paznic]', e);
    return NextResponse.json({ error: 'Paznicul a eșuat' }, { status: 500 });
  }
}
