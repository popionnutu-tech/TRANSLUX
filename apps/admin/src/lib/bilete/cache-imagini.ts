// Cache-ul pozelor de bilet pe instanță (ION-276, «Telegram ultrafast» P11): desenarea (QR + SVG 1050×1650 + sharp) costă
// 0,5–1 s; aceeași poză se cere de mai multe ori (bot la livrare, /start, client). Cheia conține starea locului (urcat =
// QR estompat) și ZIUA locală a Chișinăului, fiindcă poza scrie «Azi»/«Сегодня» când cursa e în ziua randării — după
// miezul nopții eticheta s-ar învechi (C1 din critica Codex, runda 3). LRU simplu pe Map, TTL. Pur (ceasul se injectează).

export const IMAGINI_MAX = 200;
export const IMAGINI_TTL_MS = 6 * 60 * 60_000;

const FMT_ZI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' });
export const ziChisinau = (ms: number) => FMT_ZI.format(new Date(ms));

export function cheieImagine(cod: string, nr: number, status: string, acumMs: number): string {
  return `${cod.toLowerCase()}:${nr}:${status}:${ziChisinau(acumMs)}`;
}

export function creeazaCacheImagini(max = IMAGINI_MAX, ttlMs = IMAGINI_TTL_MS, acum: () => number = () => Date.now()) {
  const m = new Map<string, { la: number; png: Buffer }>();
  return {
    get(cheie: string): Buffer | null {
      const v = m.get(cheie);
      if (!v) return null;
      if (acum() - v.la > ttlMs) { m.delete(cheie); return null; }
      m.delete(cheie); m.set(cheie, v); // cel mai recent folosit la coadă
      return v.png;
    },
    set(cheie: string, png: Buffer) {
      m.delete(cheie);
      m.set(cheie, { la: acum(), png });
      while (m.size > max) { const prim = m.keys().next().value; if (prim === undefined) break; m.delete(prim); }
    },
    marime: () => m.size,
  };
}
