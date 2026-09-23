'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type Punct = [number, number];
export type UrmaRuta = {
  id: string;
  culoare: string;
  capat?: string;
  plin: Punct[][];
  sate: { n: string; c: Punct }[];
};

const POARTA: Punct = [47.223, 27.8016];

// Harta se mută pe ruta aleasă. Fără asta, la 31 de trasee peste raionul Ungheni, cea aleasă
// rămâne un fir subțire într-un colț și nu se vede ce s-a selectat.
function Incadreaza({ urme, ales }: { urme: UrmaRuta[]; ales: string | null }) {
  const map = useMap();
  useEffect(() => {
    // Coloana din dreapta apare și dispare odată cu alegerea rutei, deci lățimea hărții se
    // schimbă. Leaflet nu observă singur redimensionarea containerului: fără invalidateSize
    // rămâne cu plăcile vechi și jumătate de hartă iese gri. 220 ms = după tranziția grilei.
    const t = setTimeout(() => map.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [ales, map]);

  useEffect(() => {
    const puncte: Punct[] = [];
    for (const u of urme) {
      if (ales && u.id !== ales) continue;
      for (const seg of u.plin) puncte.push(...seg);
    }
    if (puncte.length < 2) return;
    const la = puncte.map((p) => p[0]);
    const lo = puncte.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...la), Math.min(...lo)], [Math.max(...la), Math.max(...lo)]],
      { padding: [50, 50], maxZoom: 12 },
    );
  }, [ales, urme, map]);
  return null;
}

export default function ScheletMap({ urme, ales }: { urme: UrmaRuta[]; ales: string | null }) {
  const sate = useMemo(() => {
    const m = new Map<string, { c: Punct; rute: Set<string>; capat: boolean }>();
    for (const u of urme) for (const s of u.sate) {
      if (!m.has(s.n)) m.set(s.n, { c: s.c, rute: new Set(), capat: false });
      const v = m.get(s.n)!;
      v.rute.add(u.id);
      if (u.capat === s.n) v.capat = true;
    }
    return [...m.entries()];
  }, [urme]);

  return (
    <MapContainer center={POARTA} zoom={10} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={0.55}
      />
      <Incadreaza urme={urme} ales={ales} />

      {/* Celelalte rute rămân desenate palid: altfel ruta aleasă plutește singură și nu se
          vede unde cade ea față de restul rețelei. */}
      {urme.map((u) => {
        const sel = ales === u.id;
        if (ales && !sel) {
          return u.plin.map((seg, i) => (
            <Polyline key={`${u.id}-f${i}`} positions={seg}
              pathOptions={{ color: '#b9adb0', weight: 1.5, opacity: 0.45 }} />
          ));
        }
        return u.plin.map((seg, i) => (
          <Polyline key={`${u.id}-p${i}`} positions={seg}
            pathOptions={{ color: u.culoare, weight: sel ? 5 : 2.5, opacity: sel ? 1 : 0.7 }} />
        ));
      })}

      {sate.map(([nume, v]) => {
        const peRuta = !ales || v.rute.has(ales);
        if (!peRuta) return null;
        return (
          <CircleMarker
            key={nume}
            center={v.c}
            radius={v.capat ? 6 : 3.5}
            pathOptions={{
              color: v.capat ? '#B06A1F' : '#6E5C60', weight: v.capat ? 2.5 : 1.4,
              fillColor: '#fff', fillOpacity: 1,
            }}
          >
            <Tooltip direction="right" offset={[6, 0]} permanent={Boolean(ales)} opacity={1}>
              {v.capat ? <b>{nume}</b> : nume}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <CircleMarker center={POARTA} radius={8} pathOptions={{ color: '#23191B', weight: 2, fillColor: '#23191B', fillOpacity: 1 }}>
        <Tooltip direction="right" offset={[8, 0]} permanent opacity={1}><b>LEAR</b></Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
