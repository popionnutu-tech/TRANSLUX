// Logica rutei /api/cron/drax-optimizari (ION-94, F3), cu dependențele injectate, ca să se poată testa fără Next, Supabase sau
// Telegram (route.ts doar le leagă). ORDINEA (criticul Codex C1): verifyCronSecret e PRIMUL pas — înaintea lui modDrax, a oricărei
// citiri, trimiteri sau revendicări, și în afara try/catch. Middleware-ul lasă /api/cron/ fără sesiune (public-paths.ts), deci
// ruta se apără singură (ca briceni-optimizari).
import { modDrax, type AnalizaDrax } from './drax-analiza';

export type RaspunsDrax = { status: number; png?: Buffer; body?: unknown };
export type RandDrax = { id: string; saptamina: string; rulat_la: string; alerta_trimisa_la: string | null; date: AnalizaDrax };

export interface DepsDrax<A> {
  verifyCronSecret: (req: { url: string; headers: Headers }) => A | null;
  saptaminaLunii: (cerut?: string | null) => string;
  citesteRand: (saptamina: string) => Promise<RandDrax | null>;
  imagine: (a: AnalizaDrax) => Promise<Buffer>;
  trimitePoster: (a: AnalizaDrax, o: { force: boolean }) => Promise<unknown>;
  indicatii: (a: AnalizaDrax) => string | null;
  trimiteIndicatii: (a: AnalizaDrax, text: string | null, o: { force: boolean }) => Promise<unknown>;
  textTimpLiber: (r: RandDrax) => string | null;
  trimiteOdata: (r: RandDrax, text: string, o: { force: boolean }) => Promise<unknown>;
  logEroare?: (eticheta: string, e: unknown) => void;
}

/** adaptorul spre NextResponse: PNG cu no-store, JSON cu status; răspunsul lui verifyCronSecret trece neatins */
export function laRaspuns<N>(r: RaspunsDrax | N, NR: { new (b: BodyInit | null, i?: ResponseInit): N; json(b: unknown, i?: ResponseInit): N }): N {
  const Ctor = NR as unknown as new (...a: never[]) => object;
  if (r instanceof Ctor) return r as N;
  const x = r as RaspunsDrax;
  if (x.png) return new NR(new Uint8Array(x.png), { status: x.status, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  return NR.json(x.body, { status: x.status });
}

export async function ruleaza<A>(req: { url: string; headers: Headers }, d: DepsDrax<A>): Promise<RaspunsDrax | A> {
  const auth = d.verifyCronSecret(req);          // 1. autentificarea — nimic nu se atinge înainte
  if (auth) return auth;
  try { return await autentificat(req, d); }
  catch (e) { d.logEroare?.('[drax-optimizari]', e); return { status: 500, body: { error: 'Ruta Drăxlmaier a eșuat' } }; }
}

async function autentificat<A>(req: { url: string }, d: DepsDrax<A>): Promise<RaspunsDrax> {
  const q = new URL(req.url).searchParams;
  const m = modDrax(q);                           // 2. modul (400 pe combinații nevalide), fără bază
  if (m.tip === 'eroare') return { status: 400, body: { error: m.motiv } };
  const saptamina = d.saptaminaLunii(q.get('saptamina'));   // orice zi → lunea ei; fără parametru, săptămâna lui «ieri»
  const rand = await d.citesteRand(saptamina);    // 3. abia acum baza
  if (!rand) {
    // fără rând, ?liber=1&dry=1 (apelul de luni) întoarce 200 — altfel «curl -f» din lear-saptamanal.sh pune picat=1
    if (m.tip === 'liber' && m.dry) return { status: 200, body: { saptamina, raport: false, dry: true } };
    return { status: m.tip === 'png' ? 404 : 200, body: { saptamina, raport: false, motiv: 'analiza săptămânii nu e scrisă' } };
  }
  const a = rand.date;
  if (m.tip === 'png') return { status: 200, png: await d.imagine(a) };
  if (m.tip === 'poster') return { status: 200, body: m.dry ? { saptamina, dry: true } : await d.trimitePoster(a, { force: m.force }) };
  if (m.tip === 'indicatii') {
    const text = d.indicatii(a);
    return { status: 200, body: m.dry ? { saptamina, dry: true, text: text ?? '(nimic peste prag — tăcere)' } : await d.trimiteIndicatii(a, text, { force: m.force }) };
  }
  const text = d.textTimpLiber(rand);
  if (m.dry) return { status: 200, body: { saptamina, raport: true, dry: true, text: text ?? '(nimic peste prag — tăcere)' } };
  if (!text) return { status: 200, body: { saptamina, trimis: false, motiv: 'nimic peste prag' } };
  const x = await d.trimiteOdata(rand, text, { force: m.force });
  return { status: (x as { status?: number } | null)?.status ?? 200, body: x };
}
