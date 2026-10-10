import { cheieNume } from '@translux/db';
// Textele SMS ale biletelor (552), fără diacritice: un SMS cu diacritice trece în UCS-2 (70 de caractere în loc de 160)
// și costă de două ori. Rusa e oricum UCS-2. Linkul fără «https://» — telefoanele îl fac link și așa.

export function faraDiacritice(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘŞ]/g, 'S').replace(/[șş]/g, 's').replace(/[ȚŢ]/g, 'T').replace(/[țţ]/g, 't');
}

/** «13.10 06:55» în ora Chișinăului. */
export function ziOra(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

export interface BiletSms { lang: 'ro' | 'ru'; from: string; to: string; departure_at: string; cod: string; locuri: number[] }

const gazda = (bazaSite: string) => bazaSite.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const link = (b: BiletSms, bazaSite: string) => `${gazda(bazaSite)}/${b.lang}/bilet/${b.cod}`;
const rand = (b: BiletSms) => {
  const loc = b.locuri.length ? (b.lang === 'ru' ? `, место ${b.locuri.join(',')}` : `, loc ${b.locuri.join(',')}`) : '';
  return `${faraDiacritice(b.from)}-${faraDiacritice(b.to)} ${ziOra(b.departure_at)}${loc}`;
};

/** Confirmarea după plată: cursa (și returul din același pachet), linkul și cum îl găsește pe site. */
export function textConfirmare(tur: BiletSms, retur: BiletSms | null, bazaSite: string): string {
  const site = gazda(bazaSite);
  if (tur.lang === 'ru') {
    return [`TRANSLUX: билет оплачен. ${rand(tur)}: ${link(tur, bazaSite)}`,
      retur ? `Обратно ${rand(retur)}: ${link(retur, bazaSite)}` : null,
      `Потеряли ссылку? ${site} > «Найти мой билет».`].filter(Boolean).join('\n');
  }
  return [`TRANSLUX: bilet platit. ${rand(tur)}: ${link(tur, bazaSite)}`,
    retur ? `Retur ${rand(retur)}: ${link(retur, bazaSite)}` : null,
    `Ai pierdut linkul? ${site} > «Gaseste biletul meu».`].filter(Boolean).join('\n');
}

/** «Găsește biletul meu»: biletele viitoare de pe număr (cel mult 3), fiecare cu linkul lui. */
export function textGaseste(lang: 'ro' | 'ru', bilete: BiletSms[], bazaSite: string): string {
  const linii = bilete.slice(0, 3).map((b) => `${rand(b)}: ${link(b, bazaSite)}`);
  return [lang === 'ru' ? 'TRANSLUX: ваши билеты' : 'TRANSLUX: biletele tale', ...linii].join('\n');
}

/**
 * Numele scris de om (de regulă cel de familie) se potrivește cu numele de pe bilet: fiecare cuvânt al lui apare în
 * numele biletului (fără diacritice, fără ordine; cheieNume). Gol sau cuvinte de o literă → nu.
 */
export function numePotrivit(scris: string, peBilet: string): boolean {
  const s = cheieNume(scris).split(' ').filter(Boolean);
  if (!s.length || s.some((w) => w.length < 2)) return false;
  const b = new Set(cheieNume(peBilet).split(' ').filter(Boolean));
  return s.every((w) => b.has(w));
}

// ── N5 (dezbaterea Claude–Codex, 10.10.2026): reluarea SMS-ului de confirmare, fără trimitere dublă (migr. 563) ──────────

/** Câte încercări are o confirmare, cât ține revendicarea și pauza dintre reluări; aceleași valori merg la funcția din bază. */
export const SMS_INCERCARI_MAX = 3;
export const SMS_TERMEN_REVENDICARE_MS = 2 * 60_000;
export const SMS_PAUZA_RELUARE_MS = 2 * 60_000;
/** Fereastra plasei din împăcare: plătite în ultimele 2 ore. */
export const SMS_FEREASTRA_MS = 2 * 3_600_000;

export interface RandSmsConfirmare {
  stare: string; incercari: number; revendicat_la: string | null; trimitere_la: string | null; created_at: string;
}

/**
 * Plasa din împăcare: rândul de confirmare merită o revendicare (funcția din bază decide atomic; asta doar alege). Refuz
 * confirmat sub plafon și după pauză; revendicare expirată (înainte de cerere → reluare; după → baza o închide ca
 * «necunoscut»). Trimis / necunoscut / epuizat → nu. Pur.
 */
export function confirmareDeReluat(r: RandSmsConfirmare, nowMs: number): boolean {
  const ultima = Date.parse(r.revendicat_la ?? r.created_at);
  if (r.stare === 'refuzat') return r.incercari < SMS_INCERCARI_MAX && nowMs - ultima >= SMS_PAUZA_RELUARE_MS;
  if (r.stare === 'in_lucru') return nowMs - ultima >= SMS_TERMEN_REVENDICARE_MS;
  return false;
}

export type RezultatTrimitereSms = { ok: true; id: string | null } | { ok: false; eroare: string; necunoscut: boolean };
export type Revendicare = { ok: true; id: string; token: string } | { ok: false; motiv: string };

export interface DepsConfirmareSms {
  revendica(): Promise<Revendicare>;
  /** marchează începerea cererii (doar cu jetonul curent); false = revendicarea s-a pierdut, nu se trimite */
  incepe(id: string, token: string): Promise<boolean>;
  /** textul SMS-ului, construit după revendicare și ÎNAINTE de începere (o eroare aici lasă revendicarea să expire → reluare) */
  text(): Promise<string>;
  trimite(text: string): Promise<RezultatTrimitereSms>;
  rezultat(id: string, token: string, stare: 'trimis' | 'refuzat' | 'necunoscut', furnizorId: string | null, eroare: string | null): Promise<void>;
  jurnal?(mesaj: string): void;
}

export type RezultatConfirmareSms = 'trimis' | 'nimic' | 'esuat' | 'necunoscut';

/**
 * Pașii unei confirmări: revendică → textul → marchează începerea → trimite → scrie rezultatul. Necunoscut = stare finală (fără retrimitere), refuzat = se reia din plasă până la plafon.
 */
export async function trimiteConfirmareSms(deps: DepsConfirmareSms): Promise<RezultatConfirmareSms> {
  const rv = await deps.revendica();
  if (!rv.ok) {
    if (rv.motiv === 'necunoscut') deps.jurnal?.('[bilete/sms] confirmare cu rezultat necunoscut (procesul a murit în timpul trimiterii) — nu se retrimite');
    return 'nimic';
  }
  const text = await deps.text();
  if (!(await deps.incepe(rv.id, rv.token))) return 'nimic';
  let r: RezultatTrimitereSms;
  try {
    r = await deps.trimite(text);
  } catch (e) {
    r = { ok: false, eroare: e instanceof Error ? e.message : String(e), necunoscut: true };
  }
  if (r.ok) { await deps.rezultat(rv.id, rv.token, 'trimis', r.id, null); return 'trimis'; }
  await deps.rezultat(rv.id, rv.token, r.necunoscut ? 'necunoscut' : 'refuzat', null, r.eroare.slice(0, 300));
  deps.jurnal?.(`[bilete/sms] confirmare ${r.necunoscut ? 'necunoscută' : 'refuzată'}: ${r.eroare}`);
  return r.necunoscut ? 'necunoscut' : 'esuat';
}
