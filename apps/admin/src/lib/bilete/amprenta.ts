import crypto from 'crypto';

// N3 (dezbaterea Claude ⇄ Codex, 10.10.2026; Codex r3 C3): O SINGURĂ amprentă a alegerii cumpărătorului. Aceeași cheie de
// idempotență se refolosește DOAR când amprenta e aceeași (reluarea după o eroare maib, dublu-clic, «Reia plata»); altă
// alegere cu aceeași cheie = refuz «idempotenta», iar formularul trimite chei noi + cheia veche în `inlocuieste`.
// Amprenta se compară în toate ramurile: comanda existentă (creeazaComanda), sesiunea veche deschisă la bancă
// (sesiuneaAceleiasiAlegeri), returul din pachet (asiguraReturPachet) și, sub lacăt, rândul întors de bilete_creeaza_comanda
// (coloana bilete_comenzi.amprenta, migr. 564). Turul și returul din pachet poartă aceeași amprentă: a întregii alegeri.
//
// Intră: cursa (zi, rută, sens), opririle (textul trimis, normalizat), numărul de locuri, locurile alese pe ambele sensuri,
// numele pasagerului (exact, cu spațiile normalizate — orice corectură e altă comandă), telefonul și e-mailul normalizate,
// punctul de urcare, intrarea promoției (codul de retur, jetonul de student — hash) și returul ales cu locurile lui.
// Nu intră: cheile (se schimbă la înlocuire), limba, IP-ul, contul Telegram (legarea, nu conținutul).
// Un refuz în plus e sigur (formularul face o comandă nouă și o înlocuiește pe cea veche); o potrivire falsă nu e.

export interface AlegereCumparator {
  tripDate: string;
  crmRouteId: number;
  goingNorth: boolean;
  fromRo: string;
  toRo: string;
  seats: number;
  locuriAlese?: readonly number[] | null;
  /** Numele deja validat (valideaza: trim + spații unice). */
  passengerName: string;
  /** Telefonul normalizat (normalizeazaTelefonPasager). */
  phone: string;
  /** E-mailul normalizat (litere mici) sau null. */
  email?: string | null;
  punctUrcareId?: number | null;
  codRetur?: string | null;
  studentJeton?: string | null;
  retur?: { tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string; locuriAlese?: readonly number[] | null } | null;
}

export const VERSIUNE_AMPRENTA = 'a1';

const text = (s: unknown) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
const locuri = (l: readonly number[] | null | undefined) => [...(l ?? [])].map(Number).sort((a, b) => a - b);
const optional = (s: unknown) => text(s) || null;

/** Forma canonică (JSON cu ordinea cheilor fixă) — exportată pentru teste. */
export function formaCanonica(a: AlegereCumparator): string {
  const r = a.retur ?? null;
  return JSON.stringify([
    VERSIUNE_AMPRENTA,
    text(a.tripDate), Number(a.crmRouteId), a.goingNorth === true, text(a.fromRo), text(a.toRo), Number(a.seats), locuri(a.locuriAlese),
    text(a.passengerName), text(a.phone), optional(a.email)?.toLowerCase() ?? null,
    a.punctUrcareId == null ? null : Number(a.punctUrcareId),
    optional(a.codRetur)?.toLowerCase() ?? null,
    a.studentJeton ? crypto.createHash('sha256').update(String(a.studentJeton)).digest('hex') : null,
    r ? [text(r.tripDate), Number(r.crmRouteId), r.goingNorth === true, text(r.fromRo), text(r.toRo), locuri(r.locuriAlese)] : null,
  ]);
}

/** Amprenta alegerii: «a1:» + sha256 al formei canonice. */
export function amprentaAlegerii(a: AlegereCumparator): string {
  return `${VERSIUNE_AMPRENTA}:${crypto.createHash('sha256').update(formaCanonica(a)).digest('hex')}`;
}
