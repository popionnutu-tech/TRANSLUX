import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Descărcarea originalului (plan 09.10, «Publicarea video» p. 3). Bot API dă fișiere doar până la 20 MB, clipurile au
// 300–800 MB. Serverul propriu Bot API ar cere `logOut` — botul Translux (operatorii, biletele) și botul TLX ar trece
// cu totul pe el. În loc de asta botul intră prin MTProto, cu ACELAȘI token (până la 2 GB), doar ca să citească
// mesajul cu clipul din supergrup și să-l descarce. Accesul la supergrup cere access_hash-ul lui pentru acest bot:
// cu 0 Telegram răspunde CHANNEL_INVALID (primul clip real, 10.10.2026, 562 MB). Copilul îl învață o dată (vezi
// `hashCanal` în descarcare-lucru.ts) și îl ține aici, în memorie, per bot și grup.
//
// Dezbaterea 10.10: MTProto rulează într-un PROCES COPIL (descarcare-lucru.ts), oprit cu SIGKILL la limită (SBE2-2);
// bucățile se scriu așteptat și mărimea se verifică exact (SBE-1); fără `client.start()` (SBE-2). Că botul principal
// nu pierde actualizări se dovedește doar cu proba de dinaintea cheilor (scripts/social-proba-mtproto.mts).
// Clipul se descarcă abia la ora publicării și se șterge imediat după trimitere: nu se ține nicăieri.

/** Descărcarea întreagă (logare + mesaj + fișier) are o limită: la ea procesul copil e omorât. */
export const DESCARCARE_MAX_MS = 30 * 60_000;
export const DIR_TEMPORAR = join(tmpdir(), 'social');

/** Clipul nu mai e cel planificat (mesaj șters, editat, alt autor, alt fișier): retrimiterea n-ajută. */
export class ClipSchimbat extends Error {}

/** Id-ul Bot API al supergrupului (-100…) → id-ul canalului în MTProto. Pur, testat. */
export function idCanal(chatId: number): string {
  const s = String(chatId);
  if (!s.startsWith('-100')) throw new Error(`chat ${chatId} nu e supergrup`);
  return s.slice(4);
}

export interface ClipAsteptat {
  autorTelegramId: number;
  /** Mărimea văzută la primire (Bot API). Fără ea nu se publică: altfel orice clip din grup ar putea fi luat. */
  marime: number | null;
}

/** Ce s-a găsit în mesaj față de ce s-a planificat. Pur, testat. null = e același clip. */
export function motivSchimbat(gasit: { autor: number | null; editat: boolean; marime: number | null }, asteptat: ClipAsteptat): string | null {
  if (!asteptat.marime) return 'mărimea clipului nu s-a văzut la primire';
  if (gasit.marime === null) return 'mesajul nu mai conține un clip';
  if (gasit.editat) return 'mesajul cu clipul a fost editat după planificare';
  if (gasit.autor !== asteptat.autorTelegramId) return 'mesajul nu e al autorului planificat';
  if (gasit.marime !== asteptat.marime) return 'clipul din mesaj a fost înlocuit după planificare';
  return null;
}

/** Ce primește procesul copil (prin IPC, nu în argumente: tokenul nu apare în lista proceselor). */
export interface CerereDescarcare {
  token: string;
  sesiune: string | null;
  /** access_hash-ul supergrupului pentru acest bot, dacă e deja știut. */
  accessHash: string | null;
  chatId: number;
  messageId: number;
  cale: string;
  asteptat: ClipAsteptat;
}

export type RaspunsDescarcare =
  | { ok: true; sesiune: string; dcSesiune: number; dcClip: number; accessHash: string }
  | { ok: false; schimbat: boolean; mesaj: string; sesiune: string | null; accessHash?: string };

/** Sesiunea MTProto per bot, ținută în memoria botului: copilul nu se loghează din nou la fiecare clip. */
const sesiuni = new Map<string, string>();
/** access_hash-ul supergrupului, per «idBot:chat» (id-ul botului e partea tokenului dinainte de «:»). */
const hashuri = new Map<string, string>();
const cheieHash = (token: string, chatId: number) => `${token.split(':')[0]}:${chatId}`;

function lucrator(): { cale: string; execArgv: string[] } {
  const js = fileURLToPath(new URL('./descarcare-lucru.js', import.meta.url));
  if (existsSync(js)) return { cale: js, execArgv: [] };
  // Rulat din surse (tsx: proba, dezvoltare): copilul pornește tot prin tsx.
  return { cale: fileURLToPath(new URL('./descarcare-lucru.ts', import.meta.url)), execArgv: ['--import', 'tsx'] };
}

/** Pornește copilul și așteaptă răspunsul; la `limitaMs` îl omoară. Întoarce și DC-urile (pentru probă). */
export async function descarcaInCopil(c: Omit<CerereDescarcare, 'sesiune' | 'accessHash'>, limitaMs = DESCARCARE_MAX_MS): Promise<RaspunsDescarcare> {
  const { cale, execArgv } = lucrator();
  const copil = fork(cale, [], { execArgv, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  return new Promise<RaspunsDescarcare>((da) => {
    let gata = false;
    const termina = (r: RaspunsDescarcare) => {
      if (gata) return;
      gata = true;
      clearTimeout(ceas);
      if (!copil.killed && copil.exitCode === null) copil.kill('SIGKILL');
      if (r.sesiune) sesiuni.set(c.token, r.sesiune);
      if (r.accessHash) hashuri.set(cheieHash(c.token, c.chatId), r.accessHash);
      else if (/AUTH_KEY|SESSION_REVOKED|SESSION_EXPIRED/.test(r.ok ? '' : r.mesaj)) sesiuni.delete(c.token);
      da(r);
    };
    const ceas = setTimeout(() => termina({ ok: false, schimbat: false, mesaj: `descărcarea a depășit ${Math.round(limitaMs / 60_000)} minute`, sesiune: null }), limitaMs);
    copil.on('message', (r: RaspunsDescarcare) => termina(r));
    copil.on('error', (err) => termina({ ok: false, schimbat: false, mesaj: `procesul descărcării: ${err.message}`, sesiune: null }));
    copil.on('exit', (cod) => termina({ ok: false, schimbat: false, mesaj: `procesul descărcării s-a oprit (cod ${cod})`, sesiune: null }));
    copil.send({
      ...c, sesiune: sesiuni.get(c.token) ?? null, accessHash: hashuri.get(cheieHash(c.token, c.chatId)) ?? null,
    } satisfies CerereDescarcare);
  });
}

/**
 * Descarcă clipul mesajului într-un fișier temporar; întoarce calea. Apelantul îl șterge cu `stergeTemporar`.
 * Refuză (ClipSchimbat) dacă mesajul nu mai e cel văzut la primire.
 */
export async function descarcaClip(token: string, chatId: number, messageId: number, idPostare: string, asteptat: ClipAsteptat): Promise<string> {
  const cale = join(DIR_TEMPORAR, `${idPostare}.mp4`);
  const r = await descarcaInCopil({ token, chatId, messageId, cale, asteptat });
  if (r.ok) return cale;
  await stergeTemporar(cale);
  throw r.schimbat ? new ClipSchimbat(r.mesaj) : new Error(r.mesaj);
}

export async function stergeTemporar(cale: string | null): Promise<void> {
  if (cale) await rm(cale, { force: true }).catch(() => {});
}

/** SBE-8: la pornire se golește directorul temporar (resturile unei căderi a procesului). */
export async function golesteTemporar(): Promise<void> {
  await rm(DIR_TEMPORAR, { recursive: true, force: true }).catch(() => {});
}
