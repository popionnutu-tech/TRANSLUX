'use client';

// Harta autobuzului din chatul asistentului (ION-39). Ion, 23.09: «hartă interactivă
// mai interesantă» — dar «traseul nu trebuie» și «fără viteză, ca punct în moment».
// Deci: hartă adevărată (mutare, zoom, ecran complet) cu UN singur punct, mutat pe
// loc când vine poziția nouă. Fără linie, fără urmă, fără direcție.

import { useEffect, useRef } from 'react';
import type { Map as LMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PIN_HTML = `<span class="asst-lf-pin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg></span>`;

export default function BusMap({ lat, lon, label, expanded }: { lat: number; lon: number; label: string; expanded: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<Marker | null>(null);

  // Harta se face o singură dată; Leaflet cere `window`, deci se încarcă aici.
  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        .setView([lat, lon], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '© OpenStreetMap',
      }).addTo(m);
      const icon = L.divIcon({ html: PIN_HTML, className: 'asst-lf-icon', iconSize: [38, 38], iconAnchor: [19, 19] });
      marker.current = L.marker([lat, lon], { icon, title: label, keyboard: false }).addTo(m);
      map.current = m;
      // Rotița mărește harta doar după un clic pe ea — altfel ar prinde derularea chatului.
      m.on('click', () => m.scrollWheelZoom.enable());
      m.on('mouseout', () => m.scrollWheelZoom.disable());
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poziția nouă: punctul se mută, harta îl urmează dacă a ieșit din vedere.
  useEffect(() => {
    const m = map.current;
    if (!m || !marker.current) return;
    marker.current.setLatLng([lat, lon]);
    marker.current.options.title = label;
    if (!m.getBounds().pad(-0.2).contains([lat, lon])) m.panTo([lat, lon]);
  }, [lat, lon, label]);

  // Ecranul complet schimbă mărimea cutiei; Leaflet trebuie să afle.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const t = setTimeout(() => { m.invalidateSize(); m.panTo([lat, lon]); }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  return <div ref={box} className="asst-lf" role="application" aria-label={label} />;
}
