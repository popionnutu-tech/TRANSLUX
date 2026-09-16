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

  // reverify: re-judecă și verdictele automate vechi (după corecții de gps_localities);
  // confirmat_manual/confirmat_auto nu se ating niciodată.
  const statuses = ['planificat', 'modificat_proactiv', 'modificat_reactiv',
    ...(reverify ? ['nepotrivire', 'fara_date_gps'] : [])];

  const [{ data: rows }, { data: uzine }, { data: gates }, gpsDaily, stops] = await Promise.all([
    db.from('lde_atribuiri_zilnice')
      .select('id, direction, vehicle_id, vehicle_id_retur, status, verification_note')
      .eq('date', date).eq('route_kind', 'uzina')
      .in('status', statuses),
    db.from('lde_uzine').select('id, display_name, city, gps_localities'),
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
  const numeOf = new Map((uzine ?? []).map((u) => [u.id as string, (u.display_name as string) || (u.id as string)]));

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
    date, verificate: 0, confirmate_auto: 0, nepotriviri: 0, fara_date_gps: 0, fara_masina: 0, actualizate: 0, push_trimise: 0, alerta_admin: false, dry,
  };
  const nepotriviriByDir = new Map<string, number>();
  const updates: Array<{ id: string; status: string; note: string }> = [];

  for (const r of rows ?? []) {
    summary.verificate++;
    // nu rescrie rândurile al căror verdict nu s-a schimbat (relevant la reverify)
    const propune = (status: string, note: string) => {
      if (r.status !== status || r.verification_note !== note) updates.push({ id: r.id as string, status, note });
    };
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
    if (status === 'fara_date_gps') summary.fara_date_gps++;
    else if (status === 'confirmat_auto') summary.confirmate_auto++;
    else {
      summary.nepotriviri++;
      nepotriviriByDir.set(r.direction as string, (nepotriviriByDir.get(r.direction as string) ?? 0) + 1);
    }
    propune(status, note);
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
    if (!reverify) summary.alerta_admin = await alertaZilnica(date, nepotriviriByDir, numeOf, summary);
  }
  return summary;
}

/** Textul rezumatului de ADMIN. Separat de trimitere ca să poată fi testat. */
export function textAlertaZilnica(
  date: string,
  nepotriviriByDir: Map<string, number>,
  numeOf: Map<string, string>,
  s: VerifySummary,
  dirsFaraManager: string[],
): string | null {
  const gpsCazut = s.verificate >= MIN_RANDURI_ALARMA && s.fara_date_gps / s.verificate >= PRAG_GPS_CAZUT;
  if (!gpsCazut && !nepotriviriByDir.size) return null;

  const linii: string[] = [];
  if (gpsCazut) {
    const pct = Math.round((s.fara_date_gps / s.verificate) * 100);
    linii.push(
      `⛔️ <b>GPS lipsă pe ${escapeHtml(date)}</b>`,
      `${s.fara_date_gps} din ${s.verificate} curse de uzină (${pct}%) au rămas fără date GPS — verificarea zilei NU s-a făcut.`,
      'De controlat worker-ul nocturn de pe VPS (<code>gps-worker.mjs</code>, log <code>nightly.log</code>) și legătura cu baza trackerului.',
    );
    if (nepotriviriByDir.size) linii.push('');
  }
  if (nepotriviriByDir.size) {
    const n = [...nepotriviriByDir.values()].reduce((a, b) => a + b, 0);
    linii.push(
      `⚠️ <b>Atribuiri ${escapeHtml(date)}</b>`,
      `${s.confirmate_auto} curse confirmate automat · <b>${n} nepotriviri</b>:`,
      ...[...nepotriviriByDir.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([dir, k]) => `• ${escapeHtml(numeOf.get(dir) ?? dir)} — ${k}`),
    );
    // Uzina fără manager în lde_manager_directions nu primește push-ul de corectare:
    // nepotrivirile ei nu ajung la nimeni în afară de mesajul ăsta.
    if (dirsFaraManager.length) {
      linii.push('', `Fără manager configurat (nimeni nu primește push de corectare): ${
        dirsFaraManager.map((d) => escapeHtml(numeOf.get(d) ?? d)).join(', ')}`);
    }
  }
  return linii.join('\n');
}

/** Rezumatul zilei către ADMIN: avarie de GPS sau nepotriviri. Independent de
 *  lde_manager_directions — tocmai fiindcă tabela aia poate fi (și e) goală. */
async function alertaZilnica(
  date: string,
  nepotriviriByDir: Map<string, number>,
  numeOf: Map<string, string>,
  s: VerifySummary,
): Promise<boolean> {
  const db = getSupabase();
  const { data: mds } = await db.from('lde_manager_directions').select('direction');
  const cuManager = new Set((mds ?? []).map((m) => m.direction as string));
  const text = textAlertaZilnica(date, nepotriviriByDir, numeOf, s,
    [...nepotriviriByDir.keys()].filter((d) => !cuManager.has(d)));
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
