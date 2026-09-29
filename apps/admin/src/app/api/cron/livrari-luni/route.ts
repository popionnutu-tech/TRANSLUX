import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { alertAdmins } from '@/lib/telegram-notify';
import { pregatestePostereLuni, saptaminaLuni, trimiteLivrariLuni } from '@/lib/lde/livrari-luni';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Posterele de luni (SEBN, Trox + Briceni, LEAR Ungheni, LEAR Florești) ca o singură postare în «Livrari Uzini»
 * (ION-139, Ion 29.09.2026). O cheamă lear-saptamanal.sh (VPS, luni 08:00) după analizele săptămânii, în locul
 * celor patru trimiteri separate. `?saptamina=2026-09-21` altă săptămână; `?force=1` retrimite; `?dry=1` doar spune
 * ce ar pleca; `?preview=1` → lista, `?preview=1&i=0` → PNG-ul posterului i, fără trimitere.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = new URL(req.url).searchParams;
  const cerut = q.get('saptamina');
  const s = saptaminaLuni(chisinauTodayIso(), cerut && DATE_RE.test(cerut) ? cerut : null);
  try {
    if (q.get('preview') === '1') {
      const { postere, sarite } = await pregatestePostereLuni(s.luni, s.duminica);
      const i = q.get('i');
      if (i != null && postere[Number(i)]) {
        return new NextResponse(new Uint8Array(postere[Number(i)].png), { headers: { 'Content-Type': 'image/png', 'X-Poster': postere[Number(i)].id } });
      }
      return NextResponse.json({ saptamina: s.luni, postere: postere.map((p) => ({ id: p.id, caption: p.caption, textDupa: p.textDupa ?? null })), sarite });
    }
    const r = await trimiteLivrariLuni({ luni: s.luni, duminica: s.duminica, force: q.get('force') === '1', dry: q.get('dry') === '1' });
    // ca până acum: un refuz real (nu dedup, nu dry) și posterele sărite din alt motiv decât «nimic de arătat» ajung la ADMIN
    if (r.status === 'error') await alertAdmins(`⛔ Livrări luni: albumul pentru săptămâna din ${s.luni} n-a plecat — ${r.motiv}`);
    // «raportul LEAR … nu e scris» îl anunță deja lde-timp-liber (textRaportLipsa) — nu de două ori
    const lipsa = r.sarite.filter((x) => !/^(nicio|nimic)/.test(x.motiv) && !/^raportul LEAR/.test(x.motiv));
    if (r.status !== 'skipped' || !/^(deja|dry)/.test(r.motiv ?? '')) {
      for (const x of lipsa) await alertAdmins(`⛔ Livrări luni: posterul ${x.id} pentru săptămâna din ${s.luni} lipsește din album — ${x.motiv}`);
    }
    return NextResponse.json(r, { status: r.status === 'error' ? 500 : 200 });
  } catch (e) {
    console.error('[livrari-luni]', e);
    await alertAdmins(`⛔ Livrări luni: albumul pentru săptămâna din ${s.luni} a picat — ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: 'Albumul de luni a eșuat' }, { status: 500 });
  }
}
