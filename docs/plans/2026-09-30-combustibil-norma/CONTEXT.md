# ION-151 — Consumul de motorină (DT): contextul comun pentru toate rundele

Proprietar: Ion (director, TRANSLUX / Parcul de Autobuze nr. 9 Briceni, Moldova). Flota: ~216 unități —
autobuze și microbuze pe transportul de personal al uzinelor (Drăxlmaier Bălți, LEAR Ungheni + Florești, SEBN Orhei + Strășeni,
Trox + suburban Briceni), autobuze interurbane (rute regulate), camioane (cisterne «camcer», zernovozuri — curse lungi, și în RO/UA/BG).

## Întrebarea lui Ion (30.09.2026)
1. **Care e cea mai bună metodă de a număra norma** (l/100 km) pe fiecare mașină — cea pe care se judecă luna și se trag oamenii la răspundere.
2. **Anomalii în DT**: alimentări/foi suspecte, km lipsă sau fantomă, mașini care consumă peste ce e firesc, șoferi, stații, zile.
3. **Per total: ce se poate face** — cu litri și lei estimați, ordonat după efect.

## Datele (docs/plans/2026-09-30-combustibil-norma/date/, CSV, UTF-8)
- `vehicule.csv` — flota: placa, active, directii (DRAXELMAIER_BALTI, LEAR_UNGHENI, LEAR_FLORESTI, SEBN_ORHEI, SEBN_STRASENI,
  suburban, interurban, camioane…), tip + norma tipului (norma_tip, l/100) + norma măsurată (măsurare iunie 2026, pe unele mașini).
- `alimentari_benzol.csv` — alimentări la stațiile proprii (programul benzol / benzol2), cu ORĂ (alimentat_at UTC; ora locală = UTC+3 vara,
  UTC+2 iarna). 2025-01-01 → 2026-09-30. suma_lei = 0 (prețul nu e în date). sofer = cod pseudonim.
- `foi_parcurs.csv` — litrii scriși de operator pe foaia de parcurs LDE, pe mașină × zi, FĂRĂ oră. foaie = tabelul sursă:
  pz_c (Chișinău), pz_u (Ungheni), pz_i, pz_cd, pz_b, pz_s, pz_ben, **pz_camcer (cisternele/camioanele)**. km_foaie = km scriși pe foaie
  (adesea 1 sau gol — nu e de încredere). Chișinău și Ungheni alimentează aproape numai pe foaie (~70.000 l/lună lipsesc din benzol).
  Foile = alimentări la stații străine / pe card; după spusele sistemului, benzol-ul NU e dublat pe foaie — dar asta e de verificat.
- `km_gps_zi.csv` — km pe zi din GPS-ul nostru (din 10.06.2026 pe toată flota): km_total = km_check (urma brută) + km_patched (goluri de
  semnal cârpite); suspect/suspect_reason (ex. «punte_mare:27.7km» = salt peste un gol). Problemă cunoscută: mașina parcată cu GPS care
  «sare» dă 16–36 km fantomă pe zi (km_total − km_patched < 5 ⇒ zi de parcare).
- `km_lde_m2m.csv` — km pe mașină × zi din baza LDE (GPS-ul lor), din 2025; pe iul–sep 2026, 88 % din zilele comune la ±10 % de GPS-ul
  nostru, Σ m2m ~8 % peste. Camioanele NU au km în LDE (le au doar din Wialon, din iunie 2026, în km_gps_zi).

## Ce se face azi (producție, ION-138 / ION-145)
- **Luna**: litri (benzol + foaie) de la prima zi cu km până la ultima zi cu ≥ 20 km / km lunii (GPS, altfel m2m; zilele de parcare fără
  km cârpiți). Sub 1.000 km/lună cifra lunii e gri, fără abatere.
- **Norma («din iunie»)**: plin la plin de la 10.06.2026: «plin» = alimentarea ≥ 85 % din P90 al alimentărilor mașinii; consum =
  litrii turnați după primul plin până la ultimul plin inclusiv / km dintre ele (pe zile: litri z1<zi≤z2, km z1≤zi<z2); intervalele sub
  300 km ies; minim 3 intervale, altfel norma veche (măsurată / a tipului), marcată cu *.
- Nu avem senzor de nivel în rezervor; «plin» e ghicit din cantitate. Mai multe alimentări pe zi se adună pe zi.

## Reguli date de Ion (nu se re-deschid)
- **Foile de parcurs rămân TOATE în consum** (29.09: «mașina poate să consume mult») — le poți semnala ca anomalie, nu le scoți din calcul.
- Km-ii se judecă pe km reali GPS, nu pe geometria traseului.
- Km făcuți în afara traseului (camioane) nu se socotesc la motorină și salariu — dar aici n-avem traseul, doar km.
- Verifică pe toată flota, nu pe o mașină (fiecare clasă de greșeală se caută automat pe toate unitățile).
- Probleme cunoscute: LJN080 are km lipsă față de Wialon (−990 km în aug.); fără tracker: LJN075, GHT553; QDQ714 fără drept Wialon.

## Formatul răspunsului (fiecare participant, fiecare rundă)
Română, markdown. Secțiuni: **A. Metoda normei** (metodele comparate, cum le-ai testat — ideal backtest: calibrezi pe o perioadă și
prezici alta —, marja, recomandarea concretă cu formula și pragurile), **B. Anomalii** (tabel: clasă, câte cazuri, litri afectați,
exemple verificabile placa/zi/litri, cum le prinzi automat), **C. Ce se poate face** (acțiuni ordonate după litri/lună economisiți
sau recuperați, cu cât ești de sigur), **D. Ce nu se poate afla din aceste date**. Fiecare cifră trebuie să vină dintr-un calcul pe CSV,
nu din presupunere; spune ce script/calcul ai făcut.
