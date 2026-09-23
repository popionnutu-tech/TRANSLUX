// Tool-urile vocale răspund pentru ureche: ora «șapte și treizeci», numărul
// «zero. șase. nouă... unu. doi. trei...». Pe site aceleași fraze trebuie citite cu
// ochii, deci cifrele se pun la loc AICI, determinist, înainte să le vadă modelul.
// Dacă i-am lăsa modelului conversia, ar face exact greșelile pentru care frazele
// vocale au fost făcute gata de citit (ore inventate, cifre amestecate).
//
// Inversul se construiește din aceleași funcții care au scris frazele (timeSpoken,
// phoneSpoken), deci o corectură acolo se propagă aici fără nicio atingere.

import { timeSpoken } from '@/lib/time-spoken';
import { phoneSpoken } from '@/lib/phone-spoken';

type Pair = { spoken: string; plain: string };

// Toate cele 1440 de ore, cele mai lungi întâi: «douăzeci și unu fix» trebuie
// înlocuit înaintea oricărei bucăți mai scurte din el.
const TIME_PAIRS: Pair[] = (() => {
  const out: Pair[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      const plain = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const s = timeSpoken(plain);
      if (!s) continue;
      out.push({ spoken: s.ro, plain }, { spoken: s.ru, plain });
    }
  }
  return out.sort((a, b) => b.spoken.length - a.spoken.length);
})();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// UN singur regex cu toate formele (cele mai lungi întâi în alternanță): o trecere
// pe text, nu 2880 — cu câte un regex pe formă, o frază costa ~100 ms.
const TIME_PLAIN = new Map(TIME_PAIRS.map((p) => [p.spoken, p.plain]));
const TIME_RE = new RegExp(
  `(?<!\\p{L})(?:${TIME_PAIRS.map((p) => escape(p.spoken)).join('|')})(?!\\p{L})`, 'gu',
);

/** 069123456 → «069 123 456»: așa se citește și se tastează un număr moldovenesc. */
export function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local = /^373\d{8}$/.test(digits) ? '0' + digits.slice(3) : /^0\d{8}$/.test(digits) ? digits : null;
  if (!local) return null;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Înlocuiește în text orele și numerele (din `phones`) scrise în cuvinte. */
export function unspell(text: string, phones: string[]): string {
  let out = text;
  for (const p of phones) {
    const s = phoneSpoken(p);
    const plain = formatPhone(p);
    if (!s || !plain) continue;
    out = out.split(s.ro).join(plain).split(s.ru).join(plain);
  }
  return out.replace(TIME_RE, (m) => TIME_PLAIN.get(m) ?? m);
}

function collectPhones(value: unknown, acc: Set<string>): void {
  if (Array.isArray(value)) { value.forEach((v) => collectPhones(v, acc)); return; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if ((k === 'phone' || k.endsWith('_phone')) && typeof v === 'string') acc.add(v);
      else collectPhones(v, acc);
    }
  }
}

/**
 * Rezultatul unui tool vocal, pregătit pentru chat:
 * - câmpurile `*_spoken_*` / `address_spoken_*` dispar (există forma brută alături);
 * - în frazele rămase orele și numerele de telefon devin cifre.
 * Numerele de telefon se caută doar printre cele prezente în rezultat, deci nu se
 * poate «ghici» un număr care nu a venit din bază.
 */
export function voiceResultToText(result: unknown, extraPhones: string[] = []): unknown {
  const phones = new Set<string>(extraPhones);
  collectPhones(result, phones);
  const list = [...phones];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return unspell(v, list);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (k.includes('_spoken')) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(result);
}
