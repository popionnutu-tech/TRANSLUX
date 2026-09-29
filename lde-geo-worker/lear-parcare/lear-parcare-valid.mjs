// ION-143: probele comune ale parcării LEAR, înaintea oricărei scrieri (scrie-lear-parcare.mjs și lear-harta.mjs), ca la Drăxlmaier (parcare-valid.mjs).
// Întoarce lista problemelor; goală = se poate scrie.
export function valideazaParcareLear(PK) {
  const rele = [], fin = (x) => typeof x === 'number' && Number.isFinite(x);
  if (!PK || !Array.isArray(PK.masini)) return ['parcare.json fără masini'];
  const P = PK.parametri ?? {};
  for (const x of PK.masini) {
    if (!x.locuri?.length) { if (!x.motivFara) rele.push(`${x.m}: fără loc și fără motiv`); continue; }
    if (![x.real, x.propus, x.economieSapt].every(fin)) rele.push(`${x.m}: valori nefinite`);
    if (x.economieSapt < 0) rele.push(`${x.m}: economie negativă`);
    if (fin(x.real) && fin(x.propus) && Math.abs(x.real - x.propus - x.economieSapt) > 0.2) rele.push(`${x.m}: economie ≠ real − propus`);
    if (x.locuri.length > 2) rele.push(`${x.m}: mai mult de două locuri`);
    if (x.locuri.length === 2) {
      if (!(x.castigAlDoilea >= (P.PRAG_AL_DOILEA ?? 20) - 0.05)) rele.push(`${x.m}: al doilea loc sub prag (${x.castigAlDoilea})`);
      if (x.locuri.some((l) => !(l.drumuri >= (P.MIN_DRUMURI ?? 3)))) rele.push(`${x.m}: loc folosit la prea puține drumuri`);
    }
    if (x.locuri.some((l) => !Array.isArray(l.c) || !l.c.every(fin))) rele.push(`${x.m}: loc fără coordonate`);
    if ((x.legi ?? []).some((l) => l.loc == null || !fin(l.km) || !fin(l.real) || l.km > l.real + 0.05)) rele.push(`${x.m}: drum fără loc, cu km nefiniți sau propus peste real`);
    const zi = (x.zile ?? []).reduce((s, d) => s + (d.real - d.propus), 0);
    if (Math.abs(zi - (x.real - x.propus)) > 0.5) rele.push(`${x.m}: zilele nu se adună la săptămână`);
  }
  return rele;
}

// ION-143 (Codex r1 C1): forma hărții înainte de publicare — aceeași uzină și săptămână ca parcarea, câte un rând pe mașină și zi,
// fiecare rând cu urmă, iar locurile și economia săptămânii identice cu parcarea
export function valideazaHartaLear(H, PK) {
  const rele = [];
  if (!H || !Array.isArray(H.randuri) || !H.randuri.length) return ['harta fără rânduri'];
  const chei = new Set(), pk = new Map((PK?.masini ?? []).map((x) => [x.m, x]));
  for (const r of H.randuri) {
    if (r.uzina !== PK.uzina || r.saptamina !== PK.saptamina) { rele.push(`${r.m} ${r.z}: altă uzină / săptămână`); continue; }
    const k = `${r.m}|${r.z}`; if (chei.has(k)) rele.push(`${k}: rând dublu`); chei.add(k);
    if (!r.date?.iv?.length) rele.push(`${k}: fără urmă`);
    const x = pk.get(r.m); if (!x) { rele.push(`${k}: mașina nu e în parcare`); continue; }
    if (Math.abs((r.sumar?.economieSapt ?? 0) - (x.economieSapt ?? 0)) > 0.05) rele.push(`${k}: economia săptămânii ≠ parcarea`);
    if ((r.date?.parcare?.locuri ?? []).map((l) => l.n).join('|') !== (x.locuri ?? []).map((l) => l.n).join('|')) rele.push(`${k}: locurile ≠ parcarea`);
  }
  return rele;
}
