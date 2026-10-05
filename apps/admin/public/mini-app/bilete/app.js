// Mini app-ul șoferului (ION-240): ecranul, Telegram, rețeaua, coada offline, modul mock.
// Regulile pe date stau în logica.js (testat în vitest); aici doar legătura cu DOM-ul,
// Telegram.WebApp, fetch și localStorage. Textele RO/RU: logica.js → T.
import * as L from './logica.js';

const tg = window.Telegram?.WebApp ?? null;
const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const BOT = document.body.dataset.bot || 'TransluxMoldova_bot';
const API = '/api/bilete-sofer';
const KEY = {
  lang: 'bilete-sofer:lang', cache: 'bilete-sofer:cache', coada: 'bilete-sofer:coada',
  stare: (cheie) => `bilete-sofer:stare:${cheie}`, alerte: (cheie) => `bilete-sofer:alerte:${cheie}`,
};
const REIMPROSPATARE_MS = 60 * 1000;
const COADA_MS = 30 * 1000;
const ACELASI_COD_MS = 3000;

// ───────────────────────── localStorage (poate lipsi sau arunca) ─────────────────────────
const ls = {
  get(k) { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fără spațiu / privat */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignoră */ } },
};

// ───────────────────────── starea ecranului ─────────────────────────
const S = {
  lang: L.limbaInitiala(ls.get(KEY.lang), tg?.initDataUnsafe?.user?.language_code),
  ecran: 'incarc', // incarc | principal | nelegat | expirat | eroare | faraCursa
  date: null, descarcatLa: null, decalajMs: 0, cursa: null,
  local: { urcate: {} }, coada: ls.get(KEY.coada) ?? [], alerte: [],
  banda: null, ultim: null, neprezDeschis: false, vizManuala: null,
  scanContinuu: false, scanDeschis: false, inchidNoi: false, trimitInCoada: false, incarcInCurs: false,
  ultimCod: '', ultimCodLa: 0, mockOffline: false, mockUrcateServer: new Set(),
};
let timerBanda = null;

const t = () => L.T[S.lang] ?? L.T.ro;
/** «Acum» = ceasul telefonului corectat cu decalajul față de `acum` al serverului (în mock: ora fixă + cât a trecut). */
const acum = () => new Date(Date.now() + S.decalajMs);
const online = () => !S.mockOffline && navigator.onLine !== false;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ───────────────────────── Telegram ─────────────────────────
/** initData din Telegram sau din fragmentul URL-ului (#tgWebAppData=…), ca la zadachnik. */
function initData() {
  if (tg?.initData) return tg.initData;
  try {
    const d = new URLSearchParams(location.hash.replace(/^#/, '')).get('tgWebAppData');
    if (d) { try { sessionStorage.setItem('tgInitData', d); } catch { /* ignoră */ } return d; }
    return sessionStorage.getItem('tgInitData') ?? '';
  } catch { return ''; }
}
function haptic(fel) {
  try {
    const h = tg?.HapticFeedback;
    if (!h) return;
    if (fel === 'ok') h.notificationOccurred('success');
    else if (fel === 'warn') h.notificationOccurred('warning');
    else h.notificationOccurred('error');
  } catch { /* client vechi */ }
}
function pregatesteTelegram() {
  if (!tg) return;
  try { tg.ready(); tg.expand(); } catch { /* ignoră */ }
  try { tg.setHeaderColor('#9B1B30'); tg.setBackgroundColor('#f4f1f1'); } catch { /* ignoră */ }
  try { tg.disableVerticalSwipes?.(); } catch { /* ignoră */ }
  try {
    // ✕ pe cameră (închidere de către șofer) oprește reluarea automată; închiderea noastră (după cod) nu.
    tg.onEvent('scanQrPopupClosed', () => {
      if (S.inchidNoi) { S.inchidNoi = false; return; }
      S.scanContinuu = false;
    });
  } catch { /* ignoră */ }
}
const poateScana = () => MOCK || Boolean(tg && typeof tg.showScanQrPopup === 'function' && (!tg.isVersionAtLeast || tg.isVersionAtLeast('6.4')));

// ───────────────────────── starea locală pe cursă ─────────────────────────
function incarcaStareaCursei(cheie) {
  S.local = ls.get(KEY.stare(cheie)) ?? { urcate: {} };
  if (!S.local.urcate) S.local.urcate = {};
  S.alerte = ls.get(KEY.alerte(cheie)) ?? [];
}
function salveazaStarea() {
  if (!S.cursa) return;
  ls.set(KEY.stare(S.cursa.cheie), S.local);
  ls.set(KEY.alerte(S.cursa.cheie), S.alerte);
}
function salveazaCoada() { ls.set(KEY.coada, S.coada); }

/** Alege cursa curentă din date și încarcă starea ei locală (dacă s-a schimbat cursa, se reia și vizualizarea manuală). */
function alegeCursaCurenta() {
  const c = L.alegeCursa(S.date, acum(), S.descarcatLa);
  if (c?.cheie !== S.cursa?.cheie) { S.vizManuala = null; S.ultim = null; }
  S.cursa = c;
  if (c) incarcaStareaCursei(c.cheie);
}

// ───────────────────────── rețea ─────────────────────────
async function cereAzi() {
  if (MOCK) {
    const r = await fetch('/mini-app/bilete/mock.json', { cache: 'no-store' });
    const d = await r.json();
    const ora = params.get('acum');
    if (ora && /^\d{1,2}:\d{2}$/.test(ora)) d.acum = `${d.zi}T${ora.padStart(5, '0')}:00+03:00`;
    return { status: 200, date: d };
  }
  const r = await fetch(`${API}/azi`, { headers: { 'X-Telegram-Init-Data': initData() }, cache: 'no-store' });
  let date = null;
  try { date = await r.json(); } catch { /* corp gol */ }
  return { status: r.status, date };
}

/** GET /azi: la deschidere, la revenirea pe ecran și la 60 s. Fără internet rămâne lista din cache. */
async function incarca() {
  if (S.incarcInCurs) return;
  S.incarcInCurs = true;
  try {
    const { status, date } = await cereAzi();
    if (status === 401) {
      S.ecran = date?.eroare === 'expirat' ? 'expirat' : 'nelegat';
      return;
    }
    if (status !== 200 || !date || !Array.isArray(date.curse)) throw new Error(`HTTP ${status}`);
    S.date = date;
    S.descarcatLa = new Date().toISOString();
    // Decalajul față de ceasul serverului (în mock ora e fixă din fișier, deci decalajul duce «acum» acolo).
    if (date.acum) { const s = new Date(date.acum).getTime(); if (!Number.isNaN(s)) S.decalajMs = s - Date.now(); }
    ls.set(KEY.cache, { date, descarcatLa: S.descarcatLa, decalajMs: S.decalajMs });
    alegeCursaCurenta();
    S.ecran = date.curse.length ? 'principal' : 'faraCursa';
  } catch {
    if (S.date) return; // avem deja o listă (cache); bara de sus spune că e veche
    const c = ls.get(KEY.cache);
    if (c?.date) {
      S.date = c.date; S.descarcatLa = c.descarcatLa ?? null; S.decalajMs = c.decalajMs ?? 0;
      alegeCursaCurenta();
      S.ecran = S.date.curse?.length ? 'principal' : 'faraCursa';
    } else {
      S.ecran = 'eroare';
    }
  } finally {
    S.incarcInCurs = false;
    render();
  }
}

/** POST /scan (sau răspunsul simulat în mock). Aruncă la rețea căzută / timeout. */
async function postScan(cheie, scanari, timeoutMs) {
  if (MOCK) return mockScan(scanari);
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeoutMs ?? 15000);
  try {
    const r = await fetch(`${API}/scan`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'X-Telegram-Init-Data': initData(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cheie, scanari }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return Array.isArray(d?.rezultate) ? d.rezultate : [];
  } finally { clearTimeout(tm); }
}

/** Coada offline: retrimisă la `online`, la revenirea pe ecran și la fiecare 30 s; răspunsurile întârziate actualizează lista. */
async function trimiteCoada() {
  if (S.trimitInCoada || S.coada.length === 0 || !online() || !S.cursa) return;
  S.trimitInCoada = true;
  try {
    const peCheie = new Map();
    for (const s of S.coada) { const k = s.cheie ?? S.cursa.cheie; if (!peCheie.has(k)) peCheie.set(k, []); peCheie.get(k).push({ cod: s.cod, moment_client: s.moment_client, offline: Boolean(s.offline) }); }
    for (const [cheie, scanari] of peCheie) {
      const rezultate = await postScan(cheie, scanari);
      const cursa = (S.date?.curse ?? []).find((c) => c.cheie === cheie) ?? null;
      if (cheie === S.cursa.cheie) {
        const r = L.aplicaRezultate(S.local, cursa, rezultate, S.coada);
        S.local = r.local;
        for (const a of r.alerte) { if (!S.alerte.some((x) => x.cod === a.cod)) S.alerte.push(a); if (a.verdict !== 'ok') haptic('bad'); }
        salveazaStarea();
      } else if (cursa) {
        // Scanări rămase de la altă cursă (ziua trecută): doar le scoatem din coadă; starea aceleiași curse se actualizează la deschidere.
        L.aplicaRezultate(ls.get(KEY.stare(cheie)) ?? { urcate: {} }, cursa, rezultate, S.coada);
      }
      S.coada = L.scoateDinCoada(S.coada, rezultate);
      salveazaCoada();
    }
  } catch { /* rămâne în coadă */ } finally {
    S.trimitInCoada = false;
    render();
  }
}

// ───────────────────────── scanarea ─────────────────────────
function pornesteScanarea() {
  if (!S.cursa) return;
  if (!poateScana()) { alert(t().doarTelegram); return; }
  S.scanContinuu = true;
  deschideCamera();
}
function deschideCamera() {
  if (!S.scanContinuu || !S.cursa) return;
  if (MOCK) { S.scanDeschis = true; render(); return; }
  try {
    tg.showScanQrPopup({ text: t().indreapta }, (text) => {
      S.inchidNoi = true;
      onCod(text);
      return true; // închide camera; se redeschide după bandă
    });
  } catch { S.scanContinuu = false; }
}
function inchideCamera() {
  S.scanContinuu = false; S.scanDeschis = false;
  if (!MOCK) { try { tg.closeScanQrPopup(); } catch { /* ignoră */ } }
  render();
}

/** Un cod citit de cameră (sau simulat): matricea verdictelor C3. */
async function onCod(brut) {
  const cod = L.normalizeazaCod(brut);
  S.scanDeschis = false;
  if (!cod) { render(); return; }
  const now = Date.now();
  if (cod === S.ultimCod && now - S.ultimCodLa < ACELASI_COD_MS) { render(); return; } // camera citește același cod de mai multe ori
  S.ultimCod = cod; S.ultimCodLa = now;
  const moment = acum().toISOString();
  const r = L.clasificaLocal(S.cursa, S.local, cod, online());

  if (r.verdict === 'ok') {
    S.local = L.confirmaLocal(S.local, cod, moment, false);
    const n = L.numaraPasager(r.pasager, S.local);
    salveazaStarea();
    S.coada = L.adaugaInCoada(S.coada, { cheie: S.cursa.cheie, cod, moment_client: moment, offline: !online() });
    salveazaCoada();
    arataBanda('ok', { nume: r.pasager.nume, ramase: n.deUrcat, total: n.total });
    trimiteCoada();
    return;
  }
  if (r.verdict === 'deja_urcat') { arataBanda('deja_urcat', { nume: r.pasager.nume, urcat_at: r.urcat_at }); return; }
  if (r.verdict === 'anulat') { arataBanda('anulat', { nume: r.pasager.nume }); return; }
  if (r.verdict === 'neconfirmat') {
    S.coada = L.adaugaInCoada(S.coada, { cheie: S.cursa.cheie, cod, moment_client: moment, offline: true });
    salveazaCoada();
    arataBanda('neconfirmat', {});
    return;
  }
  // Cod lipsă din listă, cu internet: întrebăm serverul cel mult 3 s; fără răspuns → portocaliu + coadă.
  arataBanda('verifica', {}, { faraTimer: true });
  try {
    const rezultate = await postScan(S.cursa.cheie, [{ cod, moment_client: moment, offline: false }], L.ASTEPTARE_SERVER_MS);
    const rez = rezultate.find((x) => x?.cod === cod) ?? rezultate[0] ?? null;
    const v = L.verdictDinServer(rez);
    if (v === 'ok') {
      const { local } = L.aplicaRezultate(S.local, S.cursa, [rez], []);
      S.local = local; salveazaStarea();
      arataBanda('ok', { nume: rez.nume ?? '', ramase: Number(rez.locuri_ramase_comanda ?? 0), total: Number(rez.locuri_ramase_comanda ?? 0) + 1 });
      incarca(); // biletul nu era în lista noastră: o reîmprospătăm
    } else {
      arataBanda(v, { nume: rez?.nume ?? '', urcat_at: rez?.urcat_at ?? null, urcat_de_altul: Boolean(rez?.urcat_de_altul), cursa_bilet: rez?.cursa_bilet ?? '' });
    }
  } catch {
    S.coada = L.adaugaInCoada(S.coada, { cheie: S.cursa.cheie, cod, moment_client: moment, offline: true });
    salveazaCoada();
    arataBanda('neconfirmat', {});
  }
}

/** Banda 4 s în capul paginii + vibrație; la stingere camera se redeschide dacă scanarea e continuă. */
function arataBanda(verdict, info, opt = {}) {
  clearTimeout(timerBanda);
  const text = L.textBanda(verdict, info, S.lang);
  S.banda = { verdict, info, ...text };
  if (verdict !== 'verifica') { S.ultim = S.banda; haptic(text.fel); }
  render();
  if (opt.faraTimer) return;
  timerBanda = setTimeout(() => {
    S.banda = null;
    render();
    if (S.scanContinuu) deschideCamera();
  }, L.BANDA_MS);
}

// ───────────────────────── mock: scanarea simulată și «serverul» ─────────────────────────
function mockScan(scanari) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const alta = S.date?._scan?.alta_cursa;
      resolve(scanari.map(({ cod }) => {
        if (alta && cod === alta.cod) return { cod, rezultat: 'alta_cursa', cursa_bilet: alta.cursa_bilet };
        for (const c of S.date?.curse ?? []) {
          const g = L.cautaCod(c, cod);
          if (!g) continue;
          if (g.bilet.status === 'urcat' || S.mockUrcateServer.has(cod)) return { cod, rezultat: 'deja_urcat', nume: g.pasager.nume, urcat_at: g.bilet.urcat_at ?? S.local.urcate?.[cod]?.la ?? null, urcat_de_altul: false };
          if (g.bilet.status !== 'valid') return { cod, rezultat: 'anulat', nume: g.pasager.nume };
          S.mockUrcateServer.add(cod);
          return { cod, rezultat: 'ok', nume: g.pasager.nume, loc_nr: g.bilet.loc_nr, locuri_ramase_comanda: L.numaraPasager(g.pasager, S.local).deUrcat, urcat_at: acum().toISOString(), urcat_de_altul: false };
        }
        return { cod, rezultat: 'necunoscut' };
      }));
    }, 300);
  });
}
function simuleaza(fel) {
  if (!S.cursa) return;
  if (fel === 'ok') {
    const b = (S.cursa.pasageri ?? []).flatMap((p) => p.bilete ?? []).find((x) => L.esteDeUrcat(x, S.local));
    onCod(b ? b.cod_qr : 'NECUNOSCUT0000000001');
  } else if (fel === 'offline') {
    S.mockOffline = true;
    onCod(`OFFLINE${String(Date.now()).slice(-13)}`);
    setTimeout(() => { S.mockOffline = false; render(); }, 1500);
  } else if (fel === 'deja') {
    // Întâi un bilet urcat pe server (are ora), apoi unul confirmat local; nu cel abia scanat (anti-dublură 3 s).
    const toate = (S.cursa.pasageri ?? []).flatMap((p) => p.bilete ?? []).filter((x) => x.cod_qr !== S.ultimCod);
    const b = toate.find((x) => x.status === 'urcat') ?? toate.find((x) => L.esteUrcat(x, S.local));
    onCod(b ? b.cod_qr : 'NECUNOSCUT0000000002');
  } else if (fel === 'alta') {
    onCod(S.date?._scan?.alta_cursa?.cod ?? 'ALTACURSA0000000001');
  }
}

// ───────────────────────── ecranul ─────────────────────────
const SVG = {
  ok: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
  warn: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v9"/><circle cx="12" cy="18.5" r="1.2" fill="#fff"/></svg>',
  bad: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  okMic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
  warnMic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v9"/><circle cx="12" cy="18.5" r="1.4" fill="#fff"/></svg>',
  badMic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  scan: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
  locuri: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h3M13 8h3M8 12h3M13 12h3M8 16h3M13 16h3"/></svg>',
  lista: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  x: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  qr: '<svg width="140" height="140" viewBox="0 0 24 24" fill="none" stroke="#6b6b6b" stroke-width="1.2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 18h2M18 14h3"/></svg>',
  sageata: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  jos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
};
const icMic = (fel) => (fel === 'ok' ? SVG.okMic : fel === 'warn' ? SVG.warnMic : SVG.badMic);

function antetHtml(sub, titlu) {
  return `<div class="antet"><div class="col"><img class="logo" src="/mini-app/bilete/logo-white.png" alt="TRANSLUX"><div class="sub">${esc(sub)}</div><div class="titlu">${esc(titlu)}</div></div>
    <button class="btn-limba" data-act="lang" aria-label="RO / RU">${esc(t().altaLimba)}</button></div>`;
}
function bandaHtml() {
  if (!S.banda) return '';
  const b = S.banda;
  return `<div class="banda ${b.fel}" role="status"><div class="ic">${SVG[b.fel]}</div><div class="col"><div class="t1">${esc(b.titlu)}</div><div class="t2">${esc(b.sub)}</div></div></div>`;
}
function baraHtml() {
  const veche = L.listaVeche(S.descarcatLa, new Date());
  if (online() && !veche) return '';
  const ora = S.descarcatLa ? L.oraDin(S.descarcatLa) : '—';
  const parti = [];
  if (!online()) parti.push(t().offline);
  parti.push(`${t().listaDeLa} ${ora}`);
  return `<div class="bara">${esc(parti.join(' · '))}</div>`;
}
function vizualizare() {
  return S.vizManuala ?? L.alegeVizualizare(S.cursa, acum());
}
function acumHtml() {
  const c = S.cursa; const tt = t();
  const urm = L.urmatoareaCursa(S.date, c);
  let urmText = '';
  if (urm) {
    const n = L.contoare(urm.cursa, {}).deUrcat;
    urmText = `${tt.urmatoarea}: ${urm.maine ? tt.maine + ' ' : ''}${urm.cursa.plecare} · ${L.sensRuta(urm.cursa.ruta)} · ${L.locuriText(n, S.lang)}`;
  }
  const dupaOrar = S.date?.motiv_curenta === 'orar' ? `<span class="orar">· ${esc(tt.dupaOrar)}</span>` : '';
  const viz = vizualizare();
  const btn = c.going_north === true
    ? `<button class="btn-viz" data-act="viz" data-viz="${viz === 'locuri' ? 'lista' : 'locuri'}">${viz === 'locuri' ? SVG.lista + esc(tt.lista) : SVG.locuri + esc(tt.locuriBtn)}</button>`
    : '';
  return `<div class="acum"><div class="rand"><span class="et">${esc(tt.acum)}</span><span class="ora">${esc(c.plecare)}</span><span class="sens">${esc(L.sensRuta(c.ruta))}</span>${dupaOrar}</div>
    <div class="rand2"><div class="urm">${esc(urmText)}</div>${btn}</div></div>`;
}
function alerteHtml() {
  return S.alerte.map((a) => {
    const tx = L.textBanda(a.verdict, { nume: a.nume, urcat_at: a.urcat_at, urcat_de_altul: a.urcat_de_altul, cursa_bilet: a.cursa_bilet }, S.lang);
    return `<button class="alerta" data-act="alerta" data-cod="${esc(a.cod)}"><span class="semn">${SVG.badMic}</span><span class="tx">${esc(t().respinsTarziu)}: ${esc(tx.titlu)}<small>${esc(tx.sub)} · ${esc(t().atingeInchide)}</small></span></button>`;
  }).join('');
}
function ultimHtml() {
  if (!S.ultim) return '';
  const u = S.ultim;
  return `<button class="ultim ${u.fel}" data-act="ultim"><span class="semn">${icMic(u.fel)}</span><span class="tx">${esc(t().ultimul)}: ${esc(u.titlu)} · ${esc(u.sub)}</span></button>`;
}
function listaHtml() {
  const tt = t();
  const { grupe, neprezentati } = L.grupeazaPeOpriri(S.cursa, S.local);
  const k = L.contoare(S.cursa, S.local);
  const dr = [`${tt.urcati} ${k.urcati}`];
  if (k.neprezentati > 0) dr.push(`${tt.neprezentati.toLowerCase()} ${k.neprezentati}`);
  let h = `<div class="continut"><div class="contor"><span class="st">${esc(tt.ramasi)}: ${esc(L.locuriText(k.deUrcat, S.lang))}</span><span class="dr">${esc(dr.join(' · '))}</span></div>`;
  h += alerteHtml() + ultimHtml();
  if (neprezentati.length) {
    h += `<button class="neprez" data-act="neprez"><span>${esc(tt.neprezentati)} (${esc(L.locuriText(k.neprezentati, S.lang))})</span><span>${S.neprezDeschis ? SVG.jos : SVG.sageata}</span></button>`;
    if (S.neprezDeschis) {
      for (const p of neprezentati) {
        h += `<div class="neprez-rand"><div class="b">${p.deUrcat}</div><div class="col"><div class="n">${esc(p.nume)}</div><div class="d">${esc(L.formatTelefon(p.telefon))} · ${esc(p.de_la)}</div></div></div>`;
      }
    }
  }
  for (const g of grupe) {
    h += `<div class="grupa"><span class="h1">${esc(g.ora)}</span><span class="h2">${esc(g.oprire)}</span><span class="h3">· ${esc(L.locuriText(g.n, S.lang))}</span></div>`;
    for (const p of g.items) {
      const partial = p.partial ? ` · ${p.partial.urcate} ${tt.din} ${p.partial.total} ${tt.urcate}` : '';
      const ns = p.nesincronizate > 0 ? ` <span class="ns">· ${esc(tt.nesincronizat)}</span>` : '';
      const tel = p.telefon ? `<a class="tel" href="${esc(L.telHref(p.telefon))}">${esc(L.formatTelefon(p.telefon))}</a>` : '';
      h += `<div class="pas${p.partial ? ' partial' : ''}"><div class="b">${p.deUrcat}</div><div class="col"><div class="n">${esc(p.nume)}</div>${tel}<div class="d">→ ${esc(p.pana_la)}${esc(partial)}${ns}</div></div></div>`;
    }
  }
  h += '<div class="spatiu"></div></div>';
  return h;
}
function locuriHtml() {
  const tt = t();
  const h = L.hartaLocuri(S.cursa, S.local);
  const randuri = L.randuriLocuri(h.locuri);
  const loc = (l) => (l ? `<div class="s ${l.stare}">${l.nr}${l.nume ? `<small>${esc(l.nume)}${l.stare === 'urcat' ? ' ✓' : ''}</small>` : ''}</div>` : '<div class="gol"></div>');
  let out = `<div class="locuri-cap"><span class="on">${esc(tt.online)}: ${h.online}</span><span class="ur">${esc(tt.urcati)}: ${h.urcati}</span><span class="li">${esc(tt.libere)}: ${h.libere}</span></div><div class="locuri">`;
  for (const r of randuri) {
    if (r.tip === 'fata') out += `<div class="row"><div class="s sofer">${esc(tt.sofer)}</div><div class="aisle"></div><div class="gol"></div>${loc(r.locuri[0])}</div>`;
    else if (r.tip === 'rand') out += `<div class="row">${loc(r.locuri[0])}${loc(r.locuri[1])}<div class="aisle"></div>${loc(r.locuri[2])}</div>`;
    else out += `<div class="row spate" style="margin-top:4px">${r.locuri.map(loc).join('')}</div>`;
  }
  if (h.faraLoc > 0) out += `<div class="fara-loc">${esc(tt.faraLoc(h.faraLoc))}</div>`;
  out += `<div class="legenda"><span><i class="on"></i>${esc(tt.legOnline)}</span><span><i class="ur"></i>${esc(tt.legUrcat)}</span><span><i class="li"></i>${esc(tt.legLiber)}</span></div>`;
  out += alerteHtml() + ultimHtml() + '</div>';
  return out;
}
function butonScanHtml() {
  return `<div class="jos">${!poateScana() ? `<div class="nota-jos">${esc(t().doarTelegram)}</div>` : ''}<button class="btn-scan" data-act="scan">${SVG.scan}${esc(t().scaneaza)}</button></div>`;
}
function scanMockHtml() {
  if (!MOCK || !S.scanDeschis) return '';
  const tt = t();
  return `<div class="scan"><div class="cap"><div class="t">${esc(tt.indreapta)}</div><button class="btn-x" data-act="inchideCamera" aria-label="Închide">${SVG.x}</button></div>
    <div class="mijloc"><div class="cadru"><div class="linie"></div>${SVG.qr}</div></div>
    <div class="sim"><div class="nota">${esc(tt.simuleaza)}</div><div class="grid">
      <button class="ok" data-act="sim" data-fel="ok">${esc(tt.simOk)}</button><button class="warn" data-act="sim" data-fel="offline">${esc(tt.simOffline)}</button>
      <button class="bad" data-act="sim" data-fel="deja">${esc(tt.simDeja)}</button><button class="bad" data-act="sim" data-fel="alta">${esc(tt.simAlta)}</button>
    </div></div></div>`;
}
function principalHtml() {
  const tt = t();
  const sub = `${tt.dinGrafic} · ${L.etichetaZi(S.date.zi, S.lang)} · ${tt.ruta} ${S.cursa.crm_route_id ?? ''}`;
  const viz = vizualizare();
  return antetHtml(sub, L.titluRuta(S.date.curse)) + bandaHtml() + baraHtml() + acumHtml() + (viz === 'locuri' ? locuriHtml() : listaHtml()) + butonScanHtml() + scanMockHtml();
}
function faraCursaHtml() {
  const tt = t();
  const maine = Array.isArray(S.date?.maine) ? S.date.maine : [];
  const sub = `${tt.dinGrafic} · ${L.etichetaZi(S.date.zi, S.lang)}`;
  let h = antetHtml(sub, S.date?.sofer?.nume ?? '') + baraHtml();
  h += `<div class="ecran"><h1>${esc(tt.faraCursa)}</h1><div class="pasi">`;
  tt.pasi.forEach((p, i) => { h += `<div class="pas4"><div class="nr">${i + 1}</div><div class="tx">${esc(p)}</div></div>`; });
  h += `<div class="pas4"><div class="nr">4</div><div class="tx"><span class="verde">${esc(tt.pas4Verde)}</span>${esc(tt.pas4a)}<span class="rosu">${esc(tt.pas4Rosu)}</span>${esc(tt.pas4b)}</div></div></div><div class="umple"></div>`;
  if (maine.length) {
    const zi = maine[0].cheie?.split('|')[0] ?? '';
    h += `<div class="maine"><div class="t">${esc(tt.maineTitlu)}${zi ? ', ' + esc(L.etichetaZi(zi, S.lang)) : ''}</div>`;
    for (const c of maine) h += `<div class="r">${esc(c.plecare)} · ${esc(L.sensRuta(c.ruta))}</div>`;
    h += '</div>';
  }
  return h + '</div>';
}
function nelegatHtml(expirat) {
  const tt = t();
  const url = `https://t.me/${BOT}?start=sofer`;
  return antetHtml('TRANSLUX', tt.scaneaza) + `<div class="ecran"><h1>${esc(expirat ? tt.expiratT : tt.nelegatT)}</h1><p>${esc(expirat ? tt.expiratS : tt.nelegatS)}</p><div class="umple"></div>
    ${expirat ? '' : `<button class="btn-mare" data-act="bot" data-url="${esc(url)}">${esc(tt.nelegatBtn)}</button>`}</div>`;
}
function eroareHtml() {
  const tt = t();
  return antetHtml('TRANSLUX', tt.scaneaza) + `<div class="ecran"><h1>${esc(tt.eroareT)}</h1><p>${esc(tt.eroareS)}</p><div class="umple"></div><button class="btn-mare" data-act="reincearca">${esc(tt.reincearca)}</button></div>`;
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  const scroll = app.querySelector('.continut, .locuri')?.scrollTop ?? 0;
  let h;
  switch (S.ecran) {
    case 'principal': h = S.cursa ? principalHtml() : faraCursaHtml(); break;
    case 'faraCursa': h = faraCursaHtml(); break;
    case 'nelegat': h = nelegatHtml(false); break;
    case 'expirat': h = nelegatHtml(true); break;
    case 'eroare': h = eroareHtml(); break;
    default: h = `<div class="incarc">${esc(t().seIncarca)}</div>`;
  }
  app.innerHTML = h;
  const z = app.querySelector('.continut, .locuri');
  if (z && scroll) z.scrollTop = scroll;
  document.documentElement.lang = S.lang;
}

// ───────────────────────── evenimente ─────────────────────────
document.getElementById('app').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'lang') { S.lang = S.lang === 'ro' ? 'ru' : 'ro'; ls.set(KEY.lang, S.lang); if (S.ultim) S.ultim = { ...S.ultim, ...L.textBanda(S.ultim.verdict, S.ultim.info, S.lang) }; if (S.banda) S.banda = { ...S.banda, ...L.textBanda(S.banda.verdict, S.banda.info, S.lang) }; render(); }
  else if (act === 'scan') pornesteScanarea();
  else if (act === 'inchideCamera') inchideCamera();
  else if (act === 'sim') simuleaza(el.dataset.fel);
  else if (act === 'ultim') { if (S.ultim) arataBanda(S.ultim.verdict, S.ultim.info, { faraTimer: false }); }
  else if (act === 'alerta') { S.alerte = S.alerte.filter((a) => a.cod !== el.dataset.cod); salveazaStarea(); render(); }
  else if (act === 'neprez') { S.neprezDeschis = !S.neprezDeschis; render(); }
  else if (act === 'viz') { S.vizManuala = el.dataset.viz; render(); }
  else if (act === 'reincearca') { S.ecran = 'incarc'; render(); incarca(); }
  else if (act === 'bot') { const url = el.dataset.url; try { if (tg?.openTelegramLink) tg.openTelegramLink(url); else location.href = url; } catch { location.href = url; } }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (S.ecran === 'principal' || S.ecran === 'faraCursa' || S.ecran === 'eroare') incarca();
  trimiteCoada();
});
window.addEventListener('online', () => { trimiteCoada(); render(); });
window.addEventListener('offline', () => render());
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (S.ecran === 'principal' || S.ecran === 'faraCursa') incarca();
}, REIMPROSPATARE_MS);
setInterval(() => { if (document.visibilityState === 'visible') trimiteCoada(); }, COADA_MS);
// Cursa curentă se recalculează și fără rețea (regula C1 locală când lista e veche); la minut e destul.
setInterval(() => {
  if (S.ecran !== 'principal' || !S.date) return;
  const inainte = S.cursa?.cheie;
  alegeCursaCurenta();
  if (S.cursa?.cheie !== inainte) render();
}, 60 * 1000);

// ───────────────────────── pornirea ─────────────────────────
pregatesteTelegram();
render();
incarca().then(() => trimiteCoada());
