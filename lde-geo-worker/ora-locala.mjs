// Ora locală a Moldovei (Europe/Chisinau) pentru workerii care citesc trackerul (ION-57).
//
// Până pe 24.09.2026 `lear-analiza.mjs` făcea `local = +6 h`: trei ore fiindcă node-postgres
// citea `track.w_date` (UTC, fără fus) ca oră locală a serverului, și încă trei pentru fusul
// verii. Corect DOAR vara: din 25.10 (UTC+2) toate orele ar fi ieșit cu +2 h, iar ferestrele
// schimburilor — inima detectorului de timp liber — ar fi murit la schimbarea orei.
//
// Aici: un singur formator Intl, construit o dată, iar offsetul se ține minte pe ora UTC
// (`local()` se cheamă pe fiecare punct al urmei — sute de mii pe săptămână). Offsetul e
// constant în interiorul unei ore UTC: la Chișinău ora se schimbă la oră fixă UTC (01:00Z).
//
// `local(t)` întoarce o Date «de perete»: câmpurile ei getUTC* sunt ora locală, ca
// `.toISOString().slice(11, 16)` și `.getUTCHours()` din apelanți să rămână neschimbate.
const FUS = 'Europe/Chisinau';
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: FUS, year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const cache = new Map();   // ora UTC (număr de ore de la epocă) → offset în ms

export function offsetLocal(t) {
  const ora = Math.floor(+new Date(t) / 3600000);
  let off = cache.get(ora);
  if (off === undefined) {
    const p = fmt.formatToParts(new Date(ora * 3600000));
    const g = k => +p.find(x => x.type === k).value;
    off = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ora * 3600000;
    cache.set(ora, off);
  }
  return off;
}

export function local(t) { return new Date(+new Date(t) + offsetLocal(t)); }

// Ziua de lucru se taie la 03:00 locale (aceeași convenție ca la toți workerii LDE).
export function ziLucru(t, taieturaOre = 3) {
  return new Date(local(t).getTime() - taieturaOre * 3600000).toISOString().slice(0, 10);
}
