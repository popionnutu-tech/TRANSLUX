import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins } from '@/lib/telegram-notify';
import { saptaminaLunii } from '@/lib/lde/luni-paznic';
import { textTimpLiber } from '@/lib/lde/timp-liber';
import { trimiteIndicatii } from '@/lib/lde/indicatii-alexei';
import { esteAnalizaDrax, indicatiiDrax, masiniLiber, RIND_DRAX, UZINA_DRAX } from '@/lib/lde/drax-analiza';
import { generateDraxOptimizariImage, trimitePosterDrax } from '@/lib/lde/drax-optimizari-image';
import { trimiteOdata } from '@/lib/lde/revendicare-alerta';
import { laRaspuns, ruleaza, type RandDrax } from '@/lib/lde/drax-ruta';

// Analiza săptămânală Drăxlmaier Bălți (ION-94, F3 din ION-86). Rândul «DRAXELMAIER» îl scrie luni VPS-ul
// (drax/cod/saptamanal/saptamanal.sh). Ion, 26.09 (decizia 1): posterul, indicațiile și mesajul ADMIN se scriu, dar NU pleacă
// până la «da»-ul lui; fiecare are comutatorul lui, și nimic nu cheamă ruta cu el (lear-saptamanal.sh cheamă doar ?liber=1&dry=1).
//   implicit          → imaginea PNG a posterului, nimic trimis, nimic scris
//   ?poster=1         → posterul în grupa livrărilor (o dată pe săptămână; &force=1 retrimite)
//   ?indicatii=1      → indicațiile pentru dispecer (§12), în aceeași grupă
//   ?liber=1          → mesajul de timp liber către ADMIN (§11.10), cu revendicarea pe alerta_trimisa_la
//   &dry=1            → cu oricare mod: textul întors, nimic trimis, nimic scris
//   ?saptamina=YYYY-MM-DD → săptămâna zilei date (orice zi → lunea ei); fără el, săptămâna lui «ieri»
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/drax-optimizari -o poster.png
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = process.env.ADMIN_BASE_URL ?? 'https://central-hub-md.vercel.app';

async function citesteRand(saptamina: string): Promise<RandDrax | null> {
  const { data, error } = await getSupabase().from('lde_analiza_reguli')
    .select('id, saptamina, rulat_la, alerta_trimisa_la, date')
    .eq('uzina', RIND_DRAX).eq('saptamina', saptamina).maybeSingle();
  if (error) throw new Error(`lde_analiza_reguli: ${error.message}`);
  if (!data) return null;
  if (!esteAnalizaDrax(data.date)) throw new Error(`rândul DRAXELMAIER ${saptamina} nu are forma Drăxlmaier`);
  return data as RandDrax;
}

export async function GET(req: NextRequest) {
  const r = await ruleaza(req, {
    verifyCronSecret: () => verifyCronSecret(req),
    saptaminaLunii,
    citesteRand,
    imagine: generateDraxOptimizariImage,
    trimitePoster: (a, o) => trimitePosterDrax(a, o),
    indicatii: (a) => indicatiiDrax(a, BASE),
    trimiteIndicatii: (a, text, o) => trimiteIndicatii(UZINA_DRAX.uz, a.saptamina, text, o),
    textTimpLiber: (rand) => textTimpLiber(rand.saptamina, rand.date.pana_la, masiniLiber(rand.date), rand.date.timp_liber.prag_km, BASE, UZINA_DRAX),
    trimiteOdata: (rand, text, o) => trimiteOdata(getSupabase(), rand, text, alertAdmins, o),
    logEroare: (e, x) => console.error(e, x),
  });
  return laRaspuns(r, NextResponse);
}
