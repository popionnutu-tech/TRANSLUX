// Idealul v3 (ION-97), faza 1 pct. 1–2: ORA LOCALĂ și FAZA SĂPTĂMÂNII, într-un singur loc pentru tot lanțul ideal-v3.1.
// Înlocuiește «UTC + 3» fix (etalon.mjs:21-23, card-gps.mjs:30, fix-dubluri.mjs:10, dubluri-placa.mjs:15, curse.mjs:35/73 din ideal-v2):
// ora de vară EEST e UTC+3, cea de iarnă EET (din 25.10.2026, 04:00 → 03:00) e UTC+2. Timpul GPS e UTC (curse.mjs:14, parserul 1114 → «Z»).
//   · oraLoc(t)     ora locală zecimală (06:15 → 6.25), prin Intl Europe/Chisinau (ca lde-geo-worker/ora-locala.mjs și etalon-gps.mjs:20);
//   · ziLocala(t)   data calendaristică locală (00:00 → 00:00);
//   · ziLucru(t)    ziua de lucru 03:00 → 03:00 locală (LEAR §2.4 / Drăxlmaier §2.6), pe CEASUL LOCAL: ora < 03:00 → ziua de dinainte.
//                   (drax/cod/economie/comun.mjs:47 și verificatorul drax.mjs:63 folosesc ziLocala(t − 3 h): identic tot anul, cu excepția
//                   orei 02:00–02:59 EET din noaptea de 25.10 — Moldova dă ceasul înapoi la 03:00 → 02:00 —, pe care acolo o pun în ziua nouă);
//   · inceputZiLucru(z)  momentul UTC al orei 03:00 locale din ziua z (limitele ferestrei în SQL).
// Faza săptămânii (pct. 2): turele grupelor se ROTESC din săptămână în săptămână (Ion, 25.09) — alternanță de la o săptămână-ANCORĂ,
// nu paritatea ISO (2026 are săptămâna ISO 53: 53 și 1 sunt ambele impare, deci paritatea s-ar rupe la 04.01.2027).
//   ANCORA = luni 21.09.2026 (ISO 39). Faza «A» = ancora și săptămânile la distanță pară de ea (în 2026 = săptămânile ISO impare),
//   faza «B» = celelalte (în 2026 = ISO pare). Pe fereastra idealului (mai–sept. 2026) A ≡ impare, B ≡ pare, deci rezultatul e același.
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const locStr = (t) => FMT.format(new Date(t));                                   // «2026-09-14 06:13:05»
export const oraLoc = (t) => { const s = locStr(t); return +s.slice(11, 13) + +s.slice(14, 16) / 60; };   // ore + minute, fără secunde (ca etalon.mjs:22 din v2)
export const ziLocala = (t) => locStr(t).slice(0, 10);
const ziInainte = (z) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
export const ziLucru = (t) => { const s = locStr(t); return +s.slice(11, 13) < 3 ? ziInainte(s.slice(0, 10)) : s.slice(0, 10); };
export function inceputZiLucru(z) {   // 03:00 locală a zilei z → Date (UTC)
  const guess = Date.parse(`${z}T03:00:00Z`); const loc = Date.parse(locStr(guess).replace(' ', 'T') + 'Z');
  return new Date(guess - (loc - guess));
}
export const ANCORA = '2026-09-21';
export const luniSapt = (z) => { const d = new Date(z + 'T12:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
export const fazaSapt = (z) => { const n = Math.round((Date.parse(luniSapt(z) + 'T12:00:00Z') - Date.parse(ANCORA + 'T12:00:00Z')) / 604800000); return ((n % 2) + 2) % 2 === 0 ? 'A' : 'B'; };
export const FAZA_TXT = { A: 'faza A (ancora 21–27.09.2026 și din 2 în 2 săptămâni)', B: 'faza B (14–20.09, 28.09–04.10 … )' };
