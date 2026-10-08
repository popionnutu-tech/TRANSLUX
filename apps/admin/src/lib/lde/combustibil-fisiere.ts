// Citirea fișierelor de combustibil pe care le încarcă Clava (plan docs/plans/2026-10-08-import-combustibil-petrom-peco.md).
// Ion, 08.10.2026: «un fișier e Petrom, xls e Intelect». Funcții pure: primesc textul (Petrom) sau rândurile foii
// (Intelect, citite în combustibil-xls.ts), întorc tranzacțiile. Nimic din fișier nu se ghicește: un antet străin sau un
// total de portofel care nu bate → eroare cu mesaj în română.

export type Sursa = 'petrom' | 'intelect';
export type Tranzactie = {
  sursa: Sursa;
  cod: string;              // numărul cardului Petrom / codul portofelului Intelect
  nume_fisier: string;      // ce scrie în fișier lângă cod (plăcuța, «REZERVA 8», portofelul)
  local: string;            // 'YYYY-MM-DD HH:MM:SS', ora din fișier (Europe/Chisinau)
  litri: number;
  pret: number | null;
  reducere: number | null;
  suma: number | null;
  statie: string | null;
  produs: string;
  este_dt: boolean;
};
export type RandFinal = Tranzactie & { external_id: string; alimentat_at: string; zi_local: string };

export class EroareFisier extends Error {}

const num = (s: string): number => {
  const t = String(s ?? '').trim();
  if (!t) return NaN;
  // Intelect: «1,470.00» (mii cu virgulă); Petrom: «54,25» (zecimală cu virgulă)
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  return Number(t.replace(',', '.'));
};
const pad = (n: number) => String(n).padStart(2, '0');

/** Motorina (DT) — singurul produs care intră în consumul mașinii. Benzina, AdBlue etc. rămân separat. */
export const esteDt = (produs: string) => /motorin|diesel|\bdt\b|дизел/i.test(produs);

// ── Petrom: text UTF-16, tab, antet rusesc ──
const ANTET_PETROM = ['Карта', 'Рег. номер транспортного средства', 'Дата транзакции', 'Количество'];

export function parsePetrom(text: string): Tranzactie[] {
  const linii = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!linii.length) throw new EroareFisier('Fișierul Petrom e gol');
  const antet = linii[0].split('\t').map((s) => s.trim());
  if (!ANTET_PETROM.every((a, i) => antet[i] === a)) {
    throw new EroareFisier('Nu e raportul Petrom obișnuit: antetul nu începe cu «Карта · Рег. номер … · Дата транзакции · Количество»');
  }
  const out: Tranzactie[] = [];
  linii.slice(1).forEach((l, i) => {
    const c = l.split('\t').map((s) => s.trim());
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(c[2] ?? '');
    const litri = num(c[3]), pret = num(c[6]);
    if (!c[0] || !m || !Number.isFinite(litri)) throw new EroareFisier(`Rândul ${i + 2} din Petrom nu se poate citi`);
    out.push({
      sursa: 'petrom', cod: c[0], nume_fisier: c[1] ?? '', local: `${m[1]}-${m[2]}-${m[3]} ${pad(+m[4])}:${m[5]}:${m[6]}`,
      litri, pret: Number.isFinite(pret) ? pret : null, reducere: null,
      suma: Number.isFinite(pret) ? Math.round(litri * pret * 100) / 100 : null,
      statie: c[4] || null, produs: c[5] ?? '', este_dt: esteDt(c[5] ?? ''),
    });
  });
  return out;
}

// ── Intelect: «Оборот по кошелькам клиента детальный по всем АЗС» (.xls), citit ca rânduri de text ──
const DATA_INTELECT = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/;

/** «PAT 9 BRICENI 0024 Nume» → cod «0024», nume «Nume»; codul = primul cuvânt de forma [litere]cifre. */
export function despartePortofel(s: string): { cod: string; nume: string } {
  const t = s.trim().split(/\s+/);
  const i = t.findIndex((w, k) => k > 0 && /^[A-Z]{0,2}\d{3,6}$/.test(w));
  if (i < 0) return { cod: s.trim(), nume: s.trim() };
  return { cod: t[i], nume: t.slice(i + 1).join(' ') || t[i] };
}

export function parseIntelect(rows: string[][]): Tranzactie[] {
  const r0 = rows.slice(0, 3).map((r) => String((r ?? [])[0] ?? '')).join(' ');
  if (!/Оборот по кошелькам клиента/.test(r0)) {
    throw new EroareFisier('Nu e raportul Intelect obișnuit: lipsește titlul «Оборот по кошелькам клиента»');
  }
  const out: Tranzactie[] = [];
  let port: { cod: string; nume: string } | null = null;
  let statie: string | null = null;
  const acc = new Map<string, number>();          // litri pe (portofel, produs) de la ultimul «Итого по услуге»
  let totaluri = 0;
  for (let i = 0; i < rows.length; i++) {
    const ri = rows[i] ?? [];
    const c = Array.from({ length: Math.max(22, ri.length) }, (_, j) => String(ri[j] ?? '').trim());   // rândurile goale vin cu găuri
    if (c.slice(0, 4).includes('Total final')) break;   // după el vin sumarele; detaliul s-a terminat
    if (c[0].startsWith('Клиент/Пользователь:')) {
      port = despartePortofel(c[0].slice('Клиент/Пользователь:'.length));
      statie = null;
      continue;
    }
    if (c[2] === 'Operator :' && c[0]) { statie = c[0]; continue; }
    const jt = c.slice(0, 4).findIndex((x) => x.startsWith('Итого по услуге:'));   // eticheta stă în col. 0 sau 2
    if (jt >= 0) {
      const produs = c[jt].slice('Итого по услуге:'.length).trim();
      const total = num(c.slice(jt + 1).find((x) => x !== '') ?? '');
      const k = `${port?.cod}|${produs}`;
      const avem = Math.round((acc.get(k) ?? 0) * 100) / 100;
      if (Number.isFinite(total) && Math.abs(avem - total) > 0.011) {
        throw new EroareFisier(`Totalul portofelului ${port?.cod} la «${produs}» nu bate: în rânduri ${avem} l, în fișier ${total} l`);
      }
      acc.delete(k); totaluri++;
      continue;
    }
    const m = DATA_INTELECT.exec(c[2]);
    if (m && c[12] !== '') {
      if (!port) throw new EroareFisier(`Rândul ${i + 1}: tranzacție fără portofel deasupra`);
      const litri = num(c[12]);
      if (!Number.isFinite(litri)) throw new EroareFisier(`Rândul ${i + 1}: cantitatea nu e număr`);
      const produs = c[6];
      const k = `${port.cod}|${produs}`;
      acc.set(k, (acc.get(k) ?? 0) + litri);
      const pret = num(c[15]), red = num(c[17]), suma = num(c[19]);
      out.push({
        sursa: 'intelect', cod: port.cod, nume_fisier: port.nume,
        local: `${m[3]}-${m[2]}-${m[1]} ${pad(+m[4])}:${m[5]}:${m[6]}`,
        litri, pret: Number.isFinite(pret) ? pret : null, reducere: Number.isFinite(red) ? red : null,
        suma: Number.isFinite(suma) ? suma : null, statie, produs, este_dt: esteDt(produs),
      });
    }
  }
  if (!totaluri) throw new EroareFisier('Fișierul Intelect nu are niciun «Итого по услуге» — formatul s-a schimbat?');
  return out;
}

// ── ora locală → UTC (Europe/Chisinau, cu ora de vară) ──
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function offsetMin(utcMs: number): number {
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}
export function localChisinauLaUtc(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new EroareFisier(`Oră greșită: ${local}`);
  const naiv = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  let utc = naiv - offsetMin(naiv) * 60000;
  utc = naiv - offsetMin(utc) * 60000;          // a doua trecere: corect și lângă schimbarea orei
  return new Date(utc).toISOString();
}

/** Rândurile gata de scris: fără 0 l, cu cheia stabilă (un ordinal deosebește rândurile identice din același fișier). */
export function finalizeaza(tr: Tranzactie[]): RandFinal[] {
  const vazute = new Map<string, number>();
  const out: RandFinal[] = [];
  for (const t of tr) {
    if (!(t.litri > 0)) continue;
    const baza = `${t.sursa}:${t.cod}:${t.local.replace(' ', 'T')}:${t.litri.toFixed(2)}`;
    const n = (vazute.get(baza) ?? 0) + 1;
    vazute.set(baza, n);
    out.push({ ...t, external_id: `${baza}:${n}`, alimentat_at: localChisinauLaUtc(t.local), zi_local: t.local.slice(0, 10) });
  }
  return out;
}

/** Ce format e fișierul, după primii octeți: UTF-16 cu antetul Petrom sau document OLE (.xls Intelect). */
export function detecteazaFormat(b: Uint8Array): Sursa | null {
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1) return 'intelect';
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return 'petrom';
  return null;
}

/** «BR AT 035» / «HMK 135» → plăcuța normalizată, pentru propunerea de mașină — DOAR când numele cardului e chiar
 *  plăcuța. «054MLD-Nume» (plăcuță + persoană) nu primește propunere: proba pe septembrie a arătat că un asemenea
 *  portofel nu e al unei singure mașini (ar fi urcat consumul mașinii la 33 l/100 km). Acolo decide Clava. */
export function placutaDinNume(s: string): string[] {
  const t = s.toUpperCase().trim();
  const rest = t.replace(/\b[A-Z]{2,3}\s+[A-Z]{1,2}\s+\d{3}\b|\b[A-Z]{3}\s*\d{3}\b|\b\d{3}\s*[A-Z]{3,4}\b/g, '').replace(/[^A-ZĂÂÎȘȚ]/g, '');
  if (rest.length > 0) return [];
  const out = new Set<string>();
  const sp = /\b([A-Z]{2,3})\s+([A-Z]{1,2})\s+(\d{3})\b/.exec(t);          // «BR AT 035» → 035BRAT
  if (sp) out.add(`${sp[3]}${sp[1]}${sp[2]}`);
  const tr = /\b([A-Z]{3})\s*(\d{3})\b/.exec(t);                            // «HMK 135» → HMK135
  if (tr) out.add(`${tr[1]}${tr[2]}`);
  const md = /\b(\d{3})\s*([A-Z]{3,4})\b/.exec(t);                          // «054MLD» → 054MLD
  if (md) out.add(`${md[1]}${md[2]}`);
  return [...out];
}
