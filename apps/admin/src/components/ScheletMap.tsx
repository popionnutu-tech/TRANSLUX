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

// Harta se mută pe ruta aleasă. Fără asta, la 31 de trasee peste raionul Ungheni, cel ales
// rămâne un fir subțire undeva în colț și nu se vede ce s-a selectat.
function Incadreaza({ urme, ales }: { urme: UrmaRuta[]; ales: string | null }) {
  const map = useMap();
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
      { padding: [40, 40], maxZoom: 12 },
    );
  }, [ales, urme, map]);
  return null;
}

export default function ScheletMap({ urme, ales }: { urme: UrmaRuta[]; ales: string | null }) {
  // Satele se desenează o singură dată chiar dacă două rute trec prin ele.
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
    <MapContainer
      center={POARTA}
      zoom={10}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Incadreaza urme={urme} ales={ales} />

      {urme.map((u) => {
        const activ = !ales || u.id === ales;
        const estompat = ales !== null && u.id !== ales;
        if (estompat) return null;
        return (
          <div key={u.id}>
            {u.plin.map((seg, i) => (
              <Polyline key={`p${i}`} positions={seg} pathOptions={{
                color: u.culoare, weight: activ ? 5 : 3, opacity: 0.95,
              }} />
            ))}
          </div>
        );
      })}

      {sate.map(([nume, v]) => {
        if (ales && !v.rute.has(ales)) return null;
        return (
          <CircleMarker
            key={nume}
            center={v.c}
            radius={v.capat ? 7 : 4}
            pathOptions={{
              color: v.capat ? '#b06a1f' : '#555', weight: v.capat ? 3 : 1.5,
              fillColor: '#fff', fillOpacity: 1,
            }}
          >
            <Tooltip direction="right" offset={[6, 0]} permanent={Boolean(ales)} opacity={1}>
              {v.capat ? <b>{nume}</b> : nume}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <CircleMarker center={POARTA} radius={9} pathOptions={{ color: '#111', weight: 2, fillColor: '#111', fillOpacity: 1 }}>
        <Tooltip direction="right" offset={[8, 0]} permanent opacity={1}><b>LEAR</b></Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
