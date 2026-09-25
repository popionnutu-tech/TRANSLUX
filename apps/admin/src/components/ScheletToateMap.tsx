'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Punct } from '@/components/ScheletMap';
import type { Retea } from '@/app/(dashboard)/lde/schelet/toate';

// Harta filei «Toate rutele» (ION-67): toate rețelele deodată, fiecare sub egida ei — zona
// conturată în culoarea rețelei, rutele în nuanțele ei, poarta cu numele rețelei pe o etichetă.

type Ales = { retea: string | null; ruta: string | null };

function Incadreaza({ retele, ales, ascunse }: { retele: Retea[]; ales: Ales; ascunse: Set<string> }) {
  const map = useMap();
  useEffect(() => {
    const puncte: Punct[] = [];
    for (const r of retele) {
      if (ascunse.has(r.id)) continue;
      if (ales.retea && r.id !== ales.retea) continue;
      for (const x of r.rute) {
        if (ales.ruta && x.id !== ales.ruta) continue;
        puncte.push(...x.linie);
      }
      if (!ales.ruta) puncte.push(...r.porti.map((p) => p.c));
    }
    if (puncte.length < 2) return;
    const la = puncte.map((p) => p[0]), lo = puncte.map((p) => p[1]);
    map.fitBounds([[Math.min(...la), Math.min(...lo)], [Math.max(...la), Math.max(...lo)]], { padding: [40, 40], maxZoom: 12 });
  }, [retele, ales, ascunse, map]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// Eticheta porții: pastila rețelei, în culoarea ei — asta e «egida» care se vede de departe.
const pastila = (r: Retea, activ: boolean) => L.divIcon({
  className: '',
  iconSize: [0, 0],
  html: `<div style="transform:translate(-50%,-50%);width:max-content;display:flex;align-items:center;gap:6px;white-space:nowrap;
    background:${activ ? r.culoare : '#fff'};color:${activ ? '#fff' : r.culoare};border:2px solid ${r.culoare};
    border-radius:999px;padding:3px 10px 3px 6px;font:600 11.5px/1.2 system-ui,sans-serif;
    box-shadow:0 2px 8px rgba(35,25,27,.18)">
    <span style="width:9px;height:9px;border-radius:50%;margin-left:4px;background:${activ ? '#fff' : r.culoare}"></span>
    ${esc(r.nume)} <span style="opacity:.7;font-weight:500">· ${r.rute.length}</span></div>`,
});
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export default function ScheletToateMap({ retele, ales, ascunse, onRetea }: {
  retele: Retea[]; ales: Ales; ascunse: Set<string>; onRetea: (id: string) => void;
}) {
  const vizibile = useMemo(() => retele.filter((r) => !ascunse.has(r.id)), [retele, ascunse]);
  // Interurbanele dedesubt: sunt lungi și subțiri, rețelele uzinelor stau deasupra lor.
  const ordine = useMemo(() => [...vizibile].sort((a, b) => Number(b.zona == null) - Number(a.zona == null)), [vizibile]);

  return (
    <>
    {/* Fundal gri: cinci familii de culoare pe o hartă colorată s-ar bate cap în cap cu pădurile și apele. */}
    <style>{'.schelet-toate-fundal{filter:grayscale(1) contrast(.9) brightness(1.04)}'}</style>
    <MapContainer center={[47.4, 28.3]} zoom={8} scrollWheelZoom style={{ height: '100%', width: '100%', background: '#f4f1ef' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="schelet-toate-fundal"
        opacity={0.6}
      />
      <Incadreaza retele={retele} ales={ales} ascunse={ascunse} />

      {ordine.map((r) => {
        const stinsa = ales.retea != null && ales.retea !== r.id;
        return r.zona && (
          <Polygon key={`z-${r.id}`} positions={r.zona}
            eventHandlers={{ click: () => onRetea(r.id) }}
            pathOptions={{
              color: r.culoare, weight: stinsa ? 1 : 1.6, dashArray: '6 5', opacity: stinsa ? 0.25 : 0.8,
              fillColor: r.culoare, fillOpacity: stinsa ? 0.02 : ales.retea === r.id ? 0.1 : 0.06,
            }} />
        );
      })}

      {ordine.map((r) => {
        const stinsa = ales.retea != null && ales.retea !== r.id;
        const inter = r.zona == null;
        return r.rute.map((x) => {
          if (x.linie.length < 2) return null;
          const sel = ales.retea === r.id && ales.ruta === x.id;
          const umbra = ales.ruta != null && ales.retea === r.id && !sel;
          return (
            <Polyline key={`${r.id}-${x.id}`} positions={x.linie}
              pathOptions={{
                color: stinsa ? '#bdb2b4' : x.culoare,
                weight: sel ? 5.5 : stinsa ? 1.2 : inter ? 1.8 : 2.6,
                opacity: sel ? 1 : stinsa ? 0.35 : umbra ? 0.3 : inter ? 0.6 : 0.85,
              }}>
              {!stinsa && (
                <Tooltip sticky opacity={1}>
                  <b style={{ color: r.culoare }}>{r.nume}</b> · {x.id} {x.nume}
                  {x.km != null && <> · {(Math.round(x.km * 10) / 10).toFixed(1).replace('.', ',')} km/zi</>}
                </Tooltip>
              )}
            </Polyline>
          );
        });
      })}

      {ordine.flatMap((r) => r.porti.map((p) => (
        <CircleMarker key={`p-${r.id}-${p.n}`} center={p.c} radius={7}
          pathOptions={{ color: '#fff', weight: 2.5, fillColor: r.culoare, fillOpacity: 1 }} />
      )))}
      {ordine.flatMap((r) => r.porti.slice(0, 1).map((p) => (
        <Marker key={`e-${r.id}`} position={[p.c[0] + 0.035, p.c[1]]} icon={pastila(r, ales.retea === r.id)}
          eventHandlers={{ click: () => onRetea(r.id) }} zIndexOffset={1000} />
      )))}
    </MapContainer>
    </>
  );
}
