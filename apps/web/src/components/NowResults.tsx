'use client';

// «Acum» de pe prima pagină (ION-43). Ion, 23.09: omul alege «de unde → încotro» și
// apasă «Acum» sau «Mai târziu»; fără geolocația lui, «minimalist și laconic».
// Aici: următoarele plecări de azi din localitatea omului — lista cu ora, în câte minute,
// șoferul, mașina și numărul lui; pe hartă punctul autobuzelor care sunt deja pe drum
// după grafic, cu ora cursei. Fără traseu și fără viteză, ca în chat (ION-39).
// Se actualizează o dată pe minut, cât fereastra e deschisă.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Locale } from '@/lib/i18n';

const ENDPOINT = process.env.NEXT_PUBLIC_ASSISTANT_URL || 'https://central-hub-md.vercel.app/api/asistent-site';
const REFRESH_MS = 60_000;
const RED = '#9B1B30';

interface NowTrip {
  departure: string;
  minutes_until: number;
  on_road: boolean;
  driver: string | null;
  plate: string | null;
  phone: string | null;
  lat?: number;
  lon?: number;
  near?: string | null;
}

interface NowData { trips: NowTrip[]; line_ro: string | null; line_ru: string | null }

/** «37369384765» → «069 384 765» pentru ochi; linkul sună pe «+37369384765». */
function phoneView(raw: string): { text: string; tel: string } {
  const d = raw.replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('373') ? `0${d.slice(3)}` : d.length === 9 && d.startsWith('0') ? d : null;
  if (!local) return { text: raw, tel: raw.replace(/[^\d+]/g, '') };
  return { text: `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`, tel: `+373${local.slice(1)}` };
}

const BUS_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';

const TXT = {
  ro: {
    now: 'Acum', close: 'Închide', loading: 'Caut autobuzele…', error: 'Nu am putut afla acum. Încercați peste un minut.',
    at: (place: string, m: number) => (m <= 0 ? `la ${place} acum` : `la ${place} în ${m} min`),
  },
  ru: {
    now: 'Сейчас', close: 'Закрыть', loading: 'Ищу автобусы…', error: 'Не удалось узнать сейчас. Попробуйте через минуту.',
    at: (place: string, m: number) => (m <= 0 ? `в ${place} сейчас` : `в ${place} через ${m} мин`),
  },
} as const;

function NowMap({ trips }: { trips: NowTrip[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        .setView([47.3, 28.4], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
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
      const pts: [number, number][] = [];
      for (const t of trips) {
        if (t.lat == null || t.lon == null) continue;
        const icon = L.divIcon({
          html: `<span class="now-pin">${BUS_SVG}<b>${t.departure}</b></span>`,
          className: 'now-pin-icon', iconSize: [78, 30], iconAnchor: [15, 15],
        });
        L.marker([t.lat, t.lon], { icon, keyboard: false, title: t.departure }).addTo(g);
        pts.push([t.lat, t.lon]);
      }
      if (!fitted.current && pts.length) {
        fitted.current = true;
        if (pts.length === 1) map.current!.setView(pts[0], 11);
        else map.current!.fitBounds(pts, { padding: [50, 50], maxZoom: 11 });
      }
    })();
  }, [trips, ready]);

  return <div ref={box} className="now-map" role="application" aria-label="Harta" />;
}

export function NowResults({ from, to, fromValue, toValue, locale, onClose }: {
  from: string; to: string; fromValue: string; toValue: string; locale: Locale; onClose: () => void;
}) {
  const tx = TXT[locale];
  const [data, setData] = useState<NowData | null>(null);
  const [failed, setFailed] = useState(false);

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
  const withPoint = trips.some((t) => t.lat != null);
  const empty = data && trips.length === 0;

  return (
    <div className="now-overlay" onClick={onClose}>
      <div className="now-box" role="dialog" aria-modal="true" aria-label={`${from} → ${to}`} onClick={(e) => e.stopPropagation()}>
        <div className="now-head">
          <button type="button" className="now-close" aria-label={tx.close} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span className="now-title">{from} → {to}</span>
          <span className="now-badge"><span className="now-dot" />{tx.now}</span>
        </div>

        <div className={`now-body${withPoint ? '' : ' no-map'}`}>
          <div className="now-list">
            {!data && !failed && <p className="now-note">{tx.loading}</p>}
            {failed && !data && <p className="now-note">{tx.error}</p>}
            {empty && <p className="now-note">{locale === 'ru' ? data!.line_ru : data!.line_ro}</p>}
            {trips.map((t, i) => (
              <div key={t.departure + i} className={`now-row${i === 0 ? ' first' : ''}`}>
                <div className="now-row-top">
                  <span className="now-time">{t.departure}</span>
                  <span className="now-when">{tx.at(from, t.minutes_until)}</span>
                </div>
                {(t.driver || t.plate) && <span className="now-crew">{[t.driver, t.plate].filter(Boolean).join(' · ')}</span>}
                {t.phone && <a className="now-phone" href={`tel:${phoneView(t.phone).tel}`}>{phoneView(t.phone).text}</a>}
              </div>
            ))}
          </div>
          {withPoint && <NowMap trips={trips} />}
        </div>
      </div>

      <style>{`
.now-overlay{position:fixed;inset:0;z-index:60;background:rgba(40,12,18,.35);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font-opensans),Open Sans,sans-serif}
.now-box{width:100%;max-width:960px;height:min(640px,calc(100vh - 48px));background:#fff;border-radius:24px;box-shadow:0 24px 60px rgba(60,20,30,.25);display:flex;flex-direction:column;overflow:hidden}
.now-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #F2E8E6}
.now-close{width:44px;height:44px;border-radius:12px;border:none;background:#F5ECEA;color:${RED};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.now-title{flex:1;font-size:19px;font-weight:700;color:#2A1418;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.now-badge{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:${RED}}
.now-dot{width:8px;height:8px;border-radius:50%;background:${RED};animation:now-pulse 2s infinite}
@keyframes now-pulse{0%{box-shadow:0 0 0 0 rgba(155,27,48,.45)}70%{box-shadow:0 0 0 7px rgba(155,27,48,0)}100%{box-shadow:0 0 0 0 rgba(155,27,48,0)}}
.now-body{flex:1;display:grid;grid-template-columns:320px 1fr;min-height:0}
.now-body.no-map{grid-template-columns:1fr}
.now-list{overflow-y:auto;border-right:1px solid #F2E8E6}
.now-body.no-map .now-list{border-right:none;max-width:480px;width:100%;margin:0 auto}
.now-note{margin:0;padding:24px 20px;font-size:15px;line-height:1.5;color:#6E5A5E}
.now-row{padding:16px 20px;display:flex;flex-direction:column;gap:3px;border-bottom:1px solid #F2E8E6}
.now-row.first{background:#FBF6F5}
.now-row-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.now-time{font-size:20px;font-weight:700;color:#2A1418}
.now-row.first .now-time{font-size:24px}
.now-when{font-size:14px;font-weight:600;color:${RED};text-align:right}
.now-crew{font-size:15px;color:#5A3A40}
.now-phone{font-size:17px;font-weight:700;color:${RED};text-decoration:none}
.now-phone:hover{text-decoration:underline}
.now-map{position:relative;min-height:0;isolation:isolate;background:#EFE7E4}
.now-pin-icon{background:none!important;border:none!important}
.now-pin{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px 0 8px;border-radius:15px;background:${RED};color:#fff;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.25);font:700 13px var(--font-opensans),Open Sans,sans-serif;white-space:nowrap;box-sizing:border-box}
@media (max-width:720px){
  .now-overlay{padding:0}
  .now-box{max-width:none;height:100%;border-radius:0}
  .now-body{grid-template-columns:1fr;grid-template-rows:minmax(0,45vh) auto;overflow-y:auto}
  .now-body.no-map{grid-template-rows:auto}
  .now-list{order:2;border-right:none;overflow:visible}
  .now-map{order:1;height:45vh}
}
`}</style>
    </div>
  );
}
