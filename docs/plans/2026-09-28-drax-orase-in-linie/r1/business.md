# ION-124 r1 — business (logica datelor), Claude

Surse citite: reguli_livrare DRAXELMAIER_BALTI md5 84362bd7a2c6ac7416d92c1d3b06d4dc (35.037 car.); VPS /root/lde-worker/drax/cod/
ideal-v4.3/{etalon,alege,card-gps}.mjs, economie/{etichete,categorii,alternative}.mjs, saptamanal/{patru-reguli,ziua-ideala,scrie-reguli4,scrie-ziua-ideala}.mjs,
date/ideal-v4.3/{capete-gps.json, curse-ideal.json (tinte), nomenclator.json, schelet-ideal.json}. Nimic scris în bază, niciun cod schimbat.

## Unde e aplicată azi excluderea orașelor (fapt, nu presupunere)
1. **Cod, un singur loc:** economie/categorii.mjs:84-109 — `eOras(s)` = ≤ 3 km de o poartă SAU sat cu numele unui OSM city/town la ≤ 3 km
   (places.geojsonseq); folosit DOAR la promovarea tururilor din afara ferestrelor (§5.1, «urcări doar în orașe» → RESPINSE).
2. **Capătul (§4.1) nu are cod de excludere:** etalon.mjs:47 și etichete.mjs:33 iau capătul = `CAPETE_GPS[r|linie] ?? l.start` (act).
   Orașul e exclus pentru că nu e în capete-gps.json. capete-gps.json are deja: `"R19|Bilicenii Vechi": "Sîngerei/Grigorăuca 4/10 … 5/7,
   oraș pe drum — neconcludent"` (criteriul ION-109: ≥ 50 % pe AMBELE sensuri în AMBELE săptămâni).
3. **Marcajul provizoriu:** scrie-reguli4.mjs:27-33 și scrie-ziua-ideala.mjs:18-23 (`ORASE_51`, `orasPeLinie` din r.ang > 0).
4. Verificatorul (/home/verif/verificator/cod) nu are nicio regulă de oraș (grep gol).

## Unde stă orașul față de capăt (schelet-ideal.json v4.3, sateDrum)
- **Dincolo de capăt (km-ii se schimbă):** R19 Bilicenii Vechi (17,3 km × 2 ture; Sîngerei ≈ 8 km mai departe, Ion) și R3 Nihoreni (bucla
  Rîșcani a grupei D, deja în cardul sigilat 44,2).
- **Oraș = capătul din act deja:** R16 Florești (36,5 × 2), R1 Dondușeni (0 angajați). Textul §4.1 «nu fac capăt orașele din §5.1» e
  deja contrazis de schelet.
- **Pe drum, între capăt și poartă (km-ii NU se schimbă):** R19 Copăceni (Sîngerei), R9 Glodeni, R15 Drochia, R17 Mărculești, R21 Biruința,
  R23 Fălești, R31 Ghindești, R8 Rîșcani. Aici schimbarea atinge doar promovarea tururilor (1) și ce e «acasă» în analiza săptămânii.
- Linii «*» construite din oraș: R19 Sîngerei*, R3 Rîșcani*, R9 Glodeni*, R15 Drochia*, R23 Fălești*, R16/R17 Mărculești* (fallback-ul
  mașinii din grafic, fără km).

## Răspunsuri

### 1. Formularea regulii (propunere)
«Orașul din actul RUTEI, cu angajați > 0 (r.ang), e localitate a liniilor acelei rute: oprirea de urcare/coborâre în el e cu oameni (§4.5, §5.1),
iar orașul poate fi capătul liniei după §4.1 (excepția ION-110), cu aceleași dovezi ca satul. Pe alte rute orașul rămâne oraș (nu urcare).»
- **Doar pe rutele unde e în act:** DA. Mărculești sat (R16 «sat. Marculesti», 47,882) e azi prins ca oraș de numele Mărculești (47,869, 1,5 km);
  regula pe act îl scoate din fals pozitiv.
- **«≤ 3 km de porți» (Bălți) rămâne exclus:** DA. Bălți nu e localitate în act; tot ce e acolo e deja zona uzinei (5.4, 5.5, 5.11, 7.4).
  La execuție se listează satele din act aflate la ≤ 3 km de porți (dacă există, rămân sate, ca §4.4).
- **Casa șoferului în oraș:** nu dovedește nimic. Staționarea ≥ 20 min la ≤ 0,5 km de locul nopții (PR.CASA) nu e niciodată urcare (e deja așa
  în categorii.mjs:106), iar plecarea de acasă care doar trece prin centru nu face capătul (§4.1 fraza a doua).
- **Staționarea lungă:** peste 5 min în oraș înaintea turului / după retur = așteptare (precedentul §6.6 Rîșcani), nu urcare. Urcarea =
  30 s – 5 min (Briceni 5.4, deja în promovare), la viteza de §4.5.
- **Partea cu oameni într-un oraș începe la prima urcare, nu la apropierea de centru:** vezi H1/M1.

### 2. Textele de schimbat
§4.1 (ultima frază: «orașele din §5.1» → «orașele care nu sunt în actul rutei»; exemplele R19 după măsurare); §5.1 (fraza «Opririle din orașe nu
sunt sate…» → excepția pentru orașul din actul rutei, cu Bălți ≤ 3 km exclus); §6.6 (Rîșcani «nu face capăt» — rămâne ca fapt măsurat,
nu ca regulă); §1.4 (ideal-v4.4, dacă se reface); §6.3/§6.5 (numărătorile și km/zi uzină); §8.2, §8.7, §8.8 (cifrele săptămânii 14.09 refăcute);
capete-gps.json «dovezi/steaguri» R19.

### 3. Efecte în lanț
| Pas | Ce se schimbă |
|---|---|
| capete-gps.json | criteriul ION-109 re-măsurat cu orașul ca sat (R19 Bilicenii: azi 4/10 și 5/7 → neconcludent) |
| etalon.mjs / etichete.mjs | copie dublă a RUTE+alege; ambele citesc capete-gps.json din instantaneu — trebuie ACELAȘI fișier |
| alege.mjs / card-gps.mjs | R19 Bilicenii km ↑ (~+8/sens); card-gps pică (exit 3) dacă R3/R16/R19 ies din `decizii-v3.json` așteptat |
| categorii.mjs | `eOras` → «oraș care nu e în actul rutei sau ≤ 3 km de porți»; livrarea 830MUM dimineața ~17 → ~2 km, ocolul seara ~41 → câțiva km |
| alternative.mjs | R1a/R1b scad pe cele 18 mașini; «de analizat» Bălți neatins |
| patru-reguli.mjs | regula 1 (X = capatC, X_KM 1,5 / DEJA_KM 2,5); regula 3 = ocolul; regula 2 recalculată pe marginile noi |
| ziua-ideala.mjs | LOC_KM 1,5 față de centrul orașului: drumul prin oraș casă ↔ capăt apare ca «noaptea» |
| scrie-reguli4 / scrie-ziua-ideala | marcajul `orasPeLinie` se scoate după rerulare |
| verificator / registru / poarta | schelet-verificator pe v4.4, registrul re-semnat, poarta.sh (contract F3) |

## Constatări
- **H1 (high) — «urcarea» în oraș e măsurată greșit în ambele sensuri.** Scenariu: 830MUM 14.09 trece prin centru la 9–22 km/h (05:38–05:51).
  Sub §4.5 (< 8 km/h, ≥ 20 s) asta NU e oprire, deci urcările reale nu se văd. Invers, semaforul / intersecția (motivul B9 al excluderii) dă
  opriri de 20–60 s. Dacă doar se scoate excluderea, criteriul ION-109 și promovarea numără semafoarele ca urcări. Remediu: în oraș, urcarea =
  oprire 30 s – 5 min repetată în același punct (≤ 150 m) în ≥ 3 zile ale mașinii; se măsoară întâi pe cele 18 mașini, apoi e regulă.
- **H2 (high) — regula scrisă fără re-măsurare nu mută R19.** Scenariu: se schimbă §4.1/§5.1, lanțul rulează, capete-gps.json rămâne
  (R19 «neconcludent 4/10»). Capătul rămâne Bilicenii Vechi și pagina scrie din nou «acasă (Sîngerei) → Bilicenii Vechi, gol, 17 km».
  Remediu: capete-gps v2, măsurat pe grupă (EZ / D, ca §6.6 R3). Dacă doar o grupă sau doar 830MUM trece prin Sîngerei, cardul = media
  grupelor, nu capătul mutat pentru toată linia.
- **M1 (medium) — orașul e un punct, razele sunt ale satelor.** Capătul = centrul OSM (Sîngerei 47,6361/28,1455). Casa lui 830MUM
  (47,6439/28,1149) e la ≈ 2,45 km: patru-reguli îl dă «doarme deja la X» (≤ 2,5) la 50 m de prag. În ziua ideală, drumul prin oraș
  casă ↔ capăt iese «noaptea». Remediu: «în localitate» = ≤ 3 km de centrul orașului (aceeași rază ca §5.1) pentru capăt atins, casă la capăt
  (ocol 0) și noaptea la capăt.
- **M2 (medium) — deciziile sigilate:** card-gps.mjs:107-110 cere reproducerea `asteptat` (R3 44,2 × 2, R16 FORTAT 518MHD). Orice mutare
  cere `decizii-v3.json` nou prin dezbatere, altfel lanțul se oprește (sigur, dar blocant).
- **M3 (medium) — instantaneul săptămânii (§10.1):** 14.09 rerulat fără instantaneu nou dă cifrele vechi; cu instantaneu nou, 14.09 se schimbă
  retroactiv. Se scrie în rând «refăcut ION-124», vechiul se arhivează.
- **L1 (low) —** etichete.mjs:71-72 cere sl 20–900 s și ≥ 60 s la capăt; etalon.mjs:110-111 nu cere durată. Drift existent, crește cu orașele
  (mai multe opriri scurte).
- **L2 (low) —** textul §4.1 contrazice deja R16 Florești / R1 Dondușeni (capăt = oraș).

## Ordinea de lucru
1. Măsurare, doar citire: urcări în oraș (H1) pe 07/14/21.09, pe grupă, pentru cele 11 rute cu angajați. Rezultat: capete-gps v2 + lista liniilor
   unde se schimbă capătul / cardul.
2. Dezbatere pe cifre → migrația textului §4.1/§5.1/§6.6 + decizii-v3 `asteptat`.
3. ideal-v4.4 (etalon → alege → card-gps) în dosar nou; verificator, registru re-semnat, poarta.
4. categorii `eOras` după act + probă nouă P11: «nicio urcare la ≤ 0,5 km de locul nopții; nicio oprire > 5 min numărată urcare; nicio urcare
   într-un oraș din afara actului».
5. Instantaneu nou pentru 14.09 (și 21.09) → alternative → patru-reguli → ziua-ideala → scrie-* fără marcaj. Tabel înainte/după pe cele 18
   mașini; bilanț §5.9 și P10 pe toată flota.
6. Migrația cifrelor (§1.4, §6.5, §8.2, §8.7, §8.8).

Livrabil întâi, fără să rupă ceva: pasul 1 (măsurare) și P11 în mod «probă». Pasul 4 singur e mic (azi sunt 2 tururi promovate), dar nu
rezolvă cazul lui Ion. Marcajul provizoriu 17561d85 rămâne până la pasul 5.

## Scor
10 − (H1 1 + H2 1 + M1 0,5 + M2 0,5 + M3 0,5 + L1 0,25 + L2 0,25) = **6,0 / 10** pentru direcția din runda-1.md, așa cum e scrisă.
Direcția e corectă. Cu H1 și H2 închise (criteriul de urcare în oraș, măsurat pe grupă), nota trece de 8.
