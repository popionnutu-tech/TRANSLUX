// ION-147: felul unui interval fără oameni pe harta SEBN (funcție pură, testată în sebn-harta-core.test.mjs).
//  - «uzina»  : nu iese la > 1,5 km de nicio poartă SEBN (așteaptă la poartă / la Bucuria);
//  - «bucla»  : pornește și se termină la poarta mașinii, nu iese la > 5 km de ea și nu stă ≥ 45 min în afara porții — bucla la predarea
//               turei (lasă schimbul, ocolul prin Slobozia Doamnei, așteaptă la Bucuria schimbul care iese). Răspunsul 2: categorie separată,
//               NU drum de parcare, fără km de tăiat. Aceeași regulă ca în sebn-parcare.mjs, fără pragul de 60 min al golului; mașina care
//               doarme acasă la ≤ 5 km de poartă (823MUM, 893BRAX — Slobozia Doamnei) nu face buclă, stă acasă → «gol»;
//  - «munca»  : oprire în raza Parcului Bălți (§11.4, 0,5 km) — service;
//  - «gol»    : restul.
export const BUCLA_KM = 5, R_UZINA = 1.5, STA_MIN = 45;
function staDeparte(S, porti, hav) {
  let a = 0;
  for (let i = 1; i <= S.length; i++) {
    if (i === S.length || hav(S[a], S[i]) > 0.3) {
      if (S[i - 1].t - S[a].t >= STA_MIN * 60e3 && porti.every((g) => hav(S[a], g) > R_UZINA)) return true;
      a = i;
    }
  }
  return false;
}
export function clasaGol(S, { G, rPoarta, porti, parc, rParc, hav }) {
  if (!S.length) return 'gol';
  if (S.every((p) => porti.some((g) => hav(p, g) <= R_UZINA))) return 'uzina';
  if (hav(S[0], G) <= rPoarta + 0.3 && hav(S.at(-1), G) <= rPoarta + 0.3 && S.every((p) => hav(p, G) <= BUCLA_KM) && !staDeparte(S, porti, hav)) return 'bucla';
  if (S.some((p) => hav(p, parc) <= rParc && p.v <= 1)) return 'munca';
  return 'gol';
}
