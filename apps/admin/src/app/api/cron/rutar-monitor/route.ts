import { NextRequest, NextResponse } from 'next/server';
import { baltiChisinauFixedPrice } from '@translux/db';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins } from '@/lib/telegram-notify';
import { pretRuta, tarifeLaData } from '@/lib/price-popular';
import {
  RUTAR_BASE, caiPerechi, diferente, parseOrar, parsePereche, rezumat,
  type PretNostru, type RutarPereche, type RutarStare,
} from '@/lib/concurenta/rutar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Monitorul zilnic al rutar.md (Ion, 10.10.2026). Pornit de GitHub Actions (rutar-monitor.yml) dimineața devreme, înainte
// de prima cursă a zilei: paginile de pereche arată doar cursele rămase azi, iar la 05:00 sunt toate.
// Starea de ieri stă în bot_storage «concurenta:rutar»; mesajul pleacă la ADMIN doar când e ceva nou.
// Primul rulaj trimite un rezumat al ofertei, ca să se vadă că monitorul merge.

const CHEIE = 'concurenta:rutar';
// Ion, 10.10.2026: «acum lucrează doar cu Bălți Chișinău și Chișinău Bălți» — restul perechilor (Orhei) nu se urmăresc.
const URMARITE = new Set(['chisinau>balti', 'balti>chisinau']);
const urmarita = (cheie: string) => URMARITE.has(cheie.split(' ')[0]);

/** Doar perechile urmărite — și pentru starea de ieri, ca o pereche scoasă din listă să nu apară «dispărută». */
function filtreaza(s: RutarStare): RutarStare {
  return {
    la: s.la,
    curse: Object.fromEntries(Object.entries(s.curse ?? {}).filter(([k]) => urmarita(k))),
    perechi: Object.fromEntries(Object.entries(s.perechi ?? {}).filter(([k]) => urmarita(k))),
  };
}
const UA = 'Mozilla/5.0 (compatible; TRANSLUX-monitor/1.0)';

async function pagina(cale: string): Promise<string> {
  const r = await fetch(`${RUTAR_BASE}${cale}`, { headers: { 'User-Agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${cale}: HTTP ${r.status}`);
  return r.text();
}

const azi = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

/** Prețul nostru pe perechile Rutar, exact ca pe site (km × tariful zilei; Bălți → Chișinău fix din ION-165). */
async function preturileNoastre(chei: string[]): Promise<PretNostru> {
  const supabase = getSupabase();
  const zi = azi();
  const tarife = await tarifeLaData(zi);
  const km = new Map<string, any>();
  await Promise.all(chei.map(async (k) => {
    const [de, spre] = k.split('>');
    const { data } = await supabase
      .from('v_interurban_v2_km_pairs')
      .select('km, from_district, to_district, start_district')
      .eq('from_stop', de).eq('to_stop', spre)
      .order('km', { ascending: true }).limit(1);
    if (data?.[0]) km.set(k, { ...data[0], km: Number(data[0].km) });
  }));
  return (cheie, de, spre) => baltiChisinauFixedPrice(de, spre, zi) ?? pretRuta(km.get(cheie), tarife);
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const supabase = getSupabase();
  const { data: rand } = await supabase.from('bot_storage').select('value').eq('key', CHEIE).maybeSingle();
  const brut = (rand?.value ?? null) as (RutarStare & { eroare?: string }) | null;
  const ieri = brut ? { ...filtreaza(brut), eroare: brut.eroare } : null;

  let stare: RutarStare;
  try {
    const [orar, sitemap] = await Promise.all([pagina('/schedule'), pagina('/sitemap.xml')]);
    const curse = parseOrar(orar);
    if (!curse.length) throw new Error('/schedule: nicio cursă găsită (s-a schimbat structura site-ului?)');

    const perechi: Record<string, RutarPereche> = {};
    for (const cale of caiPerechi(sitemap).filter((c) => urmarita(c.split('/').filter(Boolean).map((x) => x.replace(/^moldova-/, '')).join('>')))) {
      const p = parsePereche(await pagina(cale));
      // Seara pagina poate fi goală (cursele zilei au trecut) — păstrăm ce știam, perechea tot e pe site.
      const [de, spre] = cale.split('/').filter(Boolean).map((s) => s.replace(/^moldova-/, ''));
      const k = p?.cheie ?? `${de}>${spre}`;
      perechi[k] = p ?? ieri?.perechi?.[k] ?? { cheie: k, de, spre, curse: 0, pretMin: null, pretMax: null, laSofer: false };
    }
    stare = filtreaza({ la: new Date().toISOString(), curse: Object.fromEntries(curse.map((c) => [c.cheie, c])), perechi });
  } catch (e: any) {
    const mesaj = String(e?.message ?? e);
    // O singură alertă pe defect, nu în fiecare zi.
    if (ieri && !ieri.eroare) {
      await alertAdmins(`⚠️ <b>Monitorul rutar.md nu poate citi site-ul</b>\n${mesaj.slice(0, 300)}`);
      await supabase.from('bot_storage').upsert({ key: CHEIE, value: { ...ieri, eroare: mesaj }, updated_at: new Date().toISOString() });
    }
    return NextResponse.json({ ok: false, eroare: mesaj }, { status: 502 });
  }

  const chei = [...new Set([...Object.keys(stare.perechi), ...Object.values(stare.curse).map((c) => c.cheie.split(' ')[0])])];
  const pretNostru = await preturileNoastre(chei);

  let text: string | null = null;
  if (!ieri) {
    text = `🚌 <b>Monitorul rutar.md a pornit</b> — verific zilnic, scriu doar când apare ceva nou.\nOferta lor azi:\n${rezumat(stare, pretNostru).join('\n')}`;
  } else {
    const dif = diferente(ieri, stare, pretNostru);
    if (dif.length) text = `🚌 <b>Rutar (rutar.md) — noutăți față de ieri</b>\n\n${dif.join('\n\n')}`;
    else if (ieri.eroare) text = '✅ Monitorul rutar.md citește din nou site-ul. Nimic nou în oferta lor.';
  }

  const trimis = text ? await alertAdmins(text) : null;
  // Starea se scrie doar dacă mesajul a plecat (sau n-a fost nevoie de el) — altfel mâine diferența se arată din nou.
  if (trimis !== false) {
    const { error } = await supabase.from('bot_storage').upsert({ key: CHEIE, value: stare, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, eroare: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true, curse: Object.keys(stare.curse).length, perechi: Object.keys(stare.perechi).length,
    mesaj: text ? (trimis ? 'trimis' : 'netrimis') : 'nimic nou',
  });
}
