'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type PinCamion = {
  plate: string;
  lat: number;
  lng: number;
  speed: number;
  at: string;
  culoare: string;
  eticheta: string;
};

// Markerele implicite ale Leaflet cer imagini din CDN; folosim CircleMarker
// (vector, fără assets) — harta rămâne self-contained.
function Incadreaza({ pins }: { pins: PinCamion[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    const lats = pins.map((p) => p.lat);
    const lngs = pins.map((p) => p.lng);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [30, 30], maxZoom: 9 },
    );
    // Doar la schimbarea setului de plăcuțe: altfel harta ar sări la fiecare refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.map((p) => p.plate).join(',')]);
  return null;
}

export default function FleetMap({ pins }: { pins: PinCamion[] }) {
  /**
   * Camioanele parcate la aceeași bază cad pe aceleași coordonate și markerele se
   * ascund unul sub altul: harta arăta 8 puncte pentru 22 de camioane (Ion, 01.09).
   * Le grupăm pe o grilă de ~300 m; grupul poartă numărul și listează plăcuțele.
   */
  const grupuri = useMemo(() => {
    const PAS = 0.003; // ~300 m
    const m = new Map<string, { cheie: string; lat: number; lng: number; culoare: string; pini: PinCamion[] }>();
    for (const p of pins) {
      const cheie = `${Math.round(p.lat / PAS)}|${Math.round(p.lng / PAS)}`;
      const g = m.get(cheie);
      if (g) { g.pini.push(p); continue; }
      m.set(cheie, { cheie, lat: p.lat, lng: p.lng, culoare: p.culoare, pini: [p] });
    }
    // Culoarea grupului: cea a primului camion; un grup mixt rămâne informativ
    // prin listă, iar numărul spune că sunt mai multe.
    return [...m.values()];
  }, [pins]);

  const centru = useMemo<[number, number]>(() => {
    if (pins.length === 0) return [47.0105, 28.8638]; // Chișinău
    return [pins[0].lat, pins[0].lng];
  }, [pins]);

  return (
    <MapContainer center={centru} zoom={7} style={{ height: 520, width: '100%', borderRadius: 8 }} scrollWheelZoom>
      {/* OSM standard. Carto voyager (încercat 31.08) cere acum cheie API și
          desenează «API KEY REQUIRED» peste toată harta — verificat în producție
          01.09. Un fundal mai greu, dar care se vede, bate unul ușor și stricat. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Incadreaza pins={pins} />
      {grupuri.map((g) => (
        <CircleMarker
          key={g.cheie}
          center={[g.lat, g.lng]}
          radius={g.pini.length > 1 ? 9 : 7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: g.culoare, fillOpacity: 0.95 }}
        >
          {g.pini.length > 1 && (
            <Tooltip permanent direction="center" className="pin-count">
              {g.pini.length}
            </Tooltip>
          )}
          <Tooltip direction="top" offset={[0, -8]}>
            {g.pini.length > 1 && <strong>{g.pini.length} camioane aici:</strong>}
            {g.pini.map((p) => (
              <div key={p.plate}>
                <strong>{p.plate}</strong> · {p.eticheta}
                <br />
                <span style={{ opacity: 0.8 }}>
                  {Math.round(p.speed)} km/h · {new Date(p.at).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
