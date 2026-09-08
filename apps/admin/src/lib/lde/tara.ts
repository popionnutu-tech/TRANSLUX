// Țara în care se află un punct GPS, fără serviciu extern (Ion, 08.09: «când e
// în drum pe traseu, trebuie numită țara»). Poligoanele vin din Natural Earth
// 10m (admin_0), simplificate la ~300 m pentru MD/RO/UA/BG și ~800 m pentru
// restul; țările din afara drumurilor camioanelor (Constanța, Berdichev, Ruse,
// Sofia și ce e între ele) nu sunt incluse — pentru ele răspunsul e null, iar
// textul spune «în drum» fără țară, nu inventează una.
// Fișierul e de ~200 KB: se importă DOAR pe server (rutele API), nu în client.
import poligoane from './tari-poligoane.json';

type Inel = number[][]; // [lng, lat][]
type Tara = { nume: string; inele: { inel: Inel; bbox: [number, number, number, number] }[] };

let TARI: Tara[] | null = null;

function pregateste(): Tara[] {
  if (TARI) return TARI;
  TARI = Object.entries(poligoane as Record<string, Inel[]>).map(([nume, inele]) => ({
    nume,
    inele: inele.map((inel) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of inel) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      return { inel, bbox: [minX, minY, maxX, maxY] as [number, number, number, number] };
    }),
  }));
  // Moldova prima: e cazul de departe cel mai frecvent, iar Transnistria e în
  // poligonul ei, nu al Ucrainei.
  TARI.sort((a, b) => (a.nume === 'Moldova' ? -1 : b.nume === 'Moldova' ? 1 : 0));
  return TARI;
}

/** Ray casting clasic: numărul de laturi tăiate de semidreapta spre est. */
export function inInel(lng: number, lat: number, inel: Inel): boolean {
  let inauntru = false;
  for (let i = 0, j = inel.length - 1; i < inel.length; j = i++) {
    const [xi, yi] = inel[i];
    const [xj, yj] = inel[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inauntru = !inauntru;
  }
  return inauntru;
}

/** Numele românesc al țării («Moldova», «România», «Ucraina», «Bulgaria»…) sau null. */
export function taraDinPozitie(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const t of pregateste()) {
    for (const { inel, bbox } of t.inele) {
      if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      if (inInel(lng, lat, inel)) return t.nume;
    }
  }
  return null;
}
