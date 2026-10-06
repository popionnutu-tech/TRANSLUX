// Logica pură a mini app-ului șoferului (ION-240): fără DOM, fără fetch, fără Telegram.
// Se importă din app.js (browser) și din logica.test.ts (vitest, node). Tot ce atinge
// ecranul, rețeaua sau localStorage stă în app.js; aici doar reguli pe date.
//
// Contractul de date (ION-190 pașii 7–8, v1): GET /api/bilete-sofer/azi →
// { sofer, zi, acum, curse: [{ cheie, crm_route_id, going_north, ruta, plecare, sosire, opriri,
//   pasageri: [{ comanda, nume, telefon, de_la_order, de_la, pana_la, locuri, bilete: [{ cod_qr, nr, loc_nr, status, urcat_at }] }],
//   capacitate }], curenta, motiv_curenta, maine? }.
// Starea locală (ce a confirmat șoferul pe telefon, înainte sau fără sincronizare):
// { urcate: { [cod_qr]: { la: ISO, sincronizat: bool } } }.

export const TZ = 'Europe/Chisinau';
export const CAPACITATE_IMPLICITA = 20;
/** Fereastra cursei curente (regula C1): [plecare − 60 min, sosire + 30 min]. */
export const INAINTE_MIN = 60;
export const DUPA_MIN = 30;
/** Pe retur harta locurilor rămâne ecranul principal până la plecarea din Chișinău + 10 min. */
export const LOCURI_DUPA_PLECARE_MIN = 10;
/** Lista descărcată mai veche de atât e «veche» (bara «offline · lista de la HH:MM»). */
export const LISTA_VECHE_MIN = 5;
/** Cât așteptăm serverul la un cod lipsă din listă înainte de portocaliu. */
export const ASTEPTARE_SERVER_MS = 3000;
export const BANDA_MS = 4000;

// ───────────────────────── timp ─────────────────────────

/** 'HH:MM' → minute din zi; null dacă lipsește sau e stricat. */
export function minuteDinOra(ora) {
  if (typeof ora !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(ora.trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Data și ora Chișinăului pentru un instant: { zi: 'YYYY-MM-DD', minute, ora: 'HH:MM' }. */
export function momentChisinau(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  const h = Number(g('hour')) % 24; const mi = Number(g('minute'));
  return { zi: `${g('year')}-${g('month')}-${g('day')}`, minute: h * 60 + mi, ora: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` };
}

/** Intervalul cursei în minute din zi; sosirea de după miezul nopții se întinde peste 1440. */
export function intervalCursa(cursa) {
  const p = minuteDinOra(cursa?.plecare);
  if (p == null) return null;
  let s = minuteDinOra(cursa?.sosire);
  if (s == null) s = p + 240; // fără sosire: presupunem 4 ore de drum
  if (s < p) s += 1440;
  return { plecare: p, sosire: s, de_la: p - INAINTE_MIN, pana_la: s + DUPA_MIN };
}

// ───────────────────────── cursa curentă ─────────────────────────

/**
 * Cursa curentă (regula C1, local): cursa al cărei interval [plecare−60, sosire+30] conține ora;
 * la suprapunere câștigă plecarea cea mai apropiată de «acum»; dacă niciuna, următoarea plecare
 * de azi; dacă nici aceea, ultima cursă a zilei (s-a terminat tot). Întoarce cheia sau null.
 */
export function alegeCursaDinOra(curse, minuteAcum) {
  if (!Array.isArray(curse) || curse.length === 0 || minuteAcum == null) return null;
  const cu = curse.map((c) => ({ c, i: intervalCursa(c) })).filter((x) => x.i);
  if (cu.length === 0) return curse[0].cheie ?? null;
  const inFereastra = cu.filter((x) => minuteAcum >= x.i.de_la && minuteAcum <= x.i.pana_la);
  if (inFereastra.length) {
    inFereastra.sort((a, b) => Math.abs(a.i.plecare - minuteAcum) - Math.abs(b.i.plecare - minuteAcum));
    return inFereastra[0].c.cheie;
  }
  const viitoare = cu.filter((x) => x.i.plecare > minuteAcum).sort((a, b) => a.i.plecare - b.i.plecare);
  if (viitoare.length) return viitoare[0].c.cheie;
  const trecute = cu.slice().sort((a, b) => b.i.plecare - a.i.plecare);
  return trecute[0].c.cheie;
}

/**
 * Cursa curentă pentru ecran. Serverul e autoritatea când lista e proaspătă sau când motivul
 * nu e doar orarul (GPS, mai târziu); când lista e veche (>5 min) și motivul e «orar», regula C1
 * se recalculează local din ora curentă, ca aplicația să treacă singură pe cursa următoare
 * și fără internet. `acum` = instant (Date/ISO); `descarcatLa` = instant al descărcării.
 */
export function alegeCursa(date, acum, descarcatLa) {
  const curse = Array.isArray(date?.curse) ? date.curse : [];
  if (curse.length === 0) return null;
  const gasita = (k) => curse.find((c) => c.cheie === k) ?? null;
  const dinServer = gasita(date.curenta);
  const m = momentChisinau(acum);
  const sameZi = m && (!date.zi || m.zi === date.zi);
  const veche = listaVeche(descarcatLa, acum);
  if (dinServer && (!veche || (date.motiv_curenta && date.motiv_curenta !== 'orar'))) return dinServer;
  if (sameZi) {
    const k = alegeCursaDinOra(curse, m.minute);
    const c = gasita(k);
    if (c) return c;
  }
  return dinServer ?? curse[0];
}

/**
 * «Următoarea»: dintre celelalte curse de azi, prima care pleacă după cursa curentă; dacă nu e,
 * prima de mâine (cu `maine: true`); altfel null.
 */
export function urmatoareaCursa(date, curenta) {
  const curse = Array.isArray(date?.curse) ? date.curse : [];
  const pc = minuteDinOra(curenta?.plecare);
  const azi = curse
    .filter((c) => c !== curenta && c.cheie !== curenta?.cheie)
    .map((c) => ({ c, p: minuteDinOra(c.plecare) }))
    .filter((x) => x.p != null && (pc == null || x.p > pc))
    .sort((a, b) => a.p - b.p);
  if (azi.length) return { cursa: azi[0].c, maine: false };
  const maine = Array.isArray(date?.maine) ? date.maine : [];
  const m = maine.map((c) => ({ c, p: minuteDinOra(c.plecare) ?? 9999 })).sort((a, b) => a.p - b.p);
  if (m.length) return { cursa: m[0].c, maine: true };
  return null;
}

/** Lista e veche când a fost descărcată cu > 5 min în urmă (sau nu știm când). */
export function listaVeche(descarcatLa, acum) {
  if (!descarcatLa) return true;
  const a = new Date(acum).getTime(); const d = new Date(descarcatLa).getTime();
  if (Number.isNaN(a) || Number.isNaN(d)) return true;
  return a - d > LISTA_VECHE_MIN * 60 * 1000;
}

// ───────────────────────── vizualizarea ─────────────────────────

/**
 * Ce e ecranul principal: pe retur (going_north = true, pleacă din Chișinău) harta locurilor cât
 * timp ora ≤ plecare + 10 min, apoi lista; pe tur mereu lista. Ion, 05.10: «pe tur avem lista,
 * pe retur avem locuri când pornim din Chișinău și după lista».
 */
export function alegeVizualizare(cursa, acum) {
  if (!cursa || cursa.going_north !== true) return 'lista';
  const p = minuteDinOra(cursa.plecare);
  const m = momentChisinau(acum);
  if (p == null || !m) return 'lista';
  return m.minute <= p + LOCURI_DUPA_PLECARE_MIN ? 'locuri' : 'lista';
}

// ───────────────────────── bilete și pasageri ─────────────────────────

/** Biletul e urcat dacă serverul zice `urcat` sau șoferul l-a confirmat local. */
export function esteUrcat(bilet, local) {
  if (!bilet) return false;
  if (bilet.status === 'urcat') return true;
  return Boolean(local?.urcate?.[bilet.cod_qr]);
}

/** Momentul urcării (ISO) — din server sau din confirmarea locală. */
export function urcatLa(bilet, local) {
  if (!bilet) return null;
  if (bilet.status === 'urcat' && bilet.urcat_at) return bilet.urcat_at;
  return local?.urcate?.[bilet.cod_qr]?.la ?? null;
}

/** Biletul mai poate urca: `valid` și neconfirmat local. */
export function esteDeUrcat(bilet, local) {
  return Boolean(bilet) && bilet.status === 'valid' && !local?.urcate?.[bilet.cod_qr];
}

/** Numărătoarea pe comandă: locuri de urcat / urcate (o scanare = un loc, C4). */
export function numaraPasager(p, local) {
  const bilete = Array.isArray(p?.bilete) ? p.bilete : [];
  const deUrcat = bilete.filter((b) => esteDeUrcat(b, local)).length;
  const urcate = bilete.filter((b) => esteUrcat(b, local)).length;
  const nesincronizate = bilete.filter((b) => b.status !== 'urcat' && local?.urcate?.[b.cod_qr] && !local.urcate[b.cod_qr].sincronizat).length;
  return { deUrcat, urcate, total: deUrcat + urcate, nesincronizate };
}

/**
 * Opririle în ordinea de mers: după oră când toate au oră (pe retur stop_order poate fi inversat),
 * altfel cum vin. `plecare` ('HH:MM') e baza pentru opririle de după miezul nopții.
 */
export function ordineOpriri(opriri, plecare) {
  const o = Array.isArray(opriri) ? opriri.slice() : [];
  if (o.length && o.every((s) => minuteDinOra(s.ora) != null)) {
    const base = minuteDinOra(plecare) ?? Math.min(...o.map((s) => minuteDinOra(s.ora)));
    const key = (s) => { const m = minuteDinOra(s.ora); return m < base - 60 ? m + 1440 : m; };
    o.sort((a, b) => key(a) - key(b));
  }
  return o;
}

/**
 * Lista de urcat, grupată pe oprirea de urcare în ordinea de mers. Comanda apare cât timp mai are
 * locuri de urcat; parțial urcată → `partial: { urcate, total }`. Neprezentații (steag din server,
 * v1 gol) nu intră în grupe, ci în `neprezentati`.
 */
export function grupeazaPeOpriri(cursa, local) {
  const opriri = ordineOpriri(cursa?.opriri, cursa?.plecare);
  const pasageri = Array.isArray(cursa?.pasageri) ? cursa.pasageri : [];
  const grupe = new Map();
  const neprezentati = [];
  for (const p of pasageri) {
    const n = numaraPasager(p, local);
    if (n.deUrcat === 0) continue;
    const rand = {
      comanda: p.comanda, nume: p.nume ?? '', telefon: p.telefon ?? '', de_la: p.de_la ?? '', pana_la: p.pana_la ?? '',
      deUrcat: n.deUrcat, total: n.total, urcate: n.urcate,
      partial: n.urcate > 0 ? { urcate: n.urcate, total: n.total } : null,
      nesincronizate: n.nesincronizate,
    };
    if (p.neprezentat) { neprezentati.push(rand); continue; }
    const k = p.de_la_order ?? p.de_la ?? '?';
    if (!grupe.has(k)) {
      const op = opriri.find((s) => s.stop_order === p.de_la_order) ?? null;
      grupe.set(k, { order: p.de_la_order ?? null, oprire: op?.nume ?? p.de_la ?? '', ora: op?.ora ?? '', items: [], n: 0 });
    }
    const g = grupe.get(k);
    g.items.push(rand);
    g.n += n.deUrcat;
  }
  const poz = (g) => { const i = opriri.findIndex((s) => s.stop_order === g.order); return i < 0 ? 999 : i; };
  const lista = [...grupe.values()].sort((a, b) => poz(a) - poz(b) || (minuteDinOra(a.ora) ?? 0) - (minuteDinOra(b.ora) ?? 0));
  for (const g of lista) g.items.sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));
  return { grupe: lista, neprezentati };
}

/** Contoarele cursei, toate în locuri: de urcat / urcați / neprezentați. */
export function contoare(cursa, local) {
  const pasageri = Array.isArray(cursa?.pasageri) ? cursa.pasageri : [];
  let deUrcat = 0; let urcati = 0; let neprezentati = 0;
  for (const p of pasageri) {
    const n = numaraPasager(p, local);
    urcati += n.urcate;
    if (p.neprezentat) neprezentati += n.deUrcat; else deUrcat += n.deUrcat;
  }
  return { deUrcat, urcati, neprezentati };
}

/** Numele de familie pentru harta locurilor: ultimul cuvânt al numelui («Elena Rusu» → «Rusu»). */
export function numeFamilie(nume) {
  const cuv = String(nume ?? '').trim().split(/\s+/).filter(Boolean);
  if (cuv.length === 0) return '';
  return cuv[cuv.length - 1];
}

/**
 * Harta locurilor (1 + 5×3 + 4 = 20): fiecare loc { nr, stare: 'liber'|'online'|'urcat', nume }.
 * Online = bilet neurcat încă, urcat = scanat, liber = fără bilet online (pentru bilet la șofer).
 * Contoarele: online = toate biletele online (urcate sau nu), urcați, libere = capacitate − online.
 */
export function hartaLocuri(cursa, local) {
  const cap = Number(cursa?.capacitate) > 0 ? Number(cursa.capacitate) : CAPACITATE_IMPLICITA;
  const locuri = Array.from({ length: cap }, (_, i) => ({ nr: i + 1, stare: 'liber', nume: '' }));
  let online = 0; let urcati = 0; let faraLoc = 0;
  for (const p of Array.isArray(cursa?.pasageri) ? cursa.pasageri : []) {
    for (const b of Array.isArray(p.bilete) ? p.bilete : []) {
      if (b.status !== 'valid' && b.status !== 'urcat') continue;
      const urcat = esteUrcat(b, local);
      online += 1; if (urcat) urcati += 1;
      const nr = Number(b.loc_nr);
      if (!(nr >= 1 && nr <= cap)) { faraLoc += 1; continue; }
      const loc = locuri[nr - 1];
      loc.stare = urcat ? 'urcat' : 'online';
      loc.nume = numeFamilie(p.nume);
    }
  }
  return { locuri, online, urcati, libere: Math.max(0, cap - online), faraLoc, capacitate: cap };
}

/** Rândurile hărții: [ [1] ] în față, 5 rânduri × [a, b, culoar, c], rândul din spate 4. */
export function randuriLocuri(locuri) {
  const l = (n) => locuri[n - 1] ?? null;
  const randuri = [{ tip: 'fata', locuri: [l(1)] }];
  for (let r = 0; r < 5; r += 1) {
    const b = 2 + r * 3;
    randuri.push({ tip: 'rand', locuri: [l(b), l(b + 1), l(b + 2)] });
  }
  randuri.push({ tip: 'spate', locuri: [l(17), l(18), l(19), l(20)] });
  return randuri;
}

// ───────────────────────── scanarea ─────────────────────────

/** Caută codul în cursa descărcată: { bilet, pasager } sau null. */
export function cautaCod(cursa, cod) {
  const c = String(cod ?? '').trim();
  if (!c) return null;
  for (const p of Array.isArray(cursa?.pasageri) ? cursa.pasageri : []) {
    for (const b of Array.isArray(p.bilete) ? p.bilete : []) {
      if (b.cod_qr === c) return { bilet: b, pasager: p };
    }
  }
  return null;
}

/** Codul QR cum vine din cameră: biletul poate fi tipărit ca link (…/bilet/COD) sau cod gol. */
export function normalizeazaCod(brut) {
  const s = String(brut ?? '').trim();
  if (!s) return '';
  const m = /([A-Z0-9]{12,32})\s*$/i.exec(s.replace(/[?#].*$/, '').replace(/\/+$/, ''));
  return (m ? m[1] : s).toUpperCase();
}

/**
 * Matricea verdictelor (C3), partea locală:
 *  - cod în listă și `valid`, neconfirmat → 'ok' (verde imediat, se trimite);
 *  - cod în listă deja urcat (server sau local) → 'deja_urcat' (roșu, cu ora);
 *  - cod în listă anulat/returnat → 'anulat' (roșu);
 *  - cod lipsă și online → 'verifica' (așteaptă serverul ≤ 3 s);
 *  - cod lipsă și offline → 'neconfirmat' (portocaliu: urcă, intră în coadă).
 */
export function clasificaLocal(cursa, local, cod, online) {
  const g = cautaCod(cursa, cod);
  if (g) {
    const { bilet, pasager } = g;
    if (esteUrcat(bilet, local)) return { verdict: 'deja_urcat', bilet, pasager, urcat_at: urcatLa(bilet, local) };
    if (bilet.status === 'valid') return { verdict: 'ok', bilet, pasager };
    return { verdict: 'anulat', bilet, pasager };
  }
  return { verdict: online ? 'verifica' : 'neconfirmat', bilet: null, pasager: null };
}

/** Răspunsul serverului → verdict de ecran. */
export function verdictDinServer(r) {
  switch (r?.rezultat) {
    case 'ok': return 'ok';
    case 'deja_urcat': return 'deja_urcat';
    case 'anulat': return 'anulat';
    case 'alta_cursa': return 'alta_cursa';
    default: return 'necunoscut';
  }
}

/** Culoarea benzii pentru un verdict. */
export function felulBenzii(verdict) {
  if (verdict === 'ok') return 'ok';
  if (verdict === 'neconfirmat') return 'warn';
  return 'bad';
}

/** Confirmă un loc local (după verde): starea nouă, fără să o mute. */
export function confirmaLocal(local, cod, la, sincronizat = false) {
  const urcate = { ...(local?.urcate ?? {}) };
  urcate[cod] = { la, sincronizat: Boolean(sincronizat) };
  return { ...(local ?? {}), urcate };
}

/**
 * Aplică răspunsurile serverului pe starea locală și pe lista descărcată. Întoarce
 * { local, alerte } — alertele sunt codurile confirmate local (sau lăsate să urce portocaliu)
 * pe care serverul le-a respins după: rând roșu persistent sub contor.
 */
export function aplicaRezultate(local, cursa, rezultate, coada) {
  let st = { ...(local ?? {}), urcate: { ...(local?.urcate ?? {}) } };
  const alerte = [];
  const inCoada = new Map((coada ?? []).map((s) => [s.cod, s]));
  for (const r of Array.isArray(rezultate) ? rezultate : []) {
    const cod = r?.cod; if (!cod) continue;
    const v = verdictDinServer(r);
    const eraLocal = Boolean(st.urcate[cod]);
    const eraOffline = Boolean(inCoada.get(cod)?.offline);
    if (v === 'ok' || (v === 'deja_urcat' && !r.urcat_de_altul)) {
      st.urcate[cod] = { la: st.urcate[cod]?.la ?? r.urcat_at ?? new Date().toISOString(), sincronizat: true };
      const g = cautaCod(cursa, cod);
      if (g && g.bilet.status === 'valid') { g.bilet.status = 'urcat'; g.bilet.urcat_at = r.urcat_at ?? st.urcate[cod].la; }
      continue;
    }
    if (eraLocal || eraOffline) {
      // Confirmat pe telefon, respins de server: nu-l mai numărăm urcat, îl arătăm roșu sub contor.
      delete st.urcate[cod];
      alerte.push({ cod, verdict: v, nume: r.nume ?? cautaCod(cursa, cod)?.pasager?.nume ?? '', cursa_bilet: r.cursa_bilet ?? '', urcat_at: r.urcat_at ?? null, urcat_de_altul: Boolean(r.urcat_de_altul) });
    }
  }
  return { local: st, alerte };
}

/** Coada offline: adaugă o scanare, fără dubluri pe cod. */
export function adaugaInCoada(coada, scanare) {
  const c = Array.isArray(coada) ? coada.filter((s) => s.cod !== scanare.cod) : [];
  c.push(scanare);
  return c;
}

/** Scoate din coadă codurile la care serverul a răspuns. */
export function scoateDinCoada(coada, rezultate) {
  const gata = new Set((rezultate ?? []).map((r) => r?.cod).filter(Boolean));
  return (coada ?? []).filter((s) => !gata.has(s.cod));
}

// ───────────────────────── texte ─────────────────────────

/** '37369123456' → '+373 69 123 456'; alte forme rămân cu «+» și grupe de câte 3. */
export function formatTelefon(tel) {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('373') && d.length === 11) return `+373 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.length === 8 && /^[67]/.test(d)) return `+373 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  return `+${d.replace(/(\d{3})(?=\d)/g, '$1 ')}`;
}

/** 'tel:' pentru apel: +373… sau numărul brut cu «+». */
export function telHref(tel) {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 8 && /^[67]/.test(d)) return `tel:+373${d}`;
  return `tel:+${d}`;
}

/** 'HH:MM' local Chișinău dintr-un ISO; '' dacă lipsește. */
export function oraDin(iso) {
  if (!iso) return '';
  return momentChisinau(iso)?.ora ?? '';
}

/** Eticheta zilei: «luni, 5 oct.» / «пн, 5 окт.». */
export function etichetaZi(zi, lang) {
  if (!zi) return '';
  const d = new Date(`${zi}T12:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return zi;
  const loc = lang === 'ru' ? 'ru-RU' : 'ro-RO';
  return new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: lang === 'ru' ? 'short' : 'long', day: 'numeric', month: 'short' }).format(d);
}

/** «A → B» din «A – B» (ruta ca în grafic). */
export function sensRuta(ruta) {
  const s = String(ruta ?? '').split(/\s[–—-]\s/);
  return s.length >= 2 ? `${s[0]} → ${s[s.length - 1]}` : String(ruta ?? '');
}

/** Titlul antetului: «Briceni – Chișinău – Briceni» când ziua are ambele sensuri, altfel ruta cursei. */
export function titluRuta(curse) {
  const c = Array.isArray(curse) ? curse : [];
  if (c.length === 0) return '';
  const tur = c.find((x) => x.going_north === false) ?? c[0];
  const parti = String(tur.ruta ?? '').split(/\s[–—-]\s/);
  if (c.length >= 2 && parti.length >= 2) return `${parti[0]} – ${parti[parti.length - 1]} – ${parti[0]}`;
  return String(tur.ruta ?? '');
}

/** Dicționarul RO/RU (textele mock-up-ului + stările noi). */
export const T = {
  ro: {
    dinGrafic: 'Din grafic', ruta: 'ruta', altaLimba: 'RU', maine: 'mâine', locuri: 'locuri', loc1: 'loc', locN: 'locuri',
    urcati: 'urcați', ramasi: 'De urcat', neprezentati: 'Neprezentați', acum: 'ACUM', dupaOrar: 'după orar',
    urmatoarea: 'Următoarea', ultimul: 'Ultimul', din: 'din', urcate: 'urcate',
    scaneaza: 'Scanează biletul', indreapta: 'Îndreaptă camera spre codul QR',
    simuleaza: 'Doar în mock: ce vede șoferul după scanare', simOk: 'Bilet bun', simOffline: 'Fără internet', simDeja: 'Deja urcat', simAlta: 'Altă cursă',
    rOkT: 'Urcă', rOkUnLoc: (r) => `1 loc confirmat · mai scanează ${r}`, rOkToate: (n) => `${n} ${n === 1 ? 'loc' : 'din ' + n + ' locuri'} · gata`,
    rWarnT: 'Neconfirmat · urcă', rWarnS: 'fără internet: lasă-l să urce, se verifică când revine semnalul',
    rDejaT: 'Nu urcă · deja scanat', rDejaS: (ora) => (ora ? `scanat la ${ora}` : 'scanat mai devreme'), rDejaAltul: (ora) => `urcat în cealaltă mașină${ora ? ' la ' + ora : ''}`,
    rAltaT: 'Nu urcă · altă cursă', rAltaS: (c) => (c ? `biletul e pentru ${c}` : 'biletul e pentru altă cursă'),
    rAnulatT: 'Nu urcă · bilet anulat', rAnulatS: 'biletul a fost anulat sau returnat',
    rNecT: 'Nu urcă · cod necunoscut', rNecS: 'codul nu e un bilet TRANSLUX',
    rVerificaT: 'Verific…', rVerificaS: 'codul nu e în lista descărcată, întreb serverul',
    respinsTarziu: 'Respins după verificare', atingeInchide: 'atinge ca să închizi',
    offline: 'offline', listaDeLa: 'lista de la', lista: 'Lista', locuriBtn: 'Locuri', locuriTitlu: 'Locurile · la', deLocuri: 'de locuri',
    online: 'Online', libere: 'libere', legOnline: 'online, încă neurcat', legUrcat: 'scanat, urcat', legLiber: 'liber, pentru bilet la șofer', sofer: 'ȘOFER',
    faraLoc: (n) => `${n} fără loc pe hartă`,
    faraCursa: 'Azi nu ai cursă în grafic',
    pasi: ['Dispecerul te pune în grafic.', 'Aici apar plecările tale și pasagerii cu bilet online.', 'La urcare apeși «Scanează» și citești codul QR de pe telefonul pasagerului.'],
    pas4Verde: 'Verde', pas4a: ' = urcă. ', pas4Rosu: 'Roșu', pas4b: ' = nu urcă.',
    maineTitlu: 'Mâine', nelegatT: 'Leagă-ți Telegram-ul', nelegatS: 'Botul îți cere numărul de telefon o singură dată; după aceea aici apare cursa ta din grafic.',
    nelegatBtn: 'Deschide botul', expiratT: 'Deschide din nou din bot', expiratS: 'Sesiunea e mai veche de o zi. Apasă butonul «Biletele» din bot.',
    eroareT: 'Nu pot încărca graficul', eroareS: 'Fără internet sau serverul nu răspunde.', reincearca: 'Reîncearcă',
    doarTelegram: 'Scanarea merge doar în aplicația Telegram.', seIncarca: 'Se încarcă…', nesincronizat: 'nesincronizat',
    altaMasina: 'scanat și în cealaltă mașină',
  },
  ru: {
    dinGrafic: 'По графику', ruta: 'маршрут', altaLimba: 'RO', maine: 'завтра', locuri: 'мест', loc1: 'место', locN: 'мест',
    urcati: 'сели', ramasi: 'Ещё сядут', neprezentati: 'Не пришли', acum: 'СЕЙЧАС', dupaOrar: 'по расписанию',
    urmatoarea: 'Следующий', ultimul: 'Последний', din: 'из', urcate: 'сели',
    scaneaza: 'Сканировать билет', indreapta: 'Наведи камеру на QR-код',
    simuleaza: 'Только в макете: что видит водитель после сканирования', simOk: 'Билет верный', simOffline: 'Нет интернета', simDeja: 'Уже сел', simAlta: 'Другой рейс',
    rOkT: 'Садится', rOkUnLoc: (r) => `1 место подтверждено · сканируй ещё ${r}`, rOkToate: (n) => `${n} ${n === 1 ? 'место' : 'из ' + n + ' мест'} · готово`,
    rWarnT: 'Не подтверждён · садится', rWarnS: 'нет интернета: пусть садится, проверится, когда появится связь',
    rDejaT: 'Не садится · уже сканирован', rDejaS: (ora) => (ora ? `сканирован в ${ora}` : 'сканирован раньше'), rDejaAltul: (ora) => `сел в другую машину${ora ? ' в ' + ora : ''}`,
    rAltaT: 'Не садится · другой рейс', rAltaS: (c) => (c ? `билет на ${c}` : 'билет на другой рейс'),
    rAnulatT: 'Не садится · билет отменён', rAnulatS: 'билет отменён или возвращён',
    rNecT: 'Не садится · код неизвестен', rNecS: 'это не билет TRANSLUX',
    rVerificaT: 'Проверяю…', rVerificaS: 'кода нет в загруженном списке, спрашиваю сервер',
    respinsTarziu: 'Отклонён после проверки', atingeInchide: 'нажми, чтобы закрыть',
    offline: 'офлайн', listaDeLa: 'список от', lista: 'Список', locuriBtn: 'Места', locuriTitlu: 'Места · в', deLocuri: 'мест',
    online: 'Онлайн', libere: 'свободно', legOnline: 'онлайн, ещё не сел', legUrcat: 'сканирован, сел', legLiber: 'свободно, для билета у водителя', sofer: 'ВОДИТЕЛЬ',
    faraLoc: (n) => `${n} без места на схеме`,
    faraCursa: 'Сегодня у тебя нет рейса в графике',
    pasi: ['Диспетчер ставит тебя в график.', 'Здесь появятся твои рейсы и пассажиры с онлайн-билетом.', 'При посадке нажимаешь «Сканировать» и читаешь QR-код с телефона пассажира.'],
    pas4Verde: 'Зелёный', pas4a: ' = садится. ', pas4Rosu: 'Красный', pas4b: ' = не садится.',
    maineTitlu: 'Завтра', nelegatT: 'Привяжи свой Telegram', nelegatS: 'Бот один раз попросит номер телефона; после этого здесь будет твой рейс из графика.',
    nelegatBtn: 'Открыть бота', expiratT: 'Открой снова из бота', expiratS: 'Сессии больше суток. Нажми кнопку «Билеты» в боте.',
    eroareT: 'Не могу загрузить график', eroareS: 'Нет интернета или сервер не отвечает.', reincearca: 'Повторить',
    doarTelegram: 'Сканирование работает только в приложении Telegram.', seIncarca: 'Загрузка…', nesincronizat: 'не синхронизирован',
    altaMasina: 'сканирован и в другой машине',
  },
};

/** Limba inițială: cea memorată, altfel din Telegram (ru → RU), altfel RO. */
export function limbaInitiala(memorata, codTelegram) {
  if (memorata === 'ro' || memorata === 'ru') return memorata;
  return String(codTelegram ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'ro';
}

/** «2 locuri» / «1 loc» / «2 мест» / «1 место». */
export function locuriText(n, lang) {
  const t = T[lang] ?? T.ro;
  if (lang === 'ru') {
    const a = Math.abs(n) % 100; const b = a % 10;
    if (a > 10 && a < 20) return `${n} мест`;
    if (b === 1) return `${n} место`;
    if (b >= 2 && b <= 4) return `${n} места`;
    return `${n} мест`;
  }
  return `${n} ${n === 1 ? t.loc1 : t.locN}`;
}

/**
 * Textul benzii (și al rândului «Ultimul»): { fel, titlu, sub }.
 * `info`: { nume, ramase, total, urcat_at, urcat_de_altul, cursa_bilet }.
 */
export function textBanda(verdict, info, lang) {
  const t = T[lang] ?? T.ro;
  const nume = info?.nume ? `${info.nume} · ` : '';
  switch (verdict) {
    case 'ok': {
      const ramase = Number(info?.ramase ?? 0); const total = Number(info?.total ?? 1);
      const sub = ramase > 0 ? t.rOkUnLoc(ramase) : (total > 1 ? t.rOkToate(total) : `1 ${t.loc1}`);
      return { fel: 'ok', titlu: t.rOkT, sub: nume + sub };
    }
    case 'neconfirmat': return { fel: 'warn', titlu: t.rWarnT, sub: t.rWarnS };
    case 'verifica': return { fel: 'warn', titlu: t.rVerificaT, sub: t.rVerificaS };
    case 'deja_urcat': {
      const ora = oraDin(info?.urcat_at);
      return { fel: 'bad', titlu: t.rDejaT, sub: nume + (info?.urcat_de_altul ? t.rDejaAltul(ora) : t.rDejaS(ora)) };
    }
    case 'alta_cursa': return { fel: 'bad', titlu: t.rAltaT, sub: t.rAltaS(info?.cursa_bilet) };
    case 'anulat': return { fel: 'bad', titlu: t.rAnulatT, sub: nume + t.rAnulatS };
    default: return { fel: 'bad', titlu: t.rNecT, sub: t.rNecS };
  }
}

// ───────────────────────── contul șoferului, cache-ul pe cont, coada (ION-272, «Telegram ultrafast» P2+P3) ─────────────────────────

/** id-ul contului Telegram din initData (câmpul `user`, JSON), fără SDK; null dacă lipsește. */
export function userIdDinInitData(initData) {
  try {
    const u = new URLSearchParams(String(initData ?? '')).get('user');
    const id = u ? Number(JSON.parse(u)?.id) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch { return null; }
}

export const PREFIX_CHEI = 'bilete-sofer';

/**
 * Cheile localStorage ale unui cont: pe un telefon cu două conturi Telegram (sau șofer schimbat pe telefonul de serviciu)
 * lista, starea și coada unuia nu trebuie să apară la celălalt. Fără id — cheile vechi, fără cont (ca înainte).
 */
export function cheiCont(userId) {
  const p = userId ? `${PREFIX_CHEI}:${userId}` : PREFIX_CHEI;
  return { prefix: p, lang: `${PREFIX_CHEI}:lang`, cache: `${p}:cache`, coada: `${p}:coada`, stare: (c) => `${p}:stare:${c}`, alerte: (c) => `${p}:alerte:${c}` };
}

export const CACHE_MAX_MS = 12 * 60 * 60_000;

/** Lista din cache e destul de proaspătă ca să fie arătată imediat (SWR), înainte de răspunsul serverului. */
export function cacheProaspat(cache, acumMs, maxMs = CACHE_MAX_MS) {
  const t = Date.parse(cache?.descarcatLa ?? '');
  return Boolean(cache?.date?.curse) && Number.isFinite(t) && acumMs - t >= 0 && acumMs - t <= maxMs;
}

/**
 * Mută o singură dată cheile vechi (fără cont) sub contul curent: telefonul era al lui. Coada se ÎMBINĂ (scanările
 * nesincronizate nu se pierd); cache/stare/alerte se copiază doar dacă contul n-are deja. Cheile altor conturi
 * (`bilete-sofer:<alt id>:…`) nu se ating. `st` = { get, set, del, keys } peste localStorage. Întoarce câte chei a mutat.
 */
export function migreazaCheiVechi(st, userId) {
  if (!userId) return 0;
  const vechi = cheiCont(null); const noi = cheiCont(userId);
  let n = 0;
  for (const k of st.keys()) {
    if (!k.startsWith(`${PREFIX_CHEI}:`) || k.startsWith(`${noi.prefix}:`) || k === vechi.lang) continue;
    if (/^bilete-sofer:\d+:/.test(k)) continue; // alt cont
    let dest = null;
    if (k === vechi.cache) dest = noi.cache;
    else if (k === vechi.coada) dest = noi.coada;
    else if (k.startsWith(`${PREFIX_CHEI}:stare:`)) dest = noi.stare(k.slice(`${PREFIX_CHEI}:stare:`.length));
    else if (k.startsWith(`${PREFIX_CHEI}:alerte:`)) dest = noi.alerte(k.slice(`${PREFIX_CHEI}:alerte:`.length));
    if (!dest) continue;
    const v = st.get(k); const cur = st.get(dest);
    if (k === vechi.coada) {
      const imbinata = [...(Array.isArray(cur) ? cur : [])];
      for (const s of Array.isArray(v) ? v : []) if (s?.cod && !imbinata.some((x) => x.cod === s.cod)) imbinata.push(s);
      st.set(dest, imbinata);
    } else if (cur == null && v != null) st.set(dest, v);
    st.del(k); n++;
  }
  return n;
}

/**
 * Ce facem cu coada când serverul refuză un lot (C1 din critica Codex, runda 2): DOAR 403 `cursa_straina` scoate cheia
 * (cursa) respectivă — telefon partajat, scanări ale altui șofer; 401 → reautentificare (initData reîmprospătat) și o
 * reîncercare; 429 → reluare după Retry-After (implicit 60 s); orice altceva lasă coada neatinsă. Nicio scanare nu se
 * pierde în afara cazului 403.
 */
export function trateazaEsecCoada(status, corp, cheie, coada, retryAfterS) {
  const c = Array.isArray(coada) ? coada : [];
  if (status === 403 && corp?.eroare === 'cursa_straina') {
    const scoase = c.filter((s) => (s.cheie ?? cheie) === cheie);
    return { actiune: 'scoate', coada: c.filter((s) => (s.cheie ?? cheie) !== cheie), scoase };
  }
  if (status === 401) return { actiune: 'reauth', coada: c, scoase: [] };
  if (status === 429) { const s = Number(retryAfterS); return { actiune: 'asteapta', coada: c, scoase: [], asteaptaMs: (Number.isFinite(s) && s > 0 ? s : 60) * 1000 }; }
  return { actiune: 'nimic', coada: c, scoase: [] };
}
