import { getSupabase } from '@/lib/supabase';
import { sendTelegram, escapeHtml, alertAdmins } from '@/lib/telegram-notify';
import { ensureDayMaterialized } from './core';

// Verificarea «a doua zi»: după worker-ul nocturn (03:00, lde_gps_stops pentru ieri),
// comparăm atribuirile de uzină cu GPS-ul real. Mașina a fost la POARTA uzinei (sau, la
// uzinele fără porți, în orașul ei) → confirmat_auto; lipsă date GPS → fara_date_gps;
// altfel → nepotrivire + push managerilor direcției cu buton web_app spre
// mini-app/atribuiri/verifica.
// Interurban/suburban v1: fără verdict automat (rafinare ulterioară) — zero spam.
//
// Două lucruri nu merg tăcut (16.09):
//  * `fara_date_gps` pe o zi întreagă = feed-ul GPS e căzut, nu «o mașină fără tracker».
//    Între 09.09 și 15.09 au fost 7 zile la rând cu 191/191 fara_date_gps și nicio alarmă.
//  * lde_manager_directions e goală, deci pushManagers n-a trimis nimic NICIODATĂ
//    (push_trimise=0 în toate rulările din log, din 13.07). Rezumatul zilei pleacă de-acum
//    și la ADMIN, ca nepotrivirile să aibă cel puțin un destinatar real.

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'https://central-hub-md.vercel.app';

/** Peste atâta lipsă de GPS ziua nu mai e «câteva mașini fără tracker», ci feed căzut.
 *  Calibrat pe istoric: zilele proaste normale ajung la ~40%, avariile la 90–100%. */
const PRAG_GPS_CAZUT = 0.5;
const MIN_RANDURI_ALARMA = 20; // sub atâtea rânduri procentul nu spune nimic

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Distanța în km, aproximație echirectangulară — la sub 5 km eroarea e sub un metru. */
const distKm = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  111.195 * Math.hypot(aLat - bLat, (aLon - bLon) * Math.cos((bLat * Math.PI) / 180));

export interface Poarta {
  label: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface VerifySummary {
  date: string;
  verificate: number;
  confirmate_auto: number;
  nepotriviri: number;
  fara_date_gps: number;
  fara_masina: number;
  uzine_libere: number; // rânduri ale uzinelor care n-au lucrat în ziua aceea
  actualizate: number; // rânduri chiar rescrise (fără no-op-uri) — la dry: câte AR fi
  push_trimise: number;
  alerta_admin: boolean; // rezumatul zilei a ajuns la cel puțin un ADMIN
  dry: boolean;
}

export interface OpririMasina {
  locs: Set<string>;
  firstAt: Map<string, string>;
  puncte: Array<{ lat: number; lon: number; at: string }>;
}

/** Toate opririle GPS ale zilei — paginat (PostgREST taie tăcut la 1000). */
async function stopsOfDay(date: string): Promise<Map<string, OpririMasina>> {
  const db = getSupabase();
  const byVeh = new Map<string, OpririMasina>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('lde_gps_stops')
      .select('vehicle_id, locality, arrival_at, lat, lon')
      .eq('date', date)
      .order('vehicle_id', { ascending: true }).order('seq', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`lde_gps_stops: ${error.message}`);
    for (const s of data ?? []) {
      const e = byVeh.get(s.vehicle_id) ?? { locs: new Set<string>(), firstAt: new Map<string, string>(), puncte: [] };
      // oprirea fără nume de localitate rămâne folositoare pentru porți (are coordonate)
      if (s.locality) {
        const key = norm(s.locality);
        e.locs.add(key);
        if (!e.firstAt.has(key)) e.firstAt.set(key, s.arrival_at as string);
      }
      if (s.lat != null && s.lon != null) {
        e.puncte.push({ lat: Number(s.lat), lon: Number(s.lon), at: s.arrival_at as string });
      }
      byVeh.set(s.vehicle_id, e);
    }
    if (!data || data.length < 1000) break;
  }
  return byVeh;
}

export interface JudecataCtx {
  accepted: Array<{ key: string; name: string }>; // localitățile uzinei (oraș + gps_localities)
  gates: Poarta[];                                // porțile uzinei; nevidă ⇒ numele NU mai contează
  city: string;
  hasGps: (vehicleId: string) => boolean;
  stops: Map<string, OpririMasina>;
  plateOf: (vehicleId: string) => string;
}

const ORA = (at: string) =>
  new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' }).format(new Date(at));

/** Prima atingere a unei porți: oprirea cea mai devreme aflată în raza vreunei porți.
 *  Opririle vin în ordinea `seq`, deci prima găsită e și cea mai devreme. */
function primaPoarta(veh: OpririMasina | undefined, gates: Poarta[]): { label: string; at: string } | null {
  for (const p of veh?.puncte ?? []) {
    const g = gates.find((x) => distKm(p.lat, p.lon, x.lat, x.lon) <= x.radiusKm);
    if (g) return { label: g.label, at: p.at };
  }
  return null;
}

/** Verdictul GPS al unei ture. `masini` = [tur] sau [tur, retur] — o tură cu retur pe altă
 *  mașină se judecă pe AMBELE, altfel fiecare înlocuire ar cădea automat în nepotrivire.
 *  Placa intră în notă doar când sunt două mașini: «nu a ajuns în Orhei» trebuie să spună CARE.
 *
 *  Uzina cu porți se judecă NUMAI pe porți (migrația 359): orașul e prea gros — la Bălți
 *  poarta se cheamă «Slobozia», iar Briceni e chiar parcul nostru, unde o mașină se
 *  «confirma» stând în garaj. Uzina fără porți păstrează judecata pe nume. */
export function judecaTura(masini: string[], ctx: JudecataCtx): { status: string; note: string } {
  const nume = (id: string) => (masini.length > 1 ? `${ctx.plateOf(id)} ` : '');
  const peGate = ctx.gates.length > 0;

  const faraGps = masini.find((v) => !ctx.hasGps(v));
  if (faraGps) return { status: 'fara_date_gps', note: `${nume(faraGps)}fără date GPS în ziua respectivă`.trim() };

  const gasite: string[] = [];
  for (const v of masini) {
    const veh = ctx.stops.get(v);
    const hit = peGate
      ? primaPoarta(veh, ctx.gates)
      : (() => {
          const a = ctx.accepted.find((x) => veh?.locs.has(x.key));
          return a ? { label: a.name, at: veh?.firstAt.get(a.key) ?? '' } : null;
        })();
    if (!hit) {
      const unde = peGate ? `la poarta uzinei (${ctx.city})` : `în ${ctx.city}`;
      return { status: 'nepotrivire', note: `GPS: ${nume(v)}nu a ajuns ${unde}` };
    }
    gasite.push(`${nume(v)}${hit.label}${hit.at ? ` ${ORA(hit.at)}` : ''}`);
  }
  return { status: 'confirmat_auto', note: `GPS: ${gasite.join(' · ')}` };
}

export async function verificaZi(date: string, dry: boolean, reverify = false): Promise<VerifySummary> {
  const db = getSupabase();
  await ensureDayMaterialized(date);

  // reverify: re-judecă și verdictele automate vechi — inclusiv `confirmat_auto`, fiindcă
  // altfel nota lui rămâne înțepenită cu ora veche chiar dacă GPS-ul s-a corectat sub ea
  // (cazul migrației 361: verdictul era bun, dar nota scria «Poarta est 03:26» în loc de 06:26).
  // `confirmat_manual` NU intră niciodată: e decizia unui om, nu o re-judecăm noi.
  // Rescrierea e oricum condiționată — `propune()` de mai jos nu atinge rândul dacă nici
  // statusul, nici nota nu se schimbă — iar la reverify nu se trimit push-uri (vezi mai jos).
  const statuses = ['planificat', 'modificat_proactiv', 'modificat_reactiv',
    ...(reverify ? ['nepotrivire', 'fara_date_gps', 'confirmat_auto'] : [])];

  const [{ data: rows }, { data: uzine }, { data: gates }, gpsDaily, stops] = await Promise.all([
    db.from('lde_atribuiri_zilnice')
      .select('id, direction, vehicle_id, vehicle_id_retur, status, verification_note')
      .eq('date', date).eq('route_kind', 'uzina')
      .in('status', statuses),
    db.from('lde_uzine').select('id, city, gps_localities'),
    db.from('lde_uzine_gates').select('uzina_id, label, lat, lon, radius_km').eq('active', true),
    db.from('lde_vehicle_gps_daily').select('vehicle_id').eq('date', date).then((r) => new Set((r.data ?? []).map((x) => x.vehicle_id as string))),
    stopsOfDay(date),
  ]);
  // porțile uzinei (migrația 359). Uzina care are măcar una se judecă NUMAI pe ele.
  const gatesOf = new Map<string, Poarta[]>();
  for (const g of gates ?? []) {
    const list = gatesOf.get(g.uzina_id as string) ?? [];
    list.push({ label: g.label as string, lat: Number(g.lat), lon: Number(g.lon), radiusKm: Number(g.radius_km) });
    gatesOf.set(g.uzina_id as string, list);
  }
  // localitățile acceptate per uzină: orașul + gps_localities (lista COMPLETEAZĂ orașul,
  // nu-l înlocuiește — o greșeală de tastare în listă nu poate strica verificarea de bază)
  const acceptedOf = new Map<string, Array<{ key: string; name: string }>>();
  for (const u of uzine ?? []) {
    const names = [u.city as string, ...((u.gps_localities as string[] | null) ?? [])];
    const seen = new Set<string>();
    acceptedOf.set(u.id as string, names
      .map((n) => ({ key: norm(n), name: n }))
      .filter((a) => a.key && !seen.has(a.key) && seen.add(a.key)));
  }
  const cityOf = new Map((uzine ?? []).map((u) => [u.id as string, u.city as string]));

  // Plăcile intră în note DOAR pentru turele cu retur pe altă mașină: acolo «nu a ajuns
  // în Orhei» e ambiguu — dispecerul trebuie să știe CARE mașină lipsește. Zilele fără
  // retur (regula) nu plătesc nicio interogare în plus.
  const cuRetur = (rows ?? []).filter((r) => r.vehicle_id_retur);
  const plateOf = new Map<string, string>();
  if (cuRetur.length) {
    const ids = [...new Set(cuRetur.flatMap((r) => [r.vehicle_id, r.vehicle_id_retur]).filter(Boolean))] as string[];
    const { data: vehs, error: vErr } = await db.from('vehicles').select('id, plate_number').in('id', ids);
    if (vErr) throw new Error(`vehicles: ${vErr.message}`);
    for (const v of vehs ?? []) plateOf.set(v.id as string, (v.plate_number as string).replace(/\s+/g, ''));
  }

  const summary: VerifySummary = {
    date, verificate: 0, confirmate_auto: 0, nepotriviri: 0, fara_date_gps: 0, fara_masina: 0,
    uzine_libere: 0, actualizate: 0, push_trimise: 0, alerta_admin: false, dry,
  };
  const updates: Array<{ id: string; status: string; note: string }> = [];
  // verdictele se strâng întâi, fiindcă întrebarea «a lucrat uzina azi?» se pune pe
  // direcție, nu pe rând — vezi zileLibere() de mai jos.
  const verdicte: Array<{ id: string; direction: string; vechi: string; notaVeche: string | null; status: string; note: string }> = [];

  for (const r of rows ?? []) {
    summary.verificate++;
    if (!r.vehicle_id) { summary.fara_masina++; continue; } // «de completat» — nu e verdict GPS
    const city = cityOf.get(r.direction as string);
    if (!city) continue;

    const masini = [r.vehicle_id, r.vehicle_id_retur].filter(Boolean) as string[];
    const { status, note } = judecaTura(masini, {
      accepted: acceptedOf.get(r.direction as string) ?? [],
      gates: gatesOf.get(r.direction as string) ?? [],
      city,
      hasGps: (v) => gpsDaily.has(v),
      stops,
      plateOf: (v) => plateOf.get(v) ?? '?',
    });
    verdicte.push({
      id: r.id as string, direction: r.direction as string,
      vechi: r.status as string, notaVeche: (r.verification_note as string | null) ?? null,
      status, note,
    });
  }

  // Confirmările pe care rularea asta NU le re-judecă — deci nu sunt în `verdicte`, dar
  // spun că uzina a lucrat. La o rulare normală: și cele auto (rămase de la o rulare
  // anterioară a aceleiași zile), și cele manuale. La reverify: doar cele manuale,
  // fiindcă cele auto intră oricum în judecată și s-ar număra de două ori.
  const confStatuses = ['confirmat_auto', 'confirmat_manual'].filter((s) => !statuses.includes(s));
  const { data: confRows } = await db.from('lde_atribuiri_zilnice')
    .select('direction, status').eq('date', date).eq('route_kind', 'uzina')
    .in('status', confStatuses);
  const confirmariExistente = new Map<string, number>();
  for (const c of confRows ?? []) {
    confirmariExistente.set(c.direction as string, (confirmariExistente.get(c.direction as string) ?? 0) + 1);
  }

  // uzinele care n-au lucrat în ziua asta: nepotrivirile lor nu sunt abateri
  const libere = zileLibere(verdicte, confirmariExistente);
  const nepotriviriByDir = new Map<string, number>();
  for (const v of verdicte) {
    const liber = libere.has(v.direction);
    const status = liber && v.status === 'nepotrivire' ? 'uzina_nu_a_lucrat' : v.status;
    const note = status === 'uzina_nu_a_lucrat' ? NOTA_ZI_LIBERA : v.note;

    if (status === 'fara_date_gps') summary.fara_date_gps++;
    else if (status === 'confirmat_auto') summary.confirmate_auto++;
    else if (status === 'uzina_nu_a_lucrat') summary.uzine_libere++;
    else {
      summary.nepotriviri++;
      nepotriviriByDir.set(v.direction, (nepotriviriByDir.get(v.direction) ?? 0) + 1);
    }
    // nu rescrie rândurile al căror verdict nu s-a schimbat (relevant la reverify)
    if (v.vechi !== status || v.notaVeche !== note) updates.push({ id: v.id, status, note });
  }

  summary.actualizate = updates.length;
  if (!dry) {
    for (const u of updates) {
      // guard pe status: dacă managerul a apăsat «Confirmă manual» între SELECT și
      // UPDATE (reverify manual în timpul zilei), confirmarea lui nu se pierde
      await db.from('lde_atribuiri_zilnice')
        .update({ status: u.status, verification_note: u.note, ...(u.status === 'confirmat_auto' ? { confirmed_at: new Date().toISOString() } : {}) })
        .eq('id', u.id)
        .in('status', statuses);
    }
    // la reverify nu re-spamăm managerii — nepotrivirile vechi au fost deja anunțate
    summary.push_trimise = reverify ? 0 : await pushManagers(date, nepotriviriByDir, summary);
    if (!reverify) summary.alerta_admin = await alertaZilnica(date, summary);
  }
  return summary;
}

export const NOTA_ZI_LIBERA = 'uzina nu a lucrat: nicio mașină din plan n-a ajuns la poartă';

/** Uzinele care nu au lucrat în ziua judecată.
 *
 *  Ion, 17.09: «uneori sâmbăta lucrează ei». Planul materializează weekendul întreg de
 *  fiecare dată (works_saturday/works_sunday sunt steaguri fixe), deci într-o zi liberă
 *  ies 50–75 de «nepotriviri» care nu sunt abaterea nimănui. Un steag fix n-ar ajuta:
 *  cu «uneori», works_saturday=false ar ascunde exact sâmbăta în care uzina chiar lucrează.
 *
 *  Regula e «zero sau nu», fără prag ales de noi: dacă NICIUN rând al uzinei n-a fost
 *  confirmat de GPS, uzina n-a lucrat. Măsurat pe 14 weekenduri — într-o zi lucrată la
 *  Orhei se confirmă 20–50 de rânduri, într-una liberă zero; la Ungheni, zero în toate
 *  cele 14. Nu există zonă gri.
 *
 *  Limita cunoscută, acceptată în cunoștință de cauză: o singură confirmare întâmplătoare
 *  ține uzina «în lucru». Sâmbătă 29.08 Orhei n-a lucrat, dar o mașină din plan a atins
 *  poarta, deci ziua rămâne cu nepotriviri. Un prag procentual ar prinde cazul ăsta, dar
 *  ar declara liber și Bălțiul care sâmbăta chiar lucrează, cu 3 mașini din 39 — adică ar
 *  ascunde abateri reale. Greșim deliberat în direcția zgomotului, nu a tăcerii.
 *
 *  Două garduri împotriva citirii greșite a unei zile în care uzina CHIAR a lucrat:
 *   • cel puțin două rânduri trebuie să fi fost judecate pe GPS — altfel o uzină cu un
 *     singur rând fără tracker ar fi declarată liberă dintr-o singură lipsă;
 *   • `confirmariExistente` = rândurile uzinei deja confirmate în bază (auto sau manual)
 *     pentru ziua aceea. Contează din două motive: un om care a apăsat «Confirmă manual»
 *     a spus că s-a lucrat, iar o A DOUA rulare a cronului pe aceeași zi nu mai primește
 *     în `rows` rândurile confirmate la prima (filtrul pe status le sare) — fără gardul
 *     ăsta, re-rularea ar declara liberă o zi pe care tocmai a confirmat-o.
 */
export function zileLibere(
  verdicte: Array<{ direction: string; status: string }>,
  confirmariExistente: Map<string, number> = new Map(),
): Set<string> {
  const judecate = new Map<string, number>();   // rânduri cu verdict GPS real
  const confirmate = new Map<string, number>();
  for (const v of verdicte) {
    if (v.status === 'fara_date_gps') continue;
    judecate.set(v.direction, (judecate.get(v.direction) ?? 0) + 1);
    if (v.status === 'confirmat_auto') confirmate.set(v.direction, (confirmate.get(v.direction) ?? 0) + 1);
  }
  const libere = new Set<string>();
  for (const [dir, n] of judecate) {
    if (n >= 2 && !confirmate.get(dir) && !confirmariExistente.get(dir)) libere.add(dir);
  }
  return libere;
}

/** Textul alarmei de ADMIN. Separat de trimitere ca să poată fi testat.
 *
 *  ION-93 (Ion, 26.09, despre mesajul «⚠️ Atribuiri … nepotriviri»): «Nu mai am nevoie
 *  de această notificare, noi am șters atribuirile». Paginile de atribuiri au ieșit din
 *  admin (ION-53, ION-66), deci nepotrivirile nu mai au cine să le corecteze. Verdictul
 *  GPS se scrie în continuare (îl citesc trasee, etalonul și posterul); la ADMIN pleacă
 *  doar avaria: feed-ul GPS căzut, care orbește toate rapoartele de uzină. */
export function textAlertaZilnica(date: string, s: VerifySummary): string | null {
  const gpsCazut = s.verificate >= MIN_RANDURI_ALARMA && s.fara_date_gps / s.verificate >= PRAG_GPS_CAZUT;
  if (!gpsCazut) return null;
  const pct = Math.round((s.fara_date_gps / s.verificate) * 100);
  return [
    `⛔️ <b>GPS lipsă pe ${escapeHtml(date)}</b>`,
    `${s.fara_date_gps} din ${s.verificate} curse de uzină (${pct}%) au rămas fără date GPS — verificarea zilei NU s-a făcut.`,
    'De controlat worker-ul nocturn de pe VPS (<code>gps-worker.mjs</code>, log <code>nightly.log</code>) și legătura cu baza trackerului.',
  ].join('\n');
}

/** Alarma zilei către ADMIN: doar avaria de GPS. */
async function alertaZilnica(date: string, s: VerifySummary): Promise<boolean> {
  const text = textAlertaZilnica(date, s);
  if (!text) return false;
  return alertAdmins(text);
}

/** Digest de dimineață per manager: doar managerii direcțiilor cu nepotriviri. */
async function pushManagers(date: string, nepotriviriByDir: Map<string, number>, s: VerifySummary): Promise<number> {
  if (!nepotriviriByDir.size) return 0;
  const db = getSupabase();
  const { data: mds } = await db.from('lde_manager_directions').select('user_id, direction');
  const dirsByUser = new Map<string, string[]>();
  for (const m of mds ?? []) {
    const mine = nepotriviriByDir.get(m.direction as string);
    if (!mine) continue;
    dirsByUser.set(m.user_id as string, [...(dirsByUser.get(m.user_id as string) ?? []), m.direction as string]);
  }
  if (!dirsByUser.size) return 0;

  const { data: users } = await db.from('users')
    .select('id, telegram_id').in('id', [...dirsByUser.keys()]).eq('active', true).not('telegram_id', 'is', null);

  let sent = 0;
  for (const u of users ?? []) {
    const dirs = dirsByUser.get(u.id as string) ?? [];
    const n = dirs.reduce((a, d) => a + (nepotriviriByDir.get(d) ?? 0), 0);
    const text =
      `⚠️ <b>Atribuiri ${escapeHtml(date)}</b>\n` +
      `${s.confirmate_auto} curse confirmate automat de GPS · <b>${n} nepotriviri</b> pe direcțiile tale (${escapeHtml(dirs.join(', '))}).\n` +
      `Corectează mașina reală sau confirmă că a fost ok:`;
    const ok = await sendTelegram(u.telegram_id as number, text, {
      inline_keyboard: [[{ text: '🔍 Deschide verificarea', web_app: { url: `${ADMIN_BASE_URL}/mini-app/atribuiri/verifica?date=${date}` } }]],
    });
    if (ok) sent++;
  }
  return sent;
}
