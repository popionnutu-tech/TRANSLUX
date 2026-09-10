import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { sendGraficImageToGroup } from '@/lib/grafic-group-sync';
import { alertAdmins } from '@/lib/telegram-notify';
import { ziuaRo } from '@/lib/grafic-group';

// Graficul de MÂINE pleacă singur în grupa Mejgorod, o dată pe zi (Ion, 10.09:
// «zilnic așa să se posteze în grupă»). Până acum pleca doar la bifa
// dispecerului. Dispecerii completează graficul de mâine între ~11:00 și ~12:30
// (07–10.09), deci cronul bate la 13:30 Chișinău: dacă ziua a fost deja bifată,
// nu face nimic — urmărirea schimbărilor e pornită; dacă nu, trimite albumul
// (tur + plecările din Chișinău) și pornește urmărirea, ca după bifă.
//
// NU e cron Vercel (planul Hobby are loc doar pentru două): îl cheamă GitHub
// Actions, .github/workflows/grafic-grupa.yml, cu CRON_SECRET ca restul.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function maineChisinau(): string {
  const azi = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const [y, m, d] = azi.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const ziua = req.nextUrl.searchParams.get('date') || maineChisinau();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ziua)) {
    return NextResponse.json({ error: 'date invalid' }, { status: 400 });
  }

  const { data: post } = await getSupabase()
    .from('grafic_group_posts')
    .select('send_count')
    .eq('ziua', ziua)
    .maybeSingle();
  if (post) {
    return NextResponse.json({ status: 'skipped', reason: 'deja trimis', ziua, send_count: post.send_count });
  }

  const res = await sendGraficImageToGroup(ziua, { manual: true, sentBy: null });
  if (res.error) {
    // Graficul gol la ora asta e o zi în care șoferii nu află nimic — Ion
    // trebuie să știe acum, nu mâine dimineață.
    await alertAdmins(
      `⚠️ Graficul pentru <b>${ziuaRo(ziua)}</b> nu s-a postat în grupa Mejgorod.\n${res.error}`,
    );
    return NextResponse.json({ status: 'error', ziua, error: res.error }, { status: 200 });
  }
  return NextResponse.json({ status: 'sent', ziua });
}
