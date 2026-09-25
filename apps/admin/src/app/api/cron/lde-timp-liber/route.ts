import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins } from '@/lib/telegram-notify';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { textTimpLiber, textRaportLipsa } from '@/lib/lde/timp-liber';
import { trimitePosterLear } from '@/lib/lde/lear-optimizari-image';
import { indicatiiLear, trimiteIndicatii } from '@/lib/lde/indicatii-alexei';
import type { MasinaRand, Raport } from '@/app/(dashboard)/lde/reguli/actions';

// Rularea de luni pe fiecare uzină LEAR: posterul «cât se putea economisi» în grupa livrărilor, indicațiile
// pentru Alexei în aceeași grupă (ION-62), mesajul către ADMIN cu mașinile peste prag în timpul liber (ION-57).
//
// Ion, 24.09: «am nevoie automatizat, nu manual să mă uit». Ruta citește ultimul raport din
// lde_analiza_reguli (îl scrie lear-analiza.mjs, luni 08:00, pe VPS). Nu are cron propriu: o cheamă
// lear-saptamanal.sh imediat după ce raportul e scris — un cron separat putea porni înaintea lui.
// SEBN are ruta lui, /api/cron/sebn-optimizari (posterul cu întrebarea sub el).
//
// Dedup: rândul raportului ține `alerta_trimisa_la`. Rândul se REVENDICĂ înainte de trimitere
// (un singur UPDATE, atomic), ca două apeluri apropiate să nu trimită amândouă; un raport rescris
// după mesaj (rulat_la mai nou) redeschide trimiterea. `dry=1` nu scrie nimic; `force=1` sare
// revendicarea, dar scrie coloana după trimitere. Posterul și indicațiile au dedupurile lor în app_config
// (o săptămână pe uzină); `poster=force`, `indicatii=force` le retrimit.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/lde-timp-liber
// Verificare fără trimitere: ?dry=1 · altă săptămână: ?saptamina=YYYY-MM-DD · Florești: ?uz=floresti

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Ion, 25.09 (ION-59): «postează și pe LEAR Florești, în fiecare luni» — aceeași rută, `?uz=floresti`;
// lear-saptamanal.sh o cheamă o dată pentru fiecare uzină, după ce raportul ei e scris.
const UZINE: Record<string, { nume: string; uz: string }> = {
  lear: { nume: 'LEAR Ungheni', uz: '' },
  floresti: { nume: 'LEAR Florești', uz: 'floresti' },
};
const BASE = process.env.ADMIN_BASE_URL ?? 'https://central-hub-md.vercel.app';

// săptămâna pe care o scrie rularea de luni: cea a lui «ieri» (aceeași regulă ca în worker)
function saptaminaAsteptata(): string {
  const d = new Date(`${chisinauTodayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

type Rand = { id: string; saptamina: string; rulat_la: string; alerta_trimisa_la: string | null; date: Pick<Raport, 'pana_la' | 'masini' | 'timp_liber'> };
type Trimitere = { trimis: boolean; motiv?: string; text?: string };

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const force = url.searchParams.get('force') === '1';
  const cerut = url.searchParams.get('saptamina') ?? '';
  const saptamina = DATE_RE.test(cerut) ? cerut : saptaminaAsteptata();
  const U = UZINE[url.searchParams.get('uz') ?? 'lear'] ?? UZINE.lear;
  const UZINA = U.nume;

  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('lde_analiza_reguli')
      .select('id, saptamina, rulat_la, alerta_trimisa_la, date')
      .eq('uzina', UZINA).eq('saptamina', saptamina).maybeSingle();
    if (error) {
      console.error('[timp-liber]', error.message);
      return NextResponse.json({ error: 'Nu am putut citi raportul' }, { status: 500 });
    }
    if (!data) {
      // raportul lipsă e el însuși știrea; fără dedup — cronul cheamă ruta o dată pe săptămână
      const text = textRaportLipsa(saptamina, UZINA);
      const trimis = dry ? false : await alertAdmins(text);
      return NextResponse.json({ saptamina, raport: false, trimis, dry, text: dry ? text : undefined }, { status: dry ? 200 : 502 });
    }
    const row = data as Rand;
    const inca = (e: unknown): Trimitere => ({ trimis: false, motiv: String(e) });
    // Posterul «cât se putea economisi» pleacă în grupa livrărilor de uzină, o dată pe săptămână (Ion, 25.09),
    // apoi indicațiile pentru Alexei (ION-62) — după poster, niciodată înaintea lui; amândouă independente
    // de mesajul către ADMIN de mai jos.
    const raport = { saptamina: row.saptamina, pana_la: row.date.pana_la, masini: row.date.masini ?? [] };
    const poster: Trimitere = await trimitePosterLear(raport, { dry, force: url.searchParams.get('poster') === 'force', uzina: UZINA }).catch(inca);
    const indicatii: Trimitere = await trimiteIndicatii(U.uz, row.saptamina, indicatiiLear(raport, U, BASE),
      { dry, force: url.searchParams.get('indicatii') === 'force' }).catch(inca);
    // Ion, 25.09: «dacă nu se trimit, îmi dai mie în bot» — un refuz real (nu dedup, nu «nimic de arătat») ajunge la ADMIN pe loc
    const refuz = (t: Trimitere) => !t.trimis && !!t.motiv && !/^(deja trimis|dry|nimic|nicio)/.test(t.motiv);
    if (!dry) for (const [ce, t] of [['posterul', poster], ['indicațiile', indicatii]] as const) {
      if (refuz(t)) await alertAdmins(`⛔ ${UZINA}: ${ce} pentru săptămâna din ${row.saptamina} n-au plecat — ${t.motiv}`);
    }
    const TL = row.date?.timp_liber ?? null;
    const masini = (row.date?.masini ?? []) as Pick<MasinaRand, 'masina' | 'liber'>[];
    const text = TL ? textTimpLiber(row.saptamina, row.date.pana_la, masini, TL.prag_km, BASE, U) : null;
    const eligibil = !row.alerta_trimisa_la || row.alerta_trimisa_la < row.rulat_la;
    if (dry) return NextResponse.json({ saptamina, raport: true, detector: !!TL, eligibil, trimis: false, dry, text: text ?? '(nimic peste prag — tăcere)', poster, indicatii });
    if (!text) return NextResponse.json({ saptamina, raport: true, detector: !!TL, trimis: false, motiv: TL ? 'nimic peste prag' : 'raport fără detector', poster, indicatii });
    if (!eligibil && !force) return NextResponse.json({ saptamina, raport: true, trimis: false, deja_trimis: true, alerta_trimisa_la: row.alerta_trimisa_la, poster, indicatii });

    // revendicarea: un singur UPDATE, cu versiunea citită; zero rânduri = altcineva a luat-o
    const acum = new Date().toISOString();
    let revendicat = force;
    if (!force) {
      const q = sb.from('lde_analiza_reguli').update({ alerta_trimisa_la: acum })
        .eq('id', row.id).eq('rulat_la', row.rulat_la)
        .or(`alerta_trimisa_la.is.null,alerta_trimisa_la.lt."${row.rulat_la}"`)
        .select('id');
      const { data: luat, error: e2 } = await q;
      if (e2) { console.error('[timp-liber] revendicare:', e2.message); return NextResponse.json({ error: 'Revendicarea a picat' }, { status: 500 }); }
      revendicat = (luat?.length ?? 0) > 0;
    }
    if (!revendicat) return NextResponse.json({ saptamina, raport: true, trimis: false, deja_trimis: true, poster, indicatii });

    const trimis = await alertAdmins(text);
    if (!trimis) {
      // mesajul n-a plecat: coloana revine la ce era, condiționat, ca să nu ștergem revendicarea altcuiva
      await sb.from('lde_analiza_reguli').update({ alerta_trimisa_la: row.alerta_trimisa_la })
        .eq('id', row.id).eq('alerta_trimisa_la', acum);
      return NextResponse.json({ saptamina, raport: true, trimis: false, motiv: 'alertAdmins a întors false', poster, indicatii }, { status: 502 });
    }
    if (force) await sb.from('lde_analiza_reguli').update({ alerta_trimisa_la: acum }).eq('id', row.id);
    return NextResponse.json({ saptamina, raport: true, trimis: true, masini: TL?.masini_peste_prag ?? [], poster, indicatii });
  } catch (e) {
    console.error('[timp-liber]', e);
    return NextResponse.json({ error: 'Mesajul a eșuat' }, { status: 500 });
  }
}
