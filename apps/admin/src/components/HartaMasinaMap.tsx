'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CULOARE, LINIE, NUME_TIP, cadru, durata, oraLocala, type LinieSchelet, type Punct, type ZiHarta,
} from '@/lib/lde/drax-harta';
import { culoareLoc, etichetaLoc } from '@/lib/lde/drax-parcare';

// Harta unei mașini pe o zi (ION-130): dedesubt linia (liniile) ei din schelet, deasupra urma GPS pe intervale colorate după ce face
// mașina, opririle ≥ 5 min, casa, locul nopții și porțile. Intervalul ales în listă se îngroașă, celelalte pălesc.
function Incadreaza({ zi, linii, ales }: { zi: ZiHarta; linii: LinieSchelet[]; ales: string | null }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  useEffect(() => {
    const v = ales ? zi.iv.find((x) => x.ora === ales) : null;
    const b = v && v.s.length > 1
      ? cadru({ ...zi, iv: [v] }, [])
      : cadru(zi, linii);
    if (b) map.fitBounds(b, { padding: [40, 40], maxZoom: 14 });
  }, [zi, linii, ales, map]);
  return null;
}

// ION-136: locul de parcare propus — insignă mare «P1» / «P2», în culoarea lui, cu numele permanent alături
const insigna = (nr: number) => L.divIcon({ className: '', iconSize: [36, 30], iconAnchor: [18, 15],
  html: `<div style="background:${culoareLoc(nr)};color:#fff;font:700 14px/1 system-ui,sans-serif;padding:7px 8px;border-radius:8px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5);text-align:center">P${nr}</div>` });

const INEL = (culoare: string, r = 7) => ({ radius: r, pathOptions: { color: culoare, weight: 3, fillColor: '#fff', fillOpacity: 1 } });

export default function HartaMasinaMap({ zi, linii, porti, ales, onAlege }: {
  zi: ZiHarta; linii: LinieSchelet[]; porti: { c: Punct; n: string }[]; ales: string | null; onAlege: (ora: string | null) => void;
}) {
  const ora = (s: number) => oraLocala(zi.t00, s);
  return (
    <MapContainer center={porti[0].c} zoom={10} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={0.6}
      />
      <Incadreaza zi={zi} linii={linii} ales={ales} />

      {/* scheletul: linia ideală a mașinii, lată și palidă, ca urma să se vadă peste ea */}
      {linii.map((l) => (
        <Polyline key={`sch-${l.id}`} positions={l.plin} pathOptions={{ color: '#C9B458', weight: 11, opacity: 0.35, lineCap: 'round' }}>
          <Tooltip sticky>Scheletul: {l.id.replace('|', ' · ')}</Tooltip>
        </Polyline>
      ))}
      {linii.flatMap((l) => l.sate.map((s) => (
        <CircleMarker key={`sat-${l.id}-${s.n}`} center={s.c} radius={s.n === l.capat ? 5 : 3}
          pathOptions={{ color: s.n === l.capat ? '#8A6D0B' : '#9C8F66', weight: 1.5, fillColor: '#fff', fillOpacity: 1 }}>
          <Tooltip direction="right" offset={[5, 0]}>{s.n === l.capat ? <b>{s.n} — capătul liniei</b> : s.n}</Tooltip>
        </CircleMarker>
      )))}

      {zi.iv.map((v) => {
        if (v.s.length < 2) return null;
        const sel = ales === v.ora, pal = ales !== null && !sel;
        return (
          <Polyline
            key={`iv-${v.ora}-${v.t0}`}
            positions={v.s.map((p) => [p[0], p[1]] as Punct)}
            eventHandlers={{ click: () => onAlege(sel ? null : v.ora) }}
            pathOptions={{ color: CULOARE[v.tip], weight: sel ? 7 : v.tip === 'cursa' ? 4.5 : 3.5, opacity: pal ? 0.25 : 0.95, dashArray: LINIE[v.tip] }}
          >
            <Tooltip sticky>
              <b>{v.ora}</b> · {NUME_TIP[v.tip]} · {v.km.toLocaleString('ro-RO')} km
              {v.de || v.pana ? <><br />{v.de ?? '—'} → {v.pana ?? '—'}</> : null}
              {v.prelungit ? <><br />prelungită prin {v.prelungit}</> : null}
            </Tooltip>
          </Polyline>
        );
      })}

      {zi.stai.map(([la, lo, a, b, n], i) => (
        <CircleMarker key={`st-${i}`} center={[la, lo]} radius={Math.min(9, 3 + Math.sqrt((b - a) / 600))}
          pathOptions={{ color: '#23191B', weight: 1.2, fillColor: '#F2E7C9', fillOpacity: 0.95 }}>
          <Tooltip>stă {durata(b - a)} la {n}<br />{ora(a)}–{ora(b)}</Tooltip>
        </CircleMarker>
      ))}

      {zi.casa && (
        <CircleMarker center={zi.casa.c} {...INEL('#2E7D32', 9)}>
          <Tooltip direction="top" offset={[0, -8]} permanent>acasă · {zi.casa.n}</Tooltip>
        </CircleMarker>
      )}
      {[zi.noapteA && { ...zi.noapteA, cand: 'noaptea dinainte' }, zi.noapteB && { ...zi.noapteB, cand: 'noaptea de după' }].map((x) => x && (
        <CircleMarker key={x.cand} center={x.c} {...INEL('#5B3A8C', 6)}>
          <Tooltip direction="bottom" offset={[0, 6]}>{x.cand}: {x.n}{x.min ? ` (${durata(x.min * 60)})` : ''}</Tooltip>
        </CircleMarker>
      ))}

      {/* ION-136: drumurile propuse (capătul cursei → locul de parcare → plecarea următoare), punctate în culoarea locului */}
      {(zi.parcare?.legi ?? []).filter((l) => !l.separat).flatMap((l, i) => {
        const loc = zi.parcare!.locuri.find((x) => x.nr === l.loc); if (!loc) return [];
        const sel = ales !== null && (ales === l.ora || ales === l.oraDim), pal = ales !== null && !sel;
        const po = { color: culoareLoc(l.loc), weight: sel ? 5 : 3.5, opacity: pal ? 0.25 : 0.95, dashArray: '1 8', lineCap: 'round' as const };
        const txt = `propus: ${l.aN ?? 'capăt'} → ${etichetaLoc(loc)} → ${l.bN ?? 'capăt'}, ${l.km.toLocaleString('ro-RO')} km${l.parte === 'noapte' ? ' (noaptea)' : ''}`;
        const out = [];
        if (l.parte !== 'noapte' || l.seara) out.push(<Polyline key={`pa-${i}`} positions={[l.a, loc.c]} pathOptions={po}><Tooltip sticky>{txt}</Tooltip></Polyline>);
        if (l.parte !== 'noapte' || l.dimineata) out.push(<Polyline key={`pb-${i}`} positions={[loc.c, l.b]} pathOptions={po}><Tooltip sticky>{txt}</Tooltip></Polyline>);
        return out;
      })}
      {(zi.parcare?.locuri ?? []).map((l) => (
        <Marker key={`P${l.nr}`} position={l.c} icon={insigna(l.nr)} zIndexOffset={1000}>
          <Tooltip direction="right" offset={[18, 0]} permanent opacity={1}><b>{etichetaLoc(l)}</b> — parcare propusă</Tooltip>
        </Marker>
      ))}

      {porti.map((p) => (
        <CircleMarker key={p.n} center={p.c} radius={6} pathOptions={{ color: '#23191B', weight: 2, fillColor: '#23191B', fillOpacity: 1 }}>
          <Tooltip direction="right" offset={[7, 0]}>{p.n.length <= 4 ? `poarta ${p.n}` : p.n}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
