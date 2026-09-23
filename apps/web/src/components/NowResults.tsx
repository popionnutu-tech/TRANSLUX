'use client';

// «Acum» de pe prima pagină (ION-43). Ion, 23.09: omul alege «de unde → încotro» și
// apasă «Acum» sau «Mai târziu»; fără geolocația lui, «minimalist și laconic».
// Aici: următoarele plecări de azi din localitatea omului — ora, în câte minute,
// șoferul, mașina, numărul lui și, lângă număr, butonul de apel («lângă număr șofer să
// fie buton apăsare să sune»). Pe harta deschisă, pe tot ecranul, punctul autobuzelor
// care sunt deja pe drum după grafic, cu ora cursei. Cursa aleasă din listă e roșie,
// pe hartă și în listă; harta se duce la autobuzul ei. Linia fină a rutei (route_shapes,
// migr. 392) și autobuzul pus pe ea; fără viteză, ca în chat (ION-39). Se actualizează o dată pe minut, cât fereastra e deschisă.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Locale } from '@/lib/i18n';
import { phoneTel, phoneText } from '@/lib/phone';

const ENDPOINT = process.env.NEXT_PUBLIC_ASSISTANT_URL || 'https://central-hub-md.vercel.app/api/asistent-site';
const REFRESH_MS = 60_000;
const RED = '#9B1B30';

interface NowTrip {
  departure: string;
  minutes_until: number;
  on_road: boolean;
  route_id: number | null;
  going_north: boolean;
  driver: string | null;
  plate: string | null;
  phone: string | null;
  lat?: number;
  lon?: number;
  near?: string | null;
}

type LatLon = [number, number];
interface RouteLine { shape: LatLon[]; from: LatLon | null; to: LatLon | null }
interface NowData { trips: NowTrip[]; routes?: Record<number, RouteLine>; line_ro: string | null; line_ru: string | null }

/** Cel mai apropiat punct al liniei (proiecție pe segmente); departe de linie — punctul GPS. */
function snapOn(p: LatLon, line: LatLon[]): { at: LatLon; seg: number } {
  const k = Math.cos((p[0] * Math.PI) / 180);
  let best: LatLon = p, bestD = Infinity, seg = -1;
  for (let i = 1; i < line.length; i++) {
    const [ay, ax] = line[i - 1], [by, bx] = line[i];
    const dx = (bx - ax) * k, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, (((p[1] - ax) * k) * dx + (p[0] - ay) * dy) / len)) : 0;
    const q: LatLon = [ay + t * (by - ay), ax + t * (bx - ax)];
    const d = ((q[1] - p[1]) * k) ** 2 + (q[0] - p[0]) ** 2;
    if (d < bestD) { bestD = d; best = q; seg = i; }
  }
  // ~0,02° ≈ 2 km: mai departe, autobuzul chiar nu e pe linia asta (ocol, depou).
  return bestD < 0.02 ** 2 ? { at: best, seg } : { at: p, seg: -1 };
}
const snap = (p: LatLon, line: LatLon[]): LatLon => snapOn(p, line).at;

/**
 * Încotro merge rutiera pe ecran: linia e în ordinea opririlor spre Chișinău, deci spre nord
 * se merge înapoi pe ea. Pe segmentul pe care stă mașina, estul = parbrizul în dreapta.
 */
function facesLeft(line: LatLon[], seg: number, goingNorth: boolean): boolean {
  if (seg < 1) return false;
  // Câteva segmente înainte și înapoi: o curbă mică nu întoarce mașina.
  const a = line[Math.max(0, seg - 4)], b = line[Math.min(line.length - 1, seg + 3)];
  const east = b[1] - a[1];
  return goingNorth ? east > 0 : east < 0;
}

/** «37369384765» → «+373 69 384 765» (Ion, 23.09: mereu +373, ca să sune și de peste hotare). */
function phoneView(raw: string): { text: string; tel: string } {
  return { text: phoneText(raw), tel: phoneTel(raw).replace(/^tel:/, '') };
}

const TXT = {
  ro: {
    close: 'Închide', call: 'Sună șoferul', loading: 'Caut autobuzele…', error: 'Nu am putut afla acum. Încercați peste un minut.',
    when: (m: number) => (m <= 0 ? 'acum' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`),
  },
  ru: {
    close: 'Закрыть', call: 'Позвонить водителю', loading: 'Ищу автобусы…', error: 'Не удалось узнать сейчас. Попробуйте через минуту.',
    when: (m: number) => (m <= 0 ? 'сейчас' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`),
  },
} as const;

const NO_ROUTES: Record<number, RouteLine> = {};

/**
 * Microbuz tip Sprinter, din lateral, botul la dreapta: caroserie înaltă, bot înclinat,
 * geamuri cu stâlpi, far, roți. Culorile vin din CSS (.now-bus / .now-bus.on), ca aceeași
 * formă să fie albă cu contur pentru celelalte curse și roșie pentru cea aleasă.
 */
const MINIBUS_SVG = `<svg viewBox="0 0 84 42" width="84" height="42" aria-hidden="true">
<path class="mb-body" d="M6 9.5Q6 5 10.5 5H58q4 0 6.6 3L75 20.5q3 3.2 3 7.5V32q0 2.5-2.5 2.5H8.5Q6 34.5 6 32Z"/>
<path class="mb-glass" d="M10.5 9.5Q10.5 8.5 11.5 8.5H57.5q2 0 3.3 1.6L69 19.5H10.5Z"/>
<path class="mb-post" d="M24 8.5V19.5M37.5 8.5V19.5M51 8.5V19.5"/>
<rect class="mb-light" x="73" y="23" width="4" height="3" rx="1"/>
<circle class="mb-wheel" cx="21" cy="34.5" r="5.2"/><circle class="mb-wheel" cx="63" cy="34.5" r="5.2"/>
<circle class="mb-hub" cx="21" cy="34.5" r="1.8"/><circle class="mb-hub" cx="63" cy="34.5" r="1.8"/>
</svg>`;

const PHONE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
);

function NowMap({ trips, routes, selected, onPick }: { trips: NowTrip[]; routes: Record<number, RouteLine>; selected: number; onPick: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
        .setView([47.3, 28.4], 8);
      // Plăcile OSM, ca în chat; decolorate din CSS (.leaflet-tile-pane), ca autobuzele roșii
      // să iasă în față. Carto light cere de acum cheie API (23.09: «API KEY REQUIRED» pe hartă).
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
      L.control.zoom({ position: 'topright' }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      m.on('click', () => m.scrollWheelZoom.enable());
      m.on('mouseout', () => m.scrollWheelZoom.disable());
      setReady(true);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Punctele se refac la fiecare actualizare; harta se potrivește pe ele doar prima dată,
  // ca omul care a mărit-o să nu fie aruncat înapoi la fiecare minut.
  const fitted = useRef(false);
  useEffect(() => {
    if (!ready || !map.current || !layer.current) return;
    (async () => {
      const L = (await import('leaflet')).default;
      const g = layer.current!;
      g.clearLayers();

      // Linia fină a rutei alese și, pe ea, localitatea omului și destinația.
      const route = trips[selected]?.route_id != null ? routes[trips[selected].route_id!] : undefined;
      if (route?.shape.length) {
        // Întreruptă (Ion, 23.09: «linia să fie întreruptă»): e drumul rutei, nu urma GPS.
        L.polyline(route.shape, { color: RED, weight: 3, opacity: 0.8, dashArray: '6 7', lineCap: 'round', interactive: false }).addTo(g);
        for (const [pt, cls] of [[route.from, 'from'], [route.to, 'to']] as const) {
          if (!pt) continue;
          // Centrul satului poate sta în afara traseului: capătul se pune pe linie.
          L.marker(snap(pt, route.shape), {
            icon: L.divIcon({ html: `<span class="now-end ${cls}"></span>`, className: 'now-pin-icon', iconSize: [16, 16], iconAnchor: [8, 8] }),
            keyboard: false, interactive: false,
          }).addTo(g);
        }
      }

      const pts: [number, number][] = [];
      trips.forEach((t, i) => {
        if (t.lat == null || t.lon == null) return;
        const on = i === selected;
        // Autobuzul stă pe linia rutei lui: GPS-ul e la câțiva metri de drum.
        const own = t.route_id != null ? routes[t.route_id]?.shape : undefined;
        const s = own ? snapOn([t.lat, t.lon], own) : { at: [t.lat, t.lon] as LatLon, seg: -1 };
        const at = s.at;
        // Fața rutierei spre direcția de mers (Ion, 23.09: «маршрутка должна быть в сторону
        // направления, куда едет морда»). Doar oglindit stânga/dreapta: ora rămâne de citit.
        const left = own ? facesLeft(own, s.seg, t.going_north) : false;
        const icon = L.divIcon({
          // Microbuzul văzut din lateral, cu ora pe caroserie (Ion, 23.09: «fă un microbuz mai
          // stilat, acesta nu se înțelege»). Se oglindește doar desenul, nu și ora.
          html: `<span class="now-bus${on ? ' on' : ''}${left ? ' left' : ''}">${MINIBUS_SVG}<b>${t.departure}</b></span>`,
          className: 'now-pin-icon', iconSize: [84, 42], iconAnchor: [42, 34],
        });
        L.marker(at, { icon, keyboard: false, title: t.departure, zIndexOffset: on ? 1000 : 0 })
          .on('click', () => onPick(i))
          .addTo(g);
        pts.push(at);
        if (on && route?.from) pts.push(route.from);
      });
      if (pts.length === 0 && route) pts.push(...[route.from, route.to].filter((x): x is LatLon => !!x));
      if (pts.length === 0 && route?.shape.length) pts.push(route.shape[0], route.shape[route.shape.length - 1]);
      if (!fitted.current && pts.length) {
        fitted.current = true;
        if (pts.length === 1) map.current!.setView(pts[0], 11);
        else map.current!.fitBounds(pts, { padding: [80, 80], maxZoom: 11 });
      }
    })();
  }, [trips, routes, ready, selected, onPick]);

  // Cursa aleasă din listă: harta se duce la autobuzul ei.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = trips[selected];
    if (map.current && t?.lat != null && t.lon != null) map.current.panTo([t.lat, t.lon]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return <div ref={box} className="now-map" role="application" aria-label="Harta" />;
}

export function NowResults({ from, to, fromValue, toValue, locale, onClose }: {
  from: string; to: string; fromValue: string; toValue: string; locale: Locale; onClose: () => void;
}) {
  const tx = TXT[locale];
  const [data, setData] = useState<NowData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${ENDPOINT}/acum`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromValue, to: toValue }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [fromValue, toValue]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trips = data?.trips ?? [];
  const sel = selected < trips.length ? selected : 0;
  // Harta apare și fără autobuz pe drum, dacă avem linia rutei: omul vede pe unde va veni.
  const withPoint = trips.some((t) => t.lat != null || (t.route_id != null && !!data?.routes?.[t.route_id]));
  const empty = data && trips.length === 0;

  return (
    <div className="now-overlay" onClick={onClose}>
      <div className={`now-box${withPoint ? '' : ' no-map'}`} role="dialog" aria-modal="true" aria-label={`${from} → ${to}`} onClick={(e) => e.stopPropagation()}>
        {withPoint && <NowMap trips={trips} routes={data?.routes ?? NO_ROUTES} selected={sel} onPick={setSelected} />}

        <div className="now-top">
          <span className="now-title"><span className="now-dot" />{from} → {to}</span>
          <button type="button" className="now-close" aria-label={tx.close} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="now-panel">
          {!data && !failed && <p className="now-note">{tx.loading}</p>}
          {failed && !data && <p className="now-note">{tx.error}</p>}
          {empty && <p className="now-note">{locale === 'ru' ? data!.line_ru : data!.line_ro}</p>}
          {trips.map((t, i) => {
            const phone = t.phone ? phoneView(t.phone) : null;
            const crew = [t.driver, t.plate].filter(Boolean).join(' · ');
            return (
              <div key={t.departure + i} className={`now-row${i === sel ? ' on' : ''}`} onClick={() => setSelected(i)}>
                <div className="now-info">
                  <div className="now-line">
                    <span className="now-time">{t.departure}</span>
                    <span className="now-when">{tx.when(t.minutes_until)}</span>
                  </div>
                  {crew && <span className="now-crew">{crew}</span>}
                  {phone && <span className="now-num">{phone.text}</span>}
                </div>
                {phone && (
                  <a className="now-call" href={`tel:${phone.tel}`} aria-label={`${tx.call} ${phone.text}`} onClick={(e) => e.stopPropagation()}>
                    {PHONE_SVG}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
.now-overlay{position:fixed;inset:0;z-index:60;background:rgba(40,12,18,.35);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font-opensans),Open Sans,sans-serif;color:#231A1C}
.now-box{position:relative;width:100%;max-width:1000px;height:min(700px,calc(100vh - 48px));background:#F3F1EF;border-radius:28px;box-shadow:0 30px 80px rgba(40,10,18,.35);overflow:hidden}
.now-box.no-map{height:auto;max-width:460px;background:#fff;padding-top:84px}
.now-map{position:absolute;inset:0;isolation:isolate;z-index:0;background:#F3F1EF}
.now-map .leaflet-top.leaflet-right{top:76px}
.now-map .leaflet-tile-pane{filter:grayscale(1) brightness(1.06) contrast(.92)}
.now-top{position:absolute;left:20px;right:20px;top:20px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}
.now-title,.now-close{pointer-events:auto;background:#fff;box-shadow:0 6px 18px rgba(40,10,18,.12)}
.now-title{height:48px;padding:0 20px;border-radius:24px;display:flex;align-items:center;gap:12px;font-size:17px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.now-dot{flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${RED};animation:now-pulse 2s infinite}
@keyframes now-pulse{0%{box-shadow:0 0 0 0 rgba(155,27,48,.45)}70%{box-shadow:0 0 0 7px rgba(155,27,48,0)}100%{box-shadow:0 0 0 0 rgba(155,27,48,0)}}
.now-close{flex-shrink:0;width:48px;height:48px;border-radius:50%;border:none;color:#231A1C;display:flex;align-items:center;justify-content:center;cursor:pointer}
.no-map .now-title,.no-map .now-close{box-shadow:none;background:#F6ECEE}
.now-panel{position:absolute;left:20px;bottom:20px;z-index:2;width:320px;max-height:calc(100% - 108px);overflow-y:auto;background:#fff;border-radius:22px;box-shadow:0 12px 32px rgba(40,10,18,.16)}
.no-map .now-panel{position:static;width:auto;max-height:none;margin:0 16px 16px;box-shadow:none;border:1px solid #F1E8EA}
.now-note{margin:0;padding:22px 20px;font-size:15px;line-height:1.5;color:#6E5A5E}
.now-row{display:flex;align-items:center;gap:12px;padding:14px 14px 14px 20px;border-bottom:1px solid #F1E8EA;cursor:pointer}
.now-row:last-child{border-bottom:none}
.now-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.now-line{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.now-time{font-size:19px;font-weight:700}
.now-when{font-size:14px;font-weight:600;color:${RED};white-space:nowrap}
.now-crew{font-size:13px;color:#8A7B7F}
.now-num{font-size:14px;font-weight:600;letter-spacing:.02em}
.now-call{flex-shrink:0;width:44px;height:44px;border-radius:50%;background:#F6ECEE;color:${RED};display:flex;align-items:center;justify-content:center;text-decoration:none;transition:transform .15s ease}
.now-call:hover{transform:scale(1.06)}
.now-row.on{background:${RED};color:#fff;padding:18px 16px 18px 20px;cursor:default}
.now-row.on .now-time{font-size:28px;font-weight:800}
.now-row.on .now-when{color:#fff;opacity:.9;font-size:16px;font-weight:700}
.now-row.on .now-crew{color:#fff;opacity:.85;font-size:14px}
.now-row.on .now-num{font-size:18px;font-weight:700;margin-top:6px}
.now-row.on .now-call{width:52px;height:52px;background:#fff;color:${RED};box-shadow:0 4px 12px rgba(0,0,0,.18);align-self:flex-end}
.now-pin-icon{background:none!important;border:none!important}
.now-bus{position:relative;display:block;width:84px;height:42px;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(0,0,0,.22))}
.now-bus svg{position:absolute;inset:0;overflow:visible}
.now-bus.left svg{transform:scaleX(-1)}
.now-bus .mb-body{fill:#fff;stroke:${RED};stroke-width:2}
.now-bus .mb-glass{fill:#2E2A33}
.now-bus .mb-post{stroke:#fff;stroke-width:1.6}
.now-bus .mb-light{fill:#F2B84B}
.now-bus .mb-wheel{fill:#231A1C;stroke:#fff;stroke-width:1.6}
.now-bus .mb-hub{fill:#C9C2C4}
.now-bus b{position:absolute;left:10px;right:10px;top:20px;height:13px;display:flex;align-items:center;justify-content:center;font:800 11.5px/1 var(--font-opensans),Open Sans,sans-serif;letter-spacing:.02em;color:${RED}}
.now-bus.on .mb-body{fill:${RED};stroke:#fff}
.now-bus.on .mb-glass{fill:#3A0D16}
.now-bus.on b{color:#fff}
.now-bus.on{filter:drop-shadow(0 0 6px rgba(155,27,48,.45)) drop-shadow(0 2px 3px rgba(0,0,0,.25))}
.now-end{display:block;width:16px;height:16px;border-radius:50%;box-sizing:border-box;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.now-end.from{background:#231A1C}
.now-end.to{background:#fff;border:4px solid ${RED}}
@media (max-width:720px){
  .now-overlay{padding:0}
  .now-box{max-width:none;height:100%;border-radius:0}
  .now-box.no-map{height:100%;max-width:none}
  .now-top{left:12px;right:12px;top:12px}
  .now-title{height:46px;font-size:16px}
  .now-close{width:46px;height:46px}
  .now-map .leaflet-top.leaflet-right{top:66px}
  .now-panel{left:12px;right:12px;bottom:12px;width:auto;max-height:55%}
}
`}</style>
    </div>
  );
}
