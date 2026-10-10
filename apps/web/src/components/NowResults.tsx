'use client';

import type * as React from 'react';

// «Acum» de pe prima pagină (ION-43). Ion, 23.09: omul alege «de unde → încotro» și
// apasă «Acum» sau «Mai târziu»; fără geolocația lui, «minimalist și laconic».
// Aici: următoarele plecări de azi din localitatea omului — ora, în câte minute,
// șoferul, mașina, numărul lui și, lângă număr, butonul de apel («lângă număr șofer să
// fie buton apăsare să sune»). Pe harta deschisă, pe tot ecranul, punctul autobuzelor
// care sunt deja pe drum după grafic, cu ora cursei. Cursa aleasă din listă e roșie,
// pe hartă și în listă; harta se duce la autobuzul ei. Linia fină a rutei (route_shapes,
// migr. 392) și autobuzul pus pe ea; fără viteză, ca în chat (ION-39). Se actualizează o dată pe minut, cât fereastra e deschisă.
//
// ION-206 (Ion, 03.10, «site ultrafast»): la deschidere pornesc ÎN PARALEL Leaflet, legătura cu
// serverul de plăci și cererea GET /acum (fără preflight); harta se montează goală pe loc și primește
// datele când vin. Linia rutelor vine o singură dată de la /forme (immutable, pe amprentă) și stă în
// memorie — poll-ul aduce doar pozițiile. Cu tab-ul ascuns nu se cere nimic. La zoom nu se reface
// nimic în afară de numele orașelor: geometria se calculează o dată per set de date.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Locale } from '@/lib/i18n';
import { phoneTel, phoneText } from '@/lib/phone';
import { track } from '@/lib/track';
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL, loadLeaflet, preconnectTiles, type Leaflet } from '@/lib/map-tiles';
import { citesteForme, scrieForme } from '@/lib/forme-memorate';
import { BILET_MAX_ZOOM, BILET_ZOOM_UN_PUNCT, fazaBilet, incadrareBilet, intre, paddingBilet, snapOn, type FazaBilet } from '@/lib/harta-bilet';

const ENDPOINT = process.env.NEXT_PUBLIC_ASSISTANT_URL || 'https://central-hub-md.vercel.app/api/asistent-site';
const REFRESH_MS = 60_000;
const RED = '#9B1B30';
/** Reperul hărții «Acum» (ION-100): autogara Bălți, ca în route_shapes.stops. */
const BALTI: [number, number] = [47.76972, 27.94175];
/** «12:44» → minute; diferența dintre ora reală și grafic se arată doar de la atâtea minute (ION-100). */
const hm = (x: string) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
const PLAN_DIFF_MIN = 3;
const near = (a: LatLon, b: LatLon) => Math.abs(a[0] - b[0]) < 0.03 && Math.abs(a[1] - b[1]) < 0.04;

/**
 * Culoarea liniei fiecărei rutiere, în ordinea listei (Ion, 27.09, ION-100: «linia de altă culoare
 * pentru fiecare mașină»; mașinile rămân bordo, «doar liniile diferit»). Se deosebesc pe harta gri;
 * bordo rămâne pentru mașini și stația omului.
 */
const LINE_COLORS = ['#2563C9', '#E07A1F', '#1F8A4C', '#7C4DCC', '#0E8C96'];
const lineColor = (i: number) => LINE_COLORS[i % LINE_COLORS.length];
/** Sub atâția km de linia unei rutiere care vine mai devreme, drumul e comun: rămâne o singură linie. */
const JOIN_KM = 0.15;

/** Distanța aproximativă (km) de la punct la cea mai apropiată porțiune a liniei. */
function kmToLine(p: LatLon, line: LatLon[]): number {
  const k = Math.cos((p[0] * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ay, ax] = line[i - 1], [by, bx] = line[i];
    const dx = (bx - ax) * k, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, (((p[1] - ax) * k) * dx + (p[0] - ay) * dy) / len)) : 0;
    const d = ((ax + t * (bx - ax) - p[1]) * k) ** 2 + (ay + t * (by - ay) - p[0]) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best) * 111.2;
}

/** Cât de departe se poate deschide harta «Acum» cel mult (ION-100). */
const MIN_OPEN_ZOOM = 9;

export interface NowTrip {
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
  /** Mașina fără GPS: poziție orientativă pe linie, din orele tipice pe opriri (ION-43). */
  estimated?: boolean;
  /** Mașina stă acum într-o gară / oprire principală a rutei; `mine` = chiar oprirea omului (ION-43). */
  at_stop?: { name: string; mine: boolean };
  /** Ora orientativă reală la oprirea omului («HH:MM») și minutele până la ea (ION-39). */
  eta?: string;
  eta_min?: number;
  eta_source?: 'gps' | 'istoric';
  /** ION-249: cursa clientului a trecut deja de oprirea lui (punctul vine de la /pozitie). */
  plecata?: boolean;
}

type LatLon = [number, number];
interface RouteLine { shape: LatLon[]; from: LatLon | null; to: LatLon | null }
/** Orașul scris pe hartă; `end` = localitatea omului sau destinația lui (au deja punctul lor pe linie). */
interface Place { name: string; lat: number; lon: number; end: boolean }
/** Ruta așa cum vine de la /acum: amprenta `v` a liniei (ION-206); `shape` doar de la central-hub vechi, cu linia în răspuns. */
interface RouteRef { v?: string; shape?: LatLon[]; from: LatLon | null; to: LatLon | null }
interface NowRaw { trips: NowTrip[]; routes?: Record<number, RouteRef>; places?: Place[]; line_ro: string | null; line_ru: string | null }
interface NowData extends Omit<NowRaw, 'routes'> { routes: Record<number, RouteLine> }

/** Liniile rutelor, pe amprentă («id:v»), cât trăiește pagina: vin o dată de la /forme, nu la fiecare poll (ION-206). */
const shapeStore = new Map<string, LatLon[]>();
/** ION-277: și pe telefon (localStorage), ca la a doua deschidere drumul să apară fără cerere; amprenta exclude liniile vechi. */
const stocareLocala = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* privat / plin */ } },
};
let formeIncarcate = false;
function incarcaFormeMemorate(): void {
  if (formeIncarcate || typeof window === 'undefined') return;
  formeIncarcate = true;
  for (const [k, v] of citesteForme(stocareLocala)) if (!shapeStore.has(k)) shapeStore.set(k, v);
}
/** central-hub vechi, fără GET pe /acum (405): se trece pe POST până la deploy-ul lui. */
let postOnly = false;

/** GET cu query = cerere «simplă», fără preflight CORS; `lang` e informativ, serverul trimite ambele fraze. */
async function fetchAcum(from: string, to: string, lang: Locale): Promise<NowRaw> {
  const q = new URLSearchParams({ from, to, lang });
  let res = postOnly ? null : await fetch(`${ENDPOINT}/acum?${q}`);
  if (!res || res.status === 405 || res.status === 404) {
    postOnly = true;
    res = await fetch(`${ENDPOINT}/acum`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) });
  }
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/**
 * ION-249 (Ion, 05.10: «pe hartă a rămas biletul și scrie autobuzul încă nu e pe drum»): «Acum» arată doar autobuzele
 * care încă n-au trecut prin oprirea omului; după plecare cursa clientului dispare din listă. Atunci punctul vine de la
 * /pozitie (autobuzul cursei, pe tot drumul, cu regulile ION-37) și cursa se pune înapoi în listă, marcată «plecată».
 */
async function cursaDupaPlecare(from: string, to: string, departure: string, routeId: number | null): Promise<NowTrip | null> {
  try {
    const q = new URLSearchParams({ from, to, departure });
    const r = await fetch(`${ENDPOINT}/pozitie?${q}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json() as { live?: boolean; card?: { lat?: number; lon?: number; driver?: string | null; plate?: string | null; phone?: string | null; near?: string | null } };
    const c = j.card;
    if (!j.live || !c || typeof c.lat !== 'number' || typeof c.lon !== 'number') return null;
    return {
      departure, minutes_until: 0, on_road: true, route_id: routeId, going_north: false, plecata: true,
      driver: c.driver ?? null, plate: c.plate ?? null, phone: c.phone ?? null, lat: c.lat, lon: c.lon, near: c.near ?? null,
    };
  } catch {
    return null;
  }
}

/** Liniile lipsă din memorie se cer o dată de la /forme; ruta fără linie nu se desenează (punctul rămâne). */
async function withShapes(raw: NowRaw): Promise<Record<number, RouteLine>> {
  incarcaFormeMemorate();
  const refs = Object.entries(raw.routes ?? {});
  const missing = refs.filter(([id, r]) => !r.shape && r.v && !shapeStore.has(`${id}:${r.v}`));
  if (missing.length) {
    try {
      const res = await fetch(`${ENDPOINT}/forme?ids=${missing.map(([id, r]) => `${id}:${r.v}`).join(',')}`);
      if (res.ok) {
        const { shapes } = await res.json() as { shapes?: Record<string, LatLon[]> };
        for (const [id, r] of missing) {
          const s = shapes?.[id];
          if (Array.isArray(s)) shapeStore.set(`${id}:${r.v}`, s);
        }
        scrieForme(stocareLocala, shapeStore);
      }
    } catch { /* la poll-ul următor se încearcă iar */ }
  }
  const out: Record<number, RouteLine> = {};
  for (const [id, r] of refs) {
    const shape = r.shape ?? (r.v ? shapeStore.get(`${id}:${r.v}`) : undefined);
    if (shape) out[Number(id)] = { shape, from: r.from, to: r.to };
  }
  return out;
}

const snap = (p: LatLon, line: LatLon[]): LatLon => snapOn(p, line).at;

/**
 * Încotro merge rutiera, în grade pe ecran (0 = spre dreapta, 90 = în jos): linia e în
 * ordinea opririlor spre Chișinău, deci spre nord se merge înapoi pe ea. Câteva segmente
 * înainte și înapoi, ca o curbă mică să nu întoarcă săgeata. null = mașina nu e pe linie.
 */
function heading(line: LatLon[], seg: number, goingNorth: boolean): number | null {
  if (seg < 1) return null;
  let a = line[Math.max(0, seg - 4)], b = line[Math.min(line.length - 1, seg + 3)];
  if (goingNorth) [a, b] = [b, a];
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2(-(b[0] - a[0]), (b[1] - a[1]) * k) * 180) / Math.PI;
}

/** «37369384765» → «+373 69 384 765» (Ion, 23.09: mereu +373, ca să sune și de peste hotare). */
function phoneView(raw: string): { text: string; tel: string } {
  return { text: phoneText(raw), tel: phoneTel(raw).replace(/^tel:/, '') };
}

const TXT = {
  ro: {
    close: 'Închide', call: 'Sună șoferul', loading: 'Caut autobuzele…', error: 'Nu am putut afla acum. Încercați peste un minut.',
    plan: (t: string) => `după grafic ${t}`,
    here: 'în stație',
    mine: 'stația ta',
    when: (m: number) => (m <= 0 ? 'acum' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`),
  },
  ru: {
    close: 'Закрыть', call: 'Позвонить водителю', loading: 'Ищу автобусы…', error: 'Не удалось узнать сейчас. Попробуйте через минуту.',
    plan: (t: string) => `по графику ${t}`,
    here: 'на остановке',
    mine: 'ваша остановка',
    when: (m: number) => (m <= 0 ? 'сейчас' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`),
  },
} as const;

const NO_ROUTES: Record<number, RouteLine> = {};
const NO_PLACES: Place[] = [];

/** Microbuzul văzut din față, în cercul insignei (varianta C, aleasă de Ion pe 24.09). */
const BUS_FRONT_SVG = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="1" width="18" height="15" rx="3"/><path d="M1 9h18M5 16v3M15 16v3"/><circle cx="5.5" cy="12.5" r=".8" fill="currentColor"/><circle cx="14.5" cy="12.5" r=".8" fill="currentColor"/></svg>`;

/** Săgeata de pe marginea insignei, desenată spre dreapta; o rotește unghiul de mers. */
const ARROW_SVG = `<svg viewBox="-22 -22 44 44" width="44" height="44" aria-hidden="true"><path d="M25 0 L15 -8.5 L15 8.5 Z"/></svg>`;

const PHONE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
);

/**
 * Doar drumul care urmează (Ion, 24.09, 08:17: «apare traseul în spate deja parcurs la
 * mașină»): de la autobuz — sau, cât nu e pe hartă, de la localitatea omului — până la
 * destinația lui, în sensul de mers. Linia e în ordinea opririlor spre Chișinău.
 */
function ahead(route: RouteLine, t: NowTrip | undefined, untilFrom = false): LatLon[] {
  const line = route.shape;
  if (!t || line.length < 2) return line;
  const bus = t.lat != null && t.lon != null ? snapOn([t.lat, t.lon], line) : null;
  const start = bus && bus.seg > 0 ? bus : route.from ? snapOn(route.from, line) : null;
  const stop = untilFrom ? route.from : route.to;
  const end = stop ? snapOn(stop, line) : null;
  if (!start || start.seg < 1) return line;
  // Segmentul `seg` e între line[seg-1] și line[seg].
  if (t.going_north) {
    // Spre nord se merge înapoi pe linie: line[start.seg-1], …, line[end.seg], apoi capătul.
    const hasEnd = !!end && end.seg > 0 && end.seg <= start.seg;
    return [start.at, ...line.slice(hasEnd ? end!.seg : 0, start.seg).reverse(), ...(hasEnd ? [end!.at] : [])];
  }
  // Spre Chișinău: line[start.seg], …, line[end.seg-1], apoi capătul.
  const hasEnd = !!end && end.seg >= start.seg;
  return [start.at, ...line.slice(start.seg, hasEnd ? end!.seg : line.length), ...(hasEnd ? [end!.at] : [])];
}

/**
 * Marginile hărții acoperite de fereastră: antetul sus; pe telefon lista jos (≈30% din
 * înălțime), pe calculator lista în stânga (320 px). Autobuzul și capetele stau în rest.
 */
function panelPadding(m: LMap): { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] } {
  const { x, y } = m.getSize();
  const phone = x <= 720;
  return phone
    ? { paddingTopLeft: [30, 30], paddingBottomRight: [30, Math.round(y * 0.36)] }
    : { paddingTopLeft: [370, 90], paddingBottomRight: [70, 40] };
}

/**
 * Scena hărții, calculată O DATĂ per set de date (ION-206): drumurile de la fiecare mașină la stația
 * omului (ahead, snapOn, kmToLine), capetele și autobuzele puse pe linie. La zoom Leaflet scalează
 * singur liniile și insignele; doar numele orașelor se rejudecă (cele de sub un autobuz se ascund).
 */
interface Scene {
  /** Rutierele nealese: linia punctată, în culoarea lor, până unde intră pe drumul uneia mai devreme. */
  lines: { path: LatLon[]; color: string }[];
  /** Cursa aleasă: până la stația omului în culoarea ei, de la stație la destinație bordo. */
  sel: { part: LatLon[]; color: string }[];
  ends: { at: LatLon; cls: 'from' | 'to' }[];
  buses: { i: number; t: NowTrip; at: LatLon; deg: number | null; on: boolean }[];
  /** Punctele pe care se potrivește harta prima dată. */
  fit: LatLon[];
  /** Stația omului pe linia cursei alese. */
  from: LatLon | null;
  /** Doar în harta biletului (mini app): faza cursei, după care se reîncadrează harta. */
  faza?: FazaBilet;
  /** Doar în harta biletului: linia estompată (drumul autobuzului până la stație, sau ruta netăiabilă). */
  faint?: LatLon[][];
}

/**
 * Harta biletului din mini app (Ion, 06.10: «harta să se vadă macro și doar punctele care este biletul lui»): stația de
 * urcare, stația de coborâre și autobuzul; linia plină doar pe bucata urcare → coborâre; până la urcare, drumul
 * autobuzului spre stație subțire. Încadrarea pe autobuz + stația spre care merge (lib/harta-bilet).
 */
function buildBiletScene(trips: NowTrip[], routes: Record<number, RouteLine>): Scene {
  const t = trips[0];
  const route = t?.route_id != null ? routes[t.route_id] : undefined;
  const line = route?.shape.length ? route.shape : null;
  const from = route?.from ?? null, to = route?.to ?? null;

  let bus: Scene['buses'][number] | null = null;
  if (t && t.lat != null && t.lon != null) {
    const s = line ? snapOn([t.lat, t.lon], line) : { at: [t.lat, t.lon] as LatLon, seg: -1 };
    bus = { i: 0, t, at: s.at, deg: line ? heading(line, s.seg, t.going_north) : null, on: true };
  }
  const faza = fazaBilet({ bus: bus?.at ?? null, from, to, line, plecata: t?.plecata, inStatiaMea: !!t?.at_stop?.mine });

  const sel: Scene['sel'] = [];
  const faint: LatLon[][] = [];
  const ends: Scene['ends'] = [];
  if (line) {
    const bucata = from && to ? intre(line, from, to) : null;
    if (bucata && bucata.length >= 2) {
      sel.push({ part: bucata, color: RED });
      // Până la urcare: pe unde vine autobuzul spre stație, subțire, ca să nu pară că stă în câmp.
      if (faza === 'spre-urcare' && bus) {
        const vine = intre(line, bus.at, from!);
        if (vine && vine.length >= 2) faint.push(vine);
      }
    } else {
      // Geometria nu se poate tăia (stație în afara liniei): toată linia, dar subțire și estompată.
      faint.push(line);
    }
    for (const [pt, cls] of [[from, 'from'], [to, 'to']] as const) {
      if (pt) ends.push({ at: snap(pt, line), cls });
    }
  } else {
    for (const [pt, cls] of [[from, 'from'], [to, 'to']] as const) if (pt) ends.push({ at: pt, cls });
  }

  const fit = incadrareBilet(faza, bus?.at ?? null, from, to);
  return { lines: [], sel, ends, buses: bus ? [bus] : [], fit, from, faza, faint };
}

function buildScene(trips: NowTrip[], routes: Record<number, RouteLine>, selected: number): Scene {
  const selRoute = trips[selected]?.route_id ?? null;
  const route = selRoute != null ? routes[selRoute] : undefined;

  // Fiecare rutieră cu linia ei colorată, de la mașină până la stația omului (Ion, 27.09, ION-100,
  // mockup-ul aprobat). Unde intră pe drumul unei rutiere care vine mai devreme, linia se oprește:
  // pe drumul comun rămâne o singură linie («în momentul ce se unesc 2 sau mai multe — au o linie»).
  // Cea aleasă se desenează întreagă, până la destinație, plină și deasupra.
  const lines: Scene['lines'] = [];
  const earlier: LatLon[][] = [];
  trips.forEach((t, i) => {
    const r = t.route_id != null ? routes[t.route_id] : undefined;
    if (!r || t.lat == null || t.lon == null || snapOn([t.lat, t.lon], r.shape).seg < 1) return;
    let path = ahead(r, t, true);
    if (i !== selected) {
      const k = path.findIndex((p) => earlier.some((e) => kmToLine(p, e) < JOIN_KM));
      if (k >= 0) path = path.slice(0, k + 1);
    }
    earlier.push(ahead(r, t, true));
    if (i === selected || path.length < 2) return;
    lines.push({ path, color: lineColor(i) });
  });

  // Linia cursei alese și, pe ea, localitatea omului și destinația.
  const sel: Scene['sel'] = [];
  const ends: Scene['ends'] = [];
  if (route?.shape.length) {
    // Până la stația omului în culoarea mașinii; de la stație până la destinație mereu bordo,
    // culoarea firmei (Ion, 27.09, ION-100: «ultima linie întotdeauna să fie culoarea firmei»).
    const t = trips[selected];
    const toStop = ahead(route, t, true);
    // Stația în afara liniei (ocol): toată linia în culoarea mașinii, fără coada bordo.
    const onLine = !!route.from && snapOn(route.from, route.shape).seg > 0;
    const tail = onLine ? ahead(route, { ...t, lat: route.from![0], lon: route.from![1] }) : [];
    if (!onLine) toStop.splice(0, toStop.length, ...ahead(route, t));
    for (const [part, color] of [[toStop, lineColor(selected)], [tail, RED]] as const) {
      if (part.length >= 2) sel.push({ part, color });
    }
    // Centrul satului poate sta în afara traseului: capătul se pune pe linie.
    for (const [pt, cls] of [[route.from, 'from'], [route.to, 'to']] as const) {
      if (pt) ends.push({ at: snap(pt, route.shape), cls });
    }
  }

  const buses: Scene['buses'] = [];
  const fit: LatLon[] = [];
  trips.forEach((t, i) => {
    if (t.lat == null || t.lon == null) return;
    const on = i === selected;
    // Autobuzul stă pe linia rutei lui: GPS-ul e la câțiva metri de drum.
    const own = t.route_id != null ? routes[t.route_id]?.shape : undefined;
    const s = own ? snapOn([t.lat, t.lon], own) : { at: [t.lat, t.lon] as LatLon, seg: -1 };
    buses.push({ i, t, at: s.at, deg: own ? heading(own, s.seg, t.going_north) : null, on });
    // Harta se deschide pe autobuzul ales, localitatea omului și Bălți ca reper; din Bălți,
    // pe drumul până la destinație (Ion, 27.09, ION-100: «punem vizual Bălți să se vadă»; tot
    // drumul Edineț–Chișinău «nu e clar nimic»). Celelalte autobuze nu trag harta după ele;
    // alese din listă, harta se duce la ele.
    if (on) fit.push(s.at);
  });
  if (route?.from) {
    fit.push(route.from);
    // Din Bălți: doar Bălți și autobuzul, nu tot drumul până la Chișinău (Ion, 27.09: «harta să
    // se deschidă mai măricel»).
    if (!near(route.from, BALTI)) fit.push(BALTI);
  } else if (route?.to) fit.push(route.to);
  if (fit.length === 0 && route?.shape.length) fit.push(route.shape[0], route.shape[route.shape.length - 1]);
  return { lines, sel, ends, buses, fit, from: route?.from ?? null };
}

function NowMap({ trips, routes, places, selected, onPick, locale, bilet = false }: {
  trips: NowTrip[]; routes: Record<number, RouteLine>; places: Place[]; selected: number; onPick: (i: number) => void; locale: Locale;
  /** Harta biletului din mini app: doar urcarea, coborârea și autobuzul, încadrate «macro» (buildBiletScene). */
  bilet?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const Lref = useRef<Leaflet | null>(null);
  /** Linii, capete, autobuze — refăcute doar când vin date noi sau se alege altă cursă. */
  const layer = useRef<LayerGroup | null>(null);
  /** Numele orașelor — refăcute și la zoom (se ascund sub autobuze). */
  const labels = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(8);

  // Harta se montează pe loc, cu plăcile, înainte să vină datele (ION-206): Leaflet e deja pe drum
  // (loadLeaflet pornit la deschiderea filei), legătura cu serverul de plăci la fel.
  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
        .setView([47.3, 28.4], 8);
      // Plăcile din lib/map-tiles (aceeași sursă ca în chat); decolorate din CSS (.leaflet-tile-pane),
      // ca autobuzele roșii să iasă în față.
      L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION }).addTo(m);
      L.control.zoom({ position: 'topright' }).addTo(m);
      labels.current = L.layerGroup().addTo(m);
      layer.current = L.layerGroup().addTo(m);
      Lref.current = L;
      map.current = m;
      m.on('click', () => m.scrollWheelZoom.enable());
      m.on('mouseout', () => m.scrollWheelZoom.disable());
      m.on('zoomend', () => setZoom(m.getZoom()));
      setReady(true);
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
      labels.current = null;
      Lref.current = null;
    };
  }, []);

  const scene = useMemo(() => (bilet ? buildBiletScene(trips, routes) : buildScene(trips, routes, selected)), [trips, routes, selected, bilet]);

  // Liniile și autobuzele se refac doar la date noi sau la altă cursă aleasă — NU la zoom (ION-206).
  // Harta se potrivește pe ele doar prima dată, ca omul care a mărit-o să nu fie aruncat înapoi la fiecare minut.
  const fitted = useRef(false);
  const fazaIncadrata = useRef<FazaBilet | null>(null);
  useEffect(() => {
    const L = Lref.current, m = map.current, g = layer.current;
    if (!ready || !L || !m || !g) return;
    g.clearLayers();
    const tx = TXT[locale];

    for (const path of scene.faint ?? []) {
      L.polyline(path, { color: RED, weight: 3, opacity: 0.35, dashArray: '6 6', lineCap: 'round', interactive: false }).addTo(g);
    }
    for (const { path, color } of scene.lines) {
      L.polyline(path, { color: '#FFFFFF', weight: 6, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(g);
      L.polyline(path, { color, weight: 3, opacity: 0.9, dashArray: '7 6', lineCap: 'round', interactive: false }).addTo(g);
    }
    for (const { part, color } of scene.sel) {
      L.polyline(part, { color: '#FFFFFF', weight: 9, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(g);
      L.polyline(part, { color, weight: 5, opacity: 1, lineCap: 'round', interactive: false }).addTo(g);
    }
    for (const { at, cls } of scene.ends) {
      L.marker(at, {
        icon: L.divIcon({ html: `<span class="now-end ${cls}"></span>`, className: 'now-pin-icon', iconSize: [16, 16], iconAnchor: [8, 8] }),
        keyboard: false, interactive: false,
      }).addTo(g);
    }
    for (const { i, t, at, deg, on } of scene.buses) {
      // Insigna rotundă cu microbuzul și săgeata spre direcția de mers, ora alături (varianta C
      // aleasă de Ion pe 24.09; 23.09: «маршрутка должна быть в сторону направления, куда едет
      // морда»). Săgeata se rotește pe orice unghi; ora rămâne dreaptă, de citit.
      const arrow = deg == null ? '' : `<span class="nb-arrow" style="transform:rotate(${deg.toFixed(0)}deg)">${ARROW_SVG}</span>`;
      const icon = L.divIcon({
        html: `<span class="now-bus${on ? ' on' : ''}${t.estimated ? ' est' : ''}">${arrow}<span class="nb-dot">${BUS_FRONT_SVG}</span>${!on ? '' : t.plecata ? (t.near ? `<b>${t.near.replace(/[&<>"]/g, '')}</b>` : '') : t.at_stop ? `<b class="here"><i></i>${t.at_stop.mine ? tx.here : t.at_stop.name}</b>` : `<b>${tx.when(t.eta_min ?? t.minutes_until)}</b>`}</span>`,
        className: 'now-pin-icon', iconSize: [44, 44], iconAnchor: [22, 22],
      });
      L.marker(at, { icon, keyboard: false, title: t.estimated ? `${t.departure} · ${locale === 'ru' ? 'примерное место, без GPS' : 'poziție orientativă, fără GPS'}` : t.departure, zIndexOffset: on ? 1000 : 0 })
        .on('click', () => onPick(i))
        .addTo(g);
    }

    const pts = scene.fit;
    if (bilet) {
      // Harta biletului se reîncadrează doar când se schimbă faza (vine autobuzul / a trecut de stație / e pe hartă),
      // nu la fiecare minut: omul care a mutat harta nu e aruncat înapoi.
      if (pts.length && fazaIncadrata.current !== scene.faza) {
        fazaIncadrata.current = scene.faza ?? null;
        const { x, y } = m.getSize();
        const panouH = box.current?.parentElement?.querySelector<HTMLElement>('.now-panel-bilet')?.offsetHeight ?? 0;
        const unu = pts.length === 1 || (pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1]);
        m.fitBounds(unu ? [pts[0], pts[0]] : pts, {
          ...paddingBilet(x, y, panouH),
          maxZoom: scene.faza === 'fara-autobuz' ? BILET_ZOOM_UN_PUNCT : BILET_MAX_ZOOM,
          // Prima încadrare pe loc; schimbarea de fază — lin.
          animate: fitted.current,
        });
        fitted.current = true;
      }
    } else if (!fitted.current && pts.length) {
      fitted.current = true;
      // Ce acoperă lista și antetul nu e hartă: autobuzul ales stătea sub cardul de jos (08:03).
      m.fitBounds(pts.length === 1 ? [pts[0], pts[0]] : pts, { ...panelPadding(m), maxZoom: 11 });
      // Nu mai departe de nivelul 9 (~150 km pe lățimea telefonului): localitatea omului rămâne pe loc.
      if (m.getZoom() < MIN_OPEN_ZOOM) m.setZoomAround(scene.from ?? pts[0], MIN_OPEN_ZOOM, { animate: false });
    }
  }, [scene, ready, locale, onPick, bilet]);

  // Numele orașelor prin care trec rutele (Ion, 27.09, ION-100: «nu se înțelege unde este Bălți»):
  // plăcile decolorate nu le arată la zoom mic. Sub autobuze, fără clic.
  // Eticheta pe care stă un autobuz (sau ora lui) nu se scrie: «Bri…» sub mașină, «Ot…» sub oră.
  // Se rejudecă la zoom (ce stă sub ce se schimbă pe ecran) — doar ele, nu toată harta (ION-206).
  useEffect(() => {
    const L = Lref.current, m = map.current, g = labels.current;
    if (!ready || !L || !m || !g) return;
    g.clearLayers();
    const tx = TXT[locale];
    const busBoxes = scene.buses.map((b) => {
      const c = m.latLngToContainerPoint(b.at);
      return { x0: c.x - 24, x1: c.x + 24 + (b.on ? 110 : 0), y0: c.y - 24, y1: c.y + 24 };
    });
    // Harta biletului: doar numele stației de urcare și al destinației (`end`), nimic altceva.
    for (const p of bilet ? places.filter((q) => q.end) : places) {
      const mine = !!scene.from && near([p.lat, p.lon], scene.from);
      const name = p.name.replace(/[<>&"]/g, '');
      const c = m.latLngToContainerPoint([p.lat, p.lon]);
      const box = { x0: c.x - 8, x1: c.x + 14 + name.length * 9, y0: c.y - 10, y1: c.y + (mine ? 26 : 10) };
      const hit = busBoxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1);
      if (!mine && hit) continue;
      // Stația omului nu se ascunde: când stă o mașină peste ea, numele trece în stânga punctului.
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({ html: `<span class="now-place${p.end ? ' end' : ''}${mine ? ' mine' : ''}${mine && hit ? ' left' : ''}"><i></i><span>${name}${mine ? `<small>${tx.mine}</small>` : ''}</span></span>`, className: 'now-pin-icon', iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: false, interactive: false, zIndexOffset: -1000,
      }).addTo(g);
    }
  }, [scene, places, ready, locale, zoom, bilet]);

  // Cursa aleasă din listă: harta se duce la autobuzul ei.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = trips[selected];
    if (map.current && t?.lat != null && t.lon != null) map.current.panInside([t.lat, t.lon], panelPadding(map.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return <div ref={box} className="now-map" role="application" aria-label="Harta" />;
}

export function NowResults({ from, to, fromValue, toValue, locale, onClose, incorporat = false, plecareMea, doarCursa, panou }: {
  from: string; to: string; fromValue: string; toValue: string; locale: Locale; onClose: () => void;
  /**
   * ION-249 (Ion, 05.10: «harta vizualizare similar ca la site»): fila «Harta» din mini app-ul Telegram e chiar
   * fereastra aceasta, încorporată — pe tot ecranul deasupra barei de jos, fără fundal întunecat și fără închidere.
   */
  incorporat?: boolean;
  /** Ora cursei din biletul clientului («15:35»): cursa aceasta e aleasă la prima încărcare. */
  plecareMea?: string;
  /**
   * ION-249 (Ion, 05.10: «ca funcția Acum, dar doar pentru ruta pe care el a cumpărat bilet, iar în partea de jos să fie
   * biletul cu QR, minimizat, cu datele mașinii»): doar cursa din bilet pe hartă (ora + ruta), iar panoul de jos e al
   * apelantului — primește cursa găsită (sau null, încă nu e pe drum).
   */
  doarCursa?: { departure: string; routeId: number | null };
  panou?: (cursa: NowTrip | null) => React.ReactNode;
}) {
  const tx = TXT[locale];
  const [data, setData] = useState<NowData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(0);

  // Răspunsul unei direcții schimbate între timp nu mai contează.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const raw = await fetchAcum(fromValue, toValue, locale);
      // Cursa din bilet nu mai e în «Acum» (a trecut de oprirea omului) → autobuzul ei de la /pozitie.
      // ION-277: /pozitie și /forme în paralel (liniile depind doar de rutele din /acum, nu de punctul de la /pozitie).
      const plecata = Boolean(doarCursa && !raw.trips.some((t) => t.departure === doarCursa.departure && (doarCursa.routeId == null || t.route_id == null || t.route_id === doarCursa.routeId)));
      const [t, routes] = await Promise.all([
        plecata && doarCursa ? cursaDupaPlecare(fromValue, toValue, doarCursa.departure, doarCursa.routeId) : Promise.resolve(null),
        withShapes(raw),
      ]);
      if (t) raw.trips = [t, ...raw.trips];
      if (my !== seq.current) return;
      setData({ ...raw, routes });
      setFailed(false);
    } catch {
      if (my === seq.current) setFailed(true);
    }
  }, [fromValue, toValue, locale, doarCursa?.departure, doarCursa?.routeId]);

  // Leaflet și legătura cu serverul de plăci pornesc odată cu cererea, nu după ea (ION-206).
  useEffect(() => { loadLeaflet(); preconnectTiles(); }, []);

  useEffect(() => {
    let last = 0;
    const tick = () => { if (document.hidden) return; last = Date.now(); load(); };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    // Tab-ul ascuns nu cere nimic; la întoarcere, dacă a trecut minutul, cere pe loc (ION-206).
    const onVis = () => { if (!document.hidden && Date.now() - last >= REFRESH_MS) tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toate = data?.trips ?? [];
  const trips = doarCursa
    ? toate.filter((t) => t.departure === doarCursa.departure && (doarCursa.routeId == null || t.route_id == null || t.route_id === doarCursa.routeId))
    : toate;
  const sel = selected < trips.length ? selected : 0;

  // Cursa din bilet se alege o singură dată, când vin primele date (apoi omul alege ce vrea).
  const alesMea = useRef(false);
  useEffect(() => {
    if (alesMea.current || !plecareMea || !data) return;
    alesMea.current = true;
    const k = data.trips.findIndex((t) => t.departure === plecareMea);
    if (k > 0) setSelected(k);
  }, [data, plecareMea]);

  // Mașina apăsată pe hartă poate sta sub marginea listei (pe telefon lista are 30% din ecran,
  // se văd primele două): lista se derulează singură la cardul ei (Ion, 27.09, ION-100).
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = panel.current;
    const row = box?.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    // Capul lipit (itinerarul, pe telefon) nu acoperă cardul.
    const head = box?.querySelector<HTMLElement>('.now-sheet-head')?.offsetHeight ?? 0;
    if (box && row) box.scrollTo({ top: row.offsetTop - head, behavior: 'smooth' });
  }, [sel]);
  // Harta apare și fără autobuz pe drum, dacă avem linia rutei: omul vede pe unde va veni.
  const withPoint = trips.some((t) => t.lat != null || (t.route_id != null && !!data?.routes[t.route_id]));
  // Până vin datele, harta e deja pe ecran, cu plăcile (ION-206); după, rămâne doar dacă are ce arăta.
  const showMap = data ? withPoint || !!panou : !failed;
  const empty = data && trips.length === 0;
  const head = (
    <>
      <span className="now-title"><span className="now-dot" />{from} → {to}</span>
      <button type="button" className="now-close" aria-label={tx.close} onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </>
  );

  return (
    <div className={`now-overlay${incorporat ? ' now-incorporat' : ''}`} onClick={incorporat ? undefined : onClose}>
      <div className={`now-box${showMap ? '' : ' no-map'}`} role="dialog" aria-modal="true" aria-label={`${from} → ${to}`} onClick={(e) => e.stopPropagation()}>
        {showMap && <NowMap trips={trips} routes={data?.routes ?? NO_ROUTES} places={data?.places ?? NO_PLACES} selected={sel} onPick={setSelected} locale={locale} bilet={!!doarCursa} />}

        <div className="now-top">{head}</div>

        {panou ? <div className="now-panel now-panel-bilet">{panou(trips[0] ?? null)}</div> : <div className="now-panel" ref={panel}>
          {/* Pe telefon itinerarul stă deasupra cardurilor, nu peste hartă (Ion, 27.09, ION-100). */}
          <div className="now-sheet-head">{head}</div>
          {!data && !failed && <p className="now-note">{tx.loading}</p>}
          {failed && !data && <p className="now-note">{tx.error}</p>}
          {empty && <p className="now-note">{locale === 'ru' ? data!.line_ru : data!.line_ro}</p>}
          {trips.map((t, i) => {
            const phone = t.phone ? phoneView(t.phone) : null;
            const crew = [t.driver, t.plate].filter(Boolean).join(' · ');
            return (
              <div key={t.departure + i} data-i={i} className={`now-row${i === sel ? ' on' : ''}`} onClick={() => setSelected(i)}>
                <div className="now-info">
                  <div className="now-line">
                    {/* Peste cât vine — mare; ora REALĂ la care ajunge (ION-39) — mică, fără «~»
                        (verificarea UI/UX, ION-100). Graficul doar când diferă de la 3 minute. */}
                    <span className="now-time">{t.at_stop?.mine ? <><span className="now-here-dot" />{tx.here}</> : tx.when(t.eta_min ?? t.minutes_until)}</span>
                    <span className="now-when"><i className="now-lsw" style={{ background: lineColor(i) }} aria-hidden="true" />{t.eta ?? t.departure}</span>
                  </div>
                  {t.eta && Math.abs(hm(t.eta) - hm(t.departure)) >= PLAN_DIFF_MIN && <span className="now-plan">{tx.plan(t.departure)}</span>}
                  {crew && <span className="now-crew">{crew}</span>}
                  {phone && <span className="now-num">{phone.text}</span>}
                </div>
                {phone && (
                  <a className="now-call" href={`tel:${phone.tel}`} aria-label={`${tx.call} ${phone.text}`} onClick={(e) => {
                    e.stopPropagation();
                    track({ event_type: 'call', mod: 'acum', from_locality: fromValue, to_locality: toValue, driver_phone: t.phone });
                  }}>
                    {PHONE_SVG}
                  </a>
                )}
              </div>
            );
          })}
        </div>}
      </div>

      <style>{`
.now-overlay{position:fixed;inset:0;z-index:60;background:rgba(40,12,18,.35);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font-main),Roboto,sans-serif;color:#231A1C}
.now-overlay.now-incorporat{z-index:40;background:none;padding:0;top:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 70px)}
.now-incorporat .now-box{max-width:none;height:100%;border-radius:0;box-shadow:none}
.now-incorporat .now-close{display:none}
.now-panel.now-panel-bilet{max-height:none;overflow:visible;background:none;box-shadow:none}
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
.now-sheet-head{display:none}
.now-panel{position:absolute;left:20px;bottom:20px;z-index:2;width:320px;max-height:calc(100% - 108px);overflow-y:auto;background:#fff;border-radius:22px;box-shadow:0 12px 32px rgba(40,10,18,.16)}
.no-map .now-panel{position:static;width:auto;max-height:none;margin:0 16px 16px;box-shadow:none;border:1px solid #F1E8EA}
.now-note{margin:0;padding:22px 20px;font-size:15px;line-height:1.5;color:#6E5A5E}
.now-row{display:flex;align-items:center;gap:12px;padding:14px 14px 14px 20px;border-bottom:1px solid #F1E8EA;cursor:pointer}
.now-row:last-child{border-bottom:none}
.now-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.now-line{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.now-time{font-size:19px;font-weight:700}
.now-when{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:${RED};white-space:nowrap}
.now-lsw{display:inline-block;width:18px;height:4px;border-radius:2px;box-shadow:0 0 0 1.5px #fff}
.now-plan{font-size:12px;color:#6B5B5F}
.now-row.on .now-plan{color:#fff;opacity:.75}
.now-crew{font-size:13px;color:#6B5B5F}
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
.now-bus{position:relative;display:block;width:44px;height:44px;cursor:pointer}
.now-bus .nb-arrow{position:absolute;inset:0;transform-origin:50% 50%}
.now-bus .nb-arrow svg{display:block;overflow:visible;fill:${RED};stroke:#fff;stroke-width:2;stroke-linejoin:round;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}
.now-bus .nb-dot{position:absolute;left:7px;top:7px;width:30px;height:30px;box-sizing:border-box;border-radius:50%;background:#fff;border:2.5px solid ${RED};color:${RED};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.now-bus .nb-dot svg{width:15px;height:15px}
.now-bus b{position:absolute;left:52px;top:50%;transform:translateY(-50%);height:24px;padding:0 10px;display:flex;align-items:center;border-radius:12px;background:#fff;border:1.5px solid #E3D4D7;color:#5A3A40;font:700 12px/1 var(--font-main),Roboto,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.12)}
.now-bus.on::before{content:"";position:absolute;inset:-9px;border-radius:50%;background:rgba(155,27,48,.16)}
.now-bus.on .nb-dot{left:3px;top:3px;width:38px;height:38px;border:3px solid #fff;background:${RED};color:#fff}
.now-bus.on .nb-dot svg{width:19px;height:19px}
.now-bus.on b{height:26px;border:2px solid ${RED};color:${RED};font-weight:800;font-size:13px}
.now-bus.est .nb-dot{border-style:dashed;opacity:.85}
.now-bus.est.on .nb-dot{background:rgba(155,27,48,.78);border:3px dashed #fff}
.now-bus.est .nb-arrow{opacity:.7}
/* În gară / în oprirea omului: semnal «e aici acum» în locul orei (Ion, 24.09). */
.now-bus b.here{gap:6px;border-color:#1F8A4C;color:#1F6B3B}
.now-bus.on b.here{border-color:#1F8A4C;color:#1F6B3B}
.now-bus b.here i,.now-here-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22A35A;animation:now-here 1.6s infinite}
.now-here-dot{margin-right:6px;vertical-align:middle}
@keyframes now-here{0%{box-shadow:0 0 0 0 rgba(34,163,90,.6)}70%{box-shadow:0 0 0 7px rgba(34,163,90,0)}100%{box-shadow:0 0 0 0 rgba(34,163,90,0)}}
.now-place{position:absolute;left:-6px;top:-7px;display:flex;align-items:center;gap:6px;white-space:nowrap;font:800 14px/1 var(--font-main),Roboto,sans-serif;color:#231A1C;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 6px #fff,0 0 6px #fff;pointer-events:none}
.now-place i{flex-shrink:0;width:8px;height:8px;border-radius:50%;background:#231A1C;border:2px solid #fff;box-sizing:content-box;box-shadow:0 1px 3px rgba(0,0,0,.3)}
/* Localitatea omului și destinația au punctul lor pe linie: doar numele, lângă el. */
.now-place.end{left:12px;top:-8px;color:${RED};font-size:15px}
.now-place.end i{display:none}
.now-place>span{display:flex;flex-direction:column;gap:2px}
.now-place small{font:700 11px/1 var(--font-main),Roboto,sans-serif;color:${RED};text-transform:uppercase;letter-spacing:.04em}
.now-place.mine{left:16px;top:-9px;font-size:16px}
.now-place.mine.left{left:auto;right:16px;text-align:right}
.now-place.mine.left>span{align-items:flex-end}
.now-end{display:block;width:16px;height:16px;border-radius:50%;box-sizing:border-box;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.now-end.from{width:22px;height:22px;margin:-3px;background:${RED};border:4px solid #fff;box-shadow:0 0 0 3px rgba(155,27,48,.25),0 2px 6px rgba(0,0,0,.3)}
.now-end.to{background:#fff;border:4px solid ${RED}}
@media (max-width:720px){
  .now-overlay{padding:0}
  .now-box{max-width:none;height:100%;border-radius:0}
  .now-box.no-map{height:100%;max-width:none}
  .now-top{left:12px;right:12px;top:12px}
  .now-title{height:46px;font-size:16px}
  .now-close{width:46px;height:46px}
  .now-map .leaflet-top.leaflet-right{top:12px}
  .now-panel{left:12px;right:12px;bottom:12px;width:auto;max-height:36%}
  .now-top{display:none}
  .now-sheet-head{display:flex;position:sticky;top:0;z-index:1;align-items:center;justify-content:space-between;gap:10px;padding:8px 8px 8px 16px;background:#fff;border-bottom:1px solid #F1E8EA}
  .now-sheet-head .now-title{height:auto;padding:0;box-shadow:none;background:none;font-size:16px}
  .now-sheet-head .now-close{width:40px;height:40px;box-shadow:none;background:#F6ECEE}
  .now-box.no-map{padding-top:12px}
  /* Cinci curse pe telefon (ION-100, Ion 27.09: «rău se vede în telefon, cartele mai înguste»):
     șoferul, mașina și numărul pe un rând; «după grafic» doar la cursa aleasă. */
  .now-info{flex-flow:row wrap;column-gap:6px}
  .now-line,.now-plan{flex-basis:100%}
  .now-crew+.now-num::before{content:"· ";font-weight:400;color:#8A7B7F}
  .now-row{padding:9px 10px 9px 16px;gap:10px}
  .now-row:not(.on) .now-plan{display:none}
  .now-time{font-size:17px}
  .now-when{font-size:13px}
  .now-crew,.now-num{font-size:13px}
  .now-call{width:44px;height:44px}
  .now-call svg{width:17px;height:17px}
  .now-map .leaflet-control-zoom{display:none}
  .now-map .leaflet-bottom.leaflet-right{bottom:auto;top:0}
  .now-row.on{padding:12px 12px 12px 16px}
  .now-row.on .now-time{font-size:22px}
  .now-row.on .now-when{font-size:14px}
  .now-row.on .now-crew{font-size:13px}
  .now-row.on .now-num{font-size:14px;font-weight:600;margin-top:0}
  .now-row.on .now-crew+.now-num::before{color:#fff;opacity:.85}
  .now-row.on .now-call{width:44px;height:44px;align-self:center}
}
`}</style>
    </div>
  );
}
