import { NextRequest, NextResponse } from 'next/server';
import { authenticate, setSessionCookie } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';
import {
  FEREASTRA_BLOCARE_MS,
  ISTORIC_RETELE_ZILE,
  MAX_GRESELI_EMAIL,
  MAX_GRESELI_IP,
  greseliDupaUltimaReusita,
  greseliInFereastra,
  reteaDin,
  type EvenimentLogare,
} from '@/lib/login-guard';

// ION-126: fiecare încercare se scrie în admin_login_events (migr. 428). Din jurnal se calculează
// blocarea după parole greșite și semnalul «ADMIN dintr-o rețea nouă» (ajunge doar la Ion, 28.09).

type Motiv = 'ok' | 'parola' | 'necunoscut' | 'inactiv' | 'blocat_email' | 'blocat_ip';

function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  return xff || request.headers.get('x-real-ip')?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email și parolă sunt obligatorii' }, { status: 400 });
    }

    const db = getSupabase();
    const ip = clientIp(request);
    const retea = reteaDin(ip);
    const userAgent = request.headers.get('user-agent')?.slice(0, 400) || null;
    const tara = request.headers.get('x-vercel-ip-country');
    const orasRaw = request.headers.get('x-vercel-ip-city');
    const oras = orasRaw ? decodeURIComponent(orasRaw) : null;

    const scrie = async (motiv: Motiv, adminId: string | null) => {
      const { error } = await db.from('admin_login_events').insert({
        email: email.slice(0, 200), admin_id: adminId, ok: motiv === 'ok', motiv,
        ip, retea, user_agent: userAgent, tara, oras,
      });
      if (error) console.error('[login] jurnal:', error.message);
    };

    // Blocarea se verifică ÎNAINTEA parolei: altfel a 6-a încercare tot ar spune dacă parola e bună.
    const acum = Date.now();
    const deLa = new Date(acum - FEREASTRA_BLOCARE_MS).toISOString();
    const [peEmail, peIp] = await Promise.all([
      db.from('admin_login_events').select('created_at, ok, motiv').eq('email', email).gte('created_at', deLa).limit(200),
      ip
        ? db.from('admin_login_events').select('created_at, ok, motiv').eq('ip', ip).eq('ok', false).gte('created_at', deLa).limit(200)
        : Promise.resolve({ data: [] as EvenimentLogare[] }),
    ]);
    if (greseliDupaUltimaReusita((peEmail.data || []) as EvenimentLogare[], acum) >= MAX_GRESELI_EMAIL) {
      await scrie('blocat_email', null);
      return NextResponse.json({ error: 'Prea multe încercări greșite. Încearcă peste 15 minute.' }, { status: 429 });
    }
    if (greseliInFereastra((peIp.data || []) as EvenimentLogare[], acum) >= MAX_GRESELI_IP) {
      await scrie('blocat_ip', null);
      return NextResponse.json({ error: 'Prea multe încercări greșite. Încearcă peste 15 minute.' }, { status: 429 });
    }

    const rez = await authenticate(email, password);
    if (!rez.ok) {
      await scrie(rez.motiv, rez.adminId);
      await new Promise(r => setTimeout(r, 1000));
      return NextResponse.json({ error: 'Email sau parolă incorectă' }, { status: 401 });
    }

    const { admin, token } = rez;
    // Semnalul se decide pe istoricul DE DINAINTE de rândul de acum.
    if (admin.role === 'ADMIN' && retea) {
      const deLa90 = new Date(acum - ISTORIC_RETELE_ZILE * 86_400_000).toISOString();
      const { data: istoric } = await db
        .from('admin_login_events')
        .select('retea')
        .eq('admin_id', admin.id)
        .eq('ok', true)
        .gte('created_at', deLa90)
        .limit(500);
      const retele = new Set((istoric || []).map(r => r.retea));
      // Fără istoric (prima logare după migrație) tăcem: altfel primul semnal ar fi pentru fiecare cont.
      if (retele.size > 0 && !retele.has(retea)) {
        const loc = [oras, tara].filter(Boolean).join(', ');
        await alertAdmins(
          `🔐 <b>Logare ADMIN dintr-o rețea nouă</b>\n` +
          `${escapeHtml(admin.email)}\n` +
          `IP ${escapeHtml(ip || '?')}${loc ? ` (${escapeHtml(loc)})` : ''}\n` +
          `${escapeHtml((userAgent || 'browser necunoscut').slice(0, 160))}\n\n` +
          `Dacă nu e cineva cunoscut: /users → «Închide sesiunile» și schimbă parola.`,
        );
      }
    }
    await scrie('ok', admin.id);

    const response = NextResponse.json({ success: true, role: admin.role });
    response.cookies.set(setSessionCookie(token));
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Eroare internă' }, { status: 500 });
  }
}
