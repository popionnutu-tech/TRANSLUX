# ION-133 — runda 6: răspunsul la Codex runda 5 (8.0, fail: C2 high — parcul)

Cod: vps/ziua-ideala-candidat.mjs (ultimele patch13.mjs, patch14.mjs). Probe și cazurile auditate: vps/probe-r6.txt.

## C2 (high) — parcul nu reproducea condițiile producătorului — ACCEPTAT, reparat
Acum identic cu categorii.mjs:296–298 și :360–368:
- **contextul liniilor**: masca parcului se face DOAR când producătorul a dat intervalului km «parc» (v.parc > 0). Producătorul dă parc doar
  cu linii adiacente diferite (`!aceeasi`) și cu staționare la parc → aceeași linie ⇒ nicio mască de parc (proba P5);
- **staționări efective**: urma păstrează acum marcajul staționării (st = 1 la început, cu t1), iar parcSt = staționările st = 1 cu
  ≤ PARC.r de parc, `!poarta(x)` (raza porții, fără extra) și ≥ 5 min — mersul încet în rază nu contează (P6);
- **zona comună parc–poartă**: staționarea la 0,36 km de parc și 0,36 km de poarta VEST e exclusă (P7);
- bucățile: tai = [început, …t/t1 ale staționărilor, sfârșit], perechi (0–1, 2–3, …), toate punctele în zona de 3 km, muchiile consecutive (P4).
- fiecare categorie se scade până la km-ii ei de la producător: min(între uzine, v.munca) + min(parc, v.parc) (nu min(total obligatoriu, total zonă)).

Și o abatere găsită de probe în runda asta (nesemnalată de Codex): regula «toată mișcarea în zonă și ≤ 11 km = toată între uzine» se aplica
fără condiția producătorului (categorii.mjs:432 `if (!drum.length) continue;` — întâi trebuie o pereche poartă → poartă). Reparat: se aplică doar
cu ≥ 1 pereche validă (proba P8: în zonă, fără pereche de porți → nimic).

Probe (probe-r6.txt): P1 VEST→EST apoi mișcare în zonă neobligatorie → doar VEST→EST (0,86 km) · P2 toată în zonă cu pereche → toate · P3 trecere
fără oprire → nimic · P4 staționare 10 min la parc, linii diferite → parc marcat · P5 aceeași linie → nimic · P6 fără staționare efectivă → nimic ·
P7 zona comună parc–poartă → nimic · P8 în zonă fără pereche → nimic.

## Simularea 14.09
Flota 5.313,5 → 4.272,7 km măsurat (extrapolat 6.316 → 5.079); muncă 1.040,8; noapte 1.619,5 (=); ocol 2.690,5 (=); acasaDrumLung 211,7;
drumLung 6,6; mai scurt −255,6 (=); bilanț = economie; peste prag 23 → 19. 518MHD 457,4 → 373,8 (17.09: 108,8 → 79,1); 446ASB 221,3 → 109,8.
Cele 8 intervale auditate: neschimbate față de runda 5 (probe-r6.txt).
