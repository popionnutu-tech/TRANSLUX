# ION-136 — runda 5: răspunsul la Codex runda 4 (7,5 după formulă; fail: C2 high — rezerva pe rândurile fără ancore)

## C2 (high) — ACCEPTAT, reparat: nu mai există rezervă
- vps/parcare.mjs: dacă ziua-ideala.json nu are ancore pe niciun rând (rulare de dinainte de ION-136) → `exit 3`, parcarea NU se calculează (în lanț pasul
  parcare rulează după ziua ideală, care acum scrie ancorele).
- Noaptea ne-separată fără E sau S la o mașină → mașina NU primește propunere: `motivFara = «lipsesc ancorele nopții în ziua ideală — se rulează întâi
  ziua-ideala.mjs»`. Nicio rezervă pe capetele curselor.
- Fiecare drum de noapte publicat poartă `ancore: true|false`; vps/scrie-parcare.mjs refuză scrierea dacă o mașină cu loc are o noapte ne-separată cu
  `ancore !== true`. vps/proba-noapte.mjs numără noaptea fără ancore ca abatere.

## Regresia (pe VPS, copii în /tmp; vps/strip.mjs, vps/inject.mjs)
- R1: ziua-ideala.json cu ancorele șterse de pe toate rândurile → parcare.mjs iese cu 3: «ziua-ideala.json fără ancore (E / S) — … parcarea NU se calculează».
- R2: ancorele șterse doar la 518MHD (PARCARE_DOAR=518MHD,446ASB) → 518MHD: 0, «lipsesc ancorele nopții …», fără loc; 446ASB neatins (103,7, Scumpia).
- R3: parcare.json cu o noapte `ancore: false` injectată la 446ASB → scrie-parcare.mjs: «nopți fără ancore E / S [446ASB] — date.parcare NU se scrie», ieșire 1.
- Săptămâna reală recalculată: 150 de nopți, 0 abateri (toate cu ancore, toate din E în S); scrie-parcare (fără --write) trece toate probele.
  Flota 4.507,2 km/săpt. (4.028,8 măsurat), ideal 4.777,2, 15 cu două locuri, 17 peste 100 km, 0 peste ideal.
