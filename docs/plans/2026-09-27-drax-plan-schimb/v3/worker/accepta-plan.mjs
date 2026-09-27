// ION-108 (aditiv): planul «drumul acasă între curse + schimbul de linii» (drax/cod/plan-schimb/v3) intră în rândul săptămânii
// DOAR dacă e al acestei săptămâni, calculat din aceleași date (amprenta md5) și cu toți invarianții trecuți. Altfel planSchimb: null
// + motivul în cuvinte. Nu aruncă niciodată: rândul se scrie oricum. verificaPlan e pură (testată în accepta-plan.test.mjs).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const VERSIUNE_PLAN = 'plan-schimb v3';
const MOTIV_COD = { 1: 'un control al planului a picat', 2: 'lipsesc datele săptămânii pentru plan', 3: 'drumurile nu s-au putut calcula (Valhalla)', 4: 'eroare în calculul planului' };
const CAMPURI = ['sapt', 'pana', 'versiune', 'estimare', 'rotatie', 'asteptare', 'schimb', 'intrare'];

/** p = JSON-ul planului; asteptat = { luni, md5Economie, md5Zile } → { ok, motiv } */
export function verificaPlan(p, asteptat) {
  if (!p || typeof p !== 'object') return { ok: false, motiv: 'planul nu se poate citi' };
  if (typeof p.versiune !== 'string' || !p.versiune.startsWith(VERSIUNE_PLAN)) return { ok: false, motiv: `plan de altă versiune (${p.versiune ?? '?'})` };
  if (p.sapt !== asteptat.luni) return { ok: false, motiv: `plan de altă săptămână (${p.sapt ?? '?'})` };
  if (p.intrare?.economie !== asteptat.md5Economie || p.intrare?.economieZile !== asteptat.md5Zile) return { ok: false, motiv: 'planul e calculat din alte date decât rândul (amprenta diferă)' };
  const inv = Array.isArray(p.invarianti) ? p.invarianti : null;
  if (!inv || !inv.length) return { ok: false, motiv: 'planul nu are lista invarianților' };
  const picat = inv.filter((k) => p.control?.[k]?.trece !== true);
  if (picat.length) return { ok: false, motiv: `un control al planului a picat (${picat.join(', ')})` };
  if (!p.asteptare || !p.schimb) return { ok: false, motiv: 'planul nu are forma așteptată' };
  return { ok: true, motiv: null };
}
export const subset = (p) => Object.fromEntries(CAMPURI.map((k) => [k, p[k] ?? null]));

/** din dosarul săptămânii: { plan (subset) | null, motiv } */
export function acceptaPlan(dir, luni) {
  try {
    const f = `${dir}/plan-schimb.json`;
    if (!existsSync(f)) {
      let motiv = 'planul nu s-a calculat';
      try { const m = JSON.parse(readFileSync(`${f}.motiv`, 'utf8')); motiv = MOTIV_COD[m.cod] ?? motiv; } catch { /* fără .motiv */ }
      return { plan: null, motiv };
    }
    const md5 = (x) => createHash('md5').update(readFileSync(`${dir}/${x}`)).digest('hex');
    const p = JSON.parse(readFileSync(f, 'utf8'));
    const v = verificaPlan(p, { luni, md5Economie: md5('economie.json'), md5Zile: md5('economie-zile.json') });
    return v.ok ? { plan: subset(p), motiv: null } : { plan: null, motiv: v.motiv };
  } catch (e) { return { plan: null, motiv: `planul nu se poate citi (${String(e?.message ?? e).slice(0, 120)})` }; }
}
