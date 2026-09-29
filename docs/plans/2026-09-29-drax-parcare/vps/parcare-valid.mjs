// ION-136 (Codex r5 C2): validarea parcare.json, COMUNĂ pentru scrie-parcare.mjs și harta-zi.mjs — rulată înaintea oricărei scrieri în bază
// (inclusiv înainte de DELETE). O propunere care nu trece nu ajunge nici în raport, nici pe hartă.
export function valideazaParcare(PK) {
  const e = [], M = PK?.masini;
  if (!Array.isArray(M)) return ['parcare.json fără masini[]'];
  const peste = M.filter((x) => x.idealSapt != null && x.economieSapt > x.idealSapt + 0.5).map((x) => `${x.m} ${x.economieSapt}>${x.idealSapt}`);
  if (peste.length) e.push(`peste ideal [${peste.join(', ')}]`);
  const nefinit = M.filter((x) => ![x.economieSapt, x.economieMasurata, x.real, x.propus].every(Number.isFinite)).map((x) => x.m);
  if (nefinit.length) e.push(`nefinit [${nefinit.join(', ')}]`);
  const minD = PK.parametri?.MIN_DRUMURI ?? 3, prag = PK.parametri?.PRAG_AL_DOILEA ?? 20;
  const doi = M.filter((x) => x.locuri?.length === 2 && (x.locuri.some((l) => l.drumuri < minD) || !(x.castigAlDoilea >= prag))).map((x) => x.m);
  if (doi.length) e.push(`două locuri neeligibile [${doi.join(', ')}]`);
  // orice noapte ne-separată a unei mașini cu loc trebuie să aibă ancorele E / S (ancore === true; lipsa câmpului = respins)
  const faraAnc = M.filter((x) => x.locuri?.length && (x.legi ?? []).some((l) => l.parte === 'noapte' && !l.separat && l.ancore !== true)).map((x) => x.m);
  if (faraAnc.length) e.push(`nopți fără ancore E / S [${faraAnc.join(', ')}]`);
  const faraLoc = M.filter((x) => !x.locuri?.length && (x.legi ?? []).length).map((x) => x.m);
  if (faraLoc.length) e.push(`drumuri propuse fără loc [${faraLoc.join(', ')}]`);
  return e;
}
