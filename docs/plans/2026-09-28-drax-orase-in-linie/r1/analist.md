# ION-124 r1 — uzina-analist: orașele din actul rutei (măsurare)

Sursa regulilor: `lde_uzine.reguli_livrare` DRAXELMAIER_BALTI, `reguli_livrare_la` 2026-09-27 18:22:08 UTC, md5 84362bd7 (am citit §4.1, §4.5, §5.1 prin SQL).
§4.1 are deja excepția ION-110: capătul trece «dincolo de Starting point» doar «în mod regulat … cu opriri reale (§4.5) în ambele sensuri
și la mai multe mașini», iar «nu fac capăt: drumul de acasă al șoferului … și orașele din §5.1». §5.1: urcare = oprire de 30 s – 5 min.

## Ce am măsurat și cu ce (toate doar citire)
- `s5-fereastra.mjs`: obs-ideal.json (fereastra scheletului, opr[] din curse.mjs). Detector grosier (o intrare pe loc OSM, casa inclusă). A arătat unde e orașul față de capăt.
- `s6-urcari-fereastra.mjs` → `s6-fereastra.json` (4.039 de curse, 05–07 + 09) și `s6-sept.json`: urma BRUTĂ din tracker pe fiecare cursă a liniilor cu ideal.
  «Halt» = < 10 km/h, 15 s – 5 min; casa = ≤ 0,4 km de odihna de la începutul turului sau de la sfârșitul returului; zona orașului = cel mai
  apropiat loc OSM (city/town/village, ≤ 3 km) e orașul; partea = înainte sau după cea mai apropiată trecere pe lângă `capatC`.
- `s3b-saptamana.mjs` → `s3b-saptamana.json`: săptămâna 14–20.09 (economie-zile + economie-urme), km ne-«cuOameni» legați de o cursă
  (≤ 60 min, fără oprire > 5 min / acasă la mijloc) cu ≥ 2 opriri scurte distincte în oraș. `s8-cazuri.mjs` și `s11-perm.mjs` = tabelele.
- `s4-urma.mjs`: urma 830MUM 14.09 05:28–06:05 (proba).

## Proba 830MUM 14.09 (urma brută)
Pleacă de acasă 05:30 (47,6438/28,1148), trece prin oraș spre est până la 47,6237/28,1775 (05:43:41, se întoarce), apoi înapoi spre vest
cu opriri de 22–49 s: 05:45:11, 05:46:42, 05:49:20 (49 s, 0 km/h), 05:50:57, 05:52:11, 05:54:31, 05:55:55, 05:56:29; iese din oraș 05:58.
Pragul din §5.1 (30 s) prinde doar 1–2 din ele: în oraș, dimineața, urcările durează 15–50 s. Pragul de 15 s trebuie cerut lui Ion.

## (a)(b)(c) Pe linie — fereastra, urma brută (s6-fereastra.json)
| linie (capăt azi, km) | orașul | unde | halts în oraș pe drum (tur/retur) | «dincolo» ≥ 2 halts (tur/retur), km med, halts med | propunere |
|---|---|---|---|---|---|
| R19 Bilicenii Vechi (17,3) | Sîngerei, 7,8 km de capăt | DINCOLO | 2/0 din 215/179 | 61 (28 %) / 80 (45 %), 9,6 / 9,6 km, 5 / 4 | capăt Sîngerei-est (47,6325/28,1644), **+9,6 km pe sens** → ≈ 27 km; întrebare 1 |
| R3 Nihoreni (44,2) | Rîșcani, 1,7 km | PE DRUM (sateDrum Nihoreni > Rîșcani > Recea) | 141/140 din 213/220 | 9 (4 %) / 25 (11 %), 4,1 km | fără schimbare; bucla de după capăt = steag |
| R16 Florești (36,5) | Florești = capătul | capătul e orașul | 106/101 | 42 (34 %) / 65 (50 %), 1,0 / 2,5 km, 2 | capătul în oraș la 47,8922/28,2859 (+1 / +2,5 km) sau neschimbat |
| R16 Vărvăreuca (42,8) | Florești, 1,8 km | PE DRUM | 171/119 | 8 % / 4 % | fără schimbare |
| R19 Copăceni (32,8) | Sîngerei, 7,3 km | PE DRUM | 87/102 | 11 % / 13 %, 2 halts (casa / zgomot) | fără schimbare |
| R9 Cobani (55,5) | Glodeni, 13,5 km | PE DRUM | 103/109 | 7 % / 4 % (397VKV) | fără schimbare |
| R23 Scumpia (59,5) | Fălești | PE DRUM | 139/139 | 1 % | fără schimbare |
| R21 Heciul Nou (20,7) | Biruința | PE DRUM | 60/57 (+ casa 715IZX 138/142) | 1 % | fără schimbare |
| R15 Șuri (70) | Drochia | PE DRUM | 117/139 | 0–1 % | fără schimbare |
| R31 Cotiujenii Mari (65,1) | Ghindești | PE DRUM | 43/45 | 0 | fără schimbare |
| R17 Prajila (41,3) | Mărculești | PE DRUM | 224/226 | 1 % | fără schimbare |
| R8 Costești (78,5) | Costești = capătul | capătul e orașul | 68/71 | 6–8 %, 0,4–1,1 km | fără schimbare |
| R1 Dondușeni (91,9) | Dondușeni = capătul, 0 angajați în act | capătul e orașul | 58/67 | 61 % / 52 %, 4 / 2,9 km, 3 halts (346KAJ) | în afara regulii (0 angajați); întrebare 4 |
Liniile «*» fără ideal (R19 Sîngerei*, R9 Glodeni*, R23 Fălești* …) au 1–72 de curse și nu intră în tabel.

Pe mașină, R19 Bilicenii Vechi (dincolo/total): 830MUM 54/112 tur, 54/108 retur; 435ASB 1/28 tur, 14/21 retur; 397VKV 4/13, 8/13;
390ASB 2/6, 3/5; **744ARF 0/23, 0/23; 412BRAY 0/19; 297LVY 0/7**. Când linia o face o mașină fără casă în Sîngerei, dimineața nu urcă nimeni în Sîngerei.
R3 Nihoreni: 345KAJ (mașina liniei) 3/127 tur, 11/127 retur; 186OMM 3/29, 13/36.

Controlul pragului: pe liniile cu orașul PE DRUM, «dincolo ≥ 2 halts» apare în 1–13 % din curse, cu mediana 2 halts (casa, semafor, cumpărături);
pe R19 Bilicenii mediana e 4–5. Prag propus: **≥ 3 halts distincte** și orașul geometric dincolo de capăt.

## (d) Săptămâna 14–20.09 (s3b-saptamana.json) — km care sunt drumul cu urcări / coborâri prin oraș
- 830MUM: **89,1 km** pe R19 Bilicenii (tur 4 zile: 41,4 km din «livrare de la locul nopții», 3–6 urcări 05:38–06:02; retur 4 zile:
  47,7 km din «acasă» 13,5 + «legătură» 34,1, 3–5 coborâri 16:10–16:42). Plus 8,1 km pe Copăceni tur 14.09 (2 halts, oraș pe drum → zgomot, NU).
- 186OMM: 32,3 km (legătură 28,6, parc 3,7) — R3 Nihoreni tur s2 16–18.09, 4–5 halts în Rîșcani 13:25–14:06, apoi Nihoreni și înapoi prin Rîșcani (buclă). Întrebare 2.
- 518MHD: 5,8 km (Florești, în oraș, 2–3 halts). 725CWN: 9 km Copăceni retur (2 halts, zgomot) + 14,5 km sâmbătă 19.09 după R33 Bilicenii* retur,
  9 coborâri în Sîngerei — R33 n-are Sîngerei în act (Iezarenii Vechi 7, Bilicenii Vechi 7). Întrebare 3.
- Celelalte 13 mașini: 0 km mutați; orașul lor e pe drum (446ASB Fălești 54/32 halts în cursă, 402VKV Glodeni 37/36, 388ASB Drochia 22/18,
  457BRAX Rîșcani 11/15, 713IZX Mărculești 13/17, 293QVT Ghindești 10/8, 715IZX Biruința 7/7) — deja «cu oameni» azi.
- Sigur: **≈ 95 km/săpt.** (830MUM 89 + 518MHD 6); condiționat: +32 (186OMM) +14,5 (725CWN).

Efectul pe economie (estimare, lanțul NU e rerulat): 830MUM în ziua-ideala.json: 40,5 km/zi (3 zile măsurate: noapte 36,1, acasă 89,
drum mai scurt −3,7), reguli4 R4 46,4. Mutând 89 km/5 zile în «cu oameni», economia lui scade cu ≈ 18 km/zi, la ≈ 22 km/zi; «noaptea»
aproape dispare (doarme în orașul-capăt), rămân ~5–6 km acasă → primul punct din est și ocolul prin casă de la prânz (36,3 vs 32,3 km).
186OMM: 26,9 → ≈ 20 km/zi dacă bucla prin Rîșcani e acceptată. Restul flotei: neschimbat.

## (e) Cum deosebesc urcarea de casă și de așteptare
1. Casa: halts la ≤ 0,4 km de odihna ≥ 25 min dinaintea turului / de după retur (locul nopții) — scoase (R19: «doar casa» 86 tur, 55 retur).
2. Așteptarea: halt > 5 min — scoasă (R16 Florești: 59 tururi cu așteptare în oraș la 518MHD).
3. Urcarea: ≥ 3 halts 15 s – 5 min în puncte distincte (≥ 150 m), pe drumul continuu legat de cursă (≤ 60 min, fără casă / oprire > 5 min între ele).
4. Geometria: orașul pe drum între capăt și poartă e deja în km; halts «dincolo» pe astfel de linii = casa / zgomot, nu urcări.
5. Semnătura 830MUM: dus-întors prin oraș (merge până la capătul estic fără opriri, se întoarce cu opriri) — urcări, nu drum spre casă.

## Propuneri pe întrebările 1–4 (nu decid; pentru Ion)
1. Regula: da, orașul din actul RUTEI cu angajați > 0 e localitate a liniei, dar urcarea în oraș = ≥ 3 halts 15 s – 5 min (NU 30 s), casa și așteptarea
   scoase; Bălți (≤ 3 km de porți) rămâne exclus; doar pe rutele unde orașul e în act (R33 → întrebare).
2. Scheletul: se schimbă DOAR R19|Bilicenii Vechi (capăt Sîngerei-est, +9,6 km/sens) și, la alegere, R16|Florești (+1–2,5 km în oraș).
   Dar criteriul §4.1 «la mai multe mașini» e îndeplinit la retur (830MUM, 435ASB, 397VKV) și la tur doar de 830MUM; 744ARF și 412BRAY nu merg în Sîngerei.
   Întrebarea pentru Ion: capătul Sîngerei e fix pe linie, sau linia Bilicenii are oameni din Sîngerei doar cu mașina care doarme acolo (zi cu zi)?
3. Analiza săptămânii: per zi, independent de schelet — bucata legată de cursă cu ≥ 3 urcări în orașul de dincolo de capăt = «cu oameni»
   (tur: de la prima urcare; retur: până la ultima coborâre), cu steag. 14–20.09: ≈ 95 km sigur.
4. Ordinea: (a) textul §4.1/§4.5/§5.1 prin `replace` (migrație, pas-poartă); (b) analiza per zi în categorii (nu atinge scheletul) + probele pe
   830MUM 14.09/15.09 și pe controlul liniilor «pe drum»; (c) după răspunsul lui Ion: schelet v4.4 doar R19 Bilicenii (+ R16), verificator, registru, poarta;
   (d) rerularea lanțului: analiză → 3 reguli → ziua ideală; scoaterea marcajului provizoriu de pe 17 din cele 18 mașini (pe drum = fără efect).

## Întrebări pentru Ion
1. R19 Bilicenii Vechi: în fereastră 830MUM ia oameni din Sîngerei în jumătate din curse (54/112 tur, 54/108 retur, 4–5 opriri, +9,6 km),
   744ARF (0/46) și 412BRAY (0/20) niciodată. Linia pornește din Sîngerei mereu (capăt fix, +9,6 km pe sens) sau doar în zilele cu urcări?
2. R3 Nihoreni: 186OMM la tur s2 (16–18.09) oprește de 4–5 ori în Rîșcani 13:25–14:06, merge la Nihoreni și se întoarce prin Rîșcani
   (9,5–11,4 km). E strâns de oameni (cu oameni) sau drum gol? (345KAJ, mașina liniei: 3/127 tururi așa.)
3. 725CWN sâmbătă 19.09 după R33 Bilicenii* retur: 9 coborâri în Sîngerei (14,5 km); R33 n-are Sîngerei în act. Se numără?
4. R1 Dondușeni: actul are 0 angajați în Dondușeni, dar 346KAJ oprește de 3 ori în oraș în 61 % din tururi (4 km). Oraș cu oameni sau nu?
5. Urcarea în oraș durează 15–50 s (830MUM 14.09: 8 opriri, doar 2 ≥ 30 s). Pragul pentru orașe devine 15 s cu ≥ 3 opriri?

Scor propriu: 10 − 2,5 = 7,5 (−1: efectul pe economie estimat, lanțul nerulat; −0,5: pragul de 15 s verificat doar prin controlul liniilor «pe drum»;
−0,5: casa = locul odihnei, nu casa din analiza.json; −0,5: liniile «*» fără ideal nu sunt măsurate).
