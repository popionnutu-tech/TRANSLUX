# Verificarea 11 — DRAXELMAIER_BALTI — 27.09.2026 (ideal-v4.2, ION-111 runda 2)

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v11-1790526793` · sursa `/root/lde-worker/drax/date/ideal-v4.2` (GATA al producătorului, schelet-ideal 629b0c1d723e…) · drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · node v20.20.2 · Europe/Chisinau.
Regulile: md5 56dfde040fe3c376618fb75d4507501d, 26.373 caractere, `reguli_livrare_la` 2026-09-27T15:59:07.883497+00:00 (verificat). Față de 62eace0d se schimbă doar §5.3, §7.4, §8.6 și §12.1 — niciunul nu intră în schelet.
**verdict.json sha256 9b0fd4cc476978200fccfe80a7b9ad1033db34eb426c6b9142dbbeaeaba02693** · probe: R1 **ok** · registru **PICATĂ** (registrul e pe bfa070f0 — X2) · INCHIS: **ok**.
Unități: 51 linii din act, 49 cu ideal (+R13 Hasnasenii Noi), 49 mașini, 13.695 observații cu rută (+161), 13.476 deplasări cu rută, 27.644 brute (identice).

## (1) Verdictul
**valid_pentru_export: false** — 4 blocante, toate vechi și toate neexplicate doar pentru că registrul e pe alt sha: C31 R18 Putinești, C31 R27 Iabloana, G1 R18 Zarojeni (28,9 / 30,7), G1 R27 Sturzovca (24,9 / 46,5). **Niciun blocant nou.**
**C31 R13 Hasnasenii Noi a dispărut** (linia are ideal) → intrarea din registru e moartă (X1). Card 5.872 → 5.789 km/zi (GPS completat 6.000 → 5.918).
| linie | card km × ture | km/zi | zile bune GPS | C47 |
|---|---|---|---|---|
| R13 Hasnasenii Noi (nouă) | 9,5 × 1 | 19,0 | 12 | 20/20 (100 %) |
| R14 Dominteni | 34,0 × 3 → **29,9 × 1** | 204 → 59,8 | 54 → 17 | 77/114 (68 %) → 38/39 (97 %) |
| R22 Țiplești | 21,4 × 1 → **21,9 × 2** | 42,8 → 87,6 | 7 → 28 | 20/24 (83 %) → 49/54 (91 %) |
| R13 Lazo | 16,4 → 16,2 × 2 | 65,6 → 64,8 | 22 → 116 | 51/51 → 252/259 (97 %) |
| R33 Iezărenii Vechi | 34,7 → 34,1 × 1 | 69,4 → 68,2 | 13 → 18 | 96 % → 97 % |
Celelalte linii au cardul neschimbat; +161 de observații noi distribuite pe flotă, fără nicio scădere de C47. Constatări noi: G1 «orice poartă» pe R3 Nihoreni (poarta sensului 42,3 / orice poartă 45,8, 8,3 % — steagul E1 există) și D2 izolat câte o zi pe Sturzovca și Căinarii Vechi. Dispărute: C42 pe Dominteni, Țiplești și Sturzovca, C35(e) pe Dominteni.

## (2) Dominteni și Țiplești — schimbarea e reală pe GPS
Atribuirea observațiilor, cheie cu cheie, v4.1 (v10) ↔ v4.2 (v11) — `mutari-raw.txt`:
- **Dominteni → Lazo: 207 observații, toate ale lui 710CWN** (sept 76); 183/207 opresc §4.5 în satele R13 (Lazo 118, Hăsnășenii Noi 108, Dobrogea Veche 79). Pe Dominteni rămâne 826GXP (35 de observații în sept) cu **1 pereche (schimb, mașină)/zi** = actul (1). Pe Lazo, 710CWN face **2 perechi/zi** în sept. E exact clasa H4 din runda precedentă (Dominteni 45 %), acum rezolvată.
- **Țiplești: +56 observații noi** (034BRAT 18, 402VKV 17, 804MUM 11, 397VKV 8), **56/56 cu oprire în satele R22** (Heciul Vechi 55, Alexăndreni 53, Țiplești 48), plus **10 mutate de la R18 Putinești** (397VKV 6, 804MUM 4), 10/10 cu opriri la Heciul Vechi și Alexăndreni — cursele pe care runda precedentă le-a arătat drept serviciu R22 fără oprire la Putinești. Perechi/zi în sept: mediana 2 = actul (2).
- **R18 Putinești** rămâne cu 7 observații, **toate cu oprire la Putinești** (≈ 19 km; 763LYY 4, 146BRAZ, 731ARF), fără nicio pereche → C31 corect, iar acum e curat.
- **R13 Hasnasenii Noi:** km-ul e solid (tururi și retururi 9,4–9,6 km; C47 20/20). Perechile vin însă din două surse diferite:
  - săptămânile s2 — tur s2 (naveta de la poartă de la 13:40) + retur s2 la 00:19 cu oprire la Hăsnășenii Noi: **pereche reală**;
  - săptămânile s1 — tur s1 la 05:15 de la 14 km dincolo de capăt, **fără nicio oprire §4.5 pe partea plină** (7 în sept: 01, 02, 04, 14–17.09) + retur s1 15:53: **jumătate din zilele bune stau pe un tur fără dovadă de urcare** — drumul de acasă care doar trece prin sat (§4.1: «nu fac capăt» / §5.2 livrare).
- Alte mutări mici: Prajila → Heciul Nou 4 (763LYY, 4/4 cu opriri R21); 9 noi pe Dominteni (034BRAT 7, cu opriri la Cubolta, Dominteni, Petreni).

## (3) H4 «capăt prin parcare» pe v4.2 (listă de diagnostic, fără excludere)
Zarojeni 15/29 (52 %, 348KAJ) · Heciul Vechi* 61/130 (47 %, 412BRAY) · Prajila 28/106 (26 %, 763LYY → Gura Căinarului, Zarojeni) · Sturzovca 15/106 (14 %, 727CWN → sate R11). **Au ieșit din listă Dominteni (45 %) și Țiplești (13 %).** 59 de linii < 10 %. Zarojeni ↔ Țiplești (348KAJ, sate R22) și Prajila ↔ R18 rămân de lămurit.

## (4) Ce trebuie la registru (sesiunea)
1. Re-semnarea celor 4 blocante pe `629b0c1d723eae95c4e7ad427ef680df009d76b7e0ecf5a78a65ca012b3d8745`; C31 R18 Putinești cu motivul nou: «7 observații cu oprire la Putinești (≈ 19 km), nicio pereche; cursele 397VKV/804MUM sunt ale R22 Țiplești (v4.2)».
2. Ștergerea C31 R13 Hasnasenii Noi de pe bfa070f0 (moartă); intrarea de pe sha-ul activ se șterge la comutare.
3. Intrările bfa070f0 se păstrează doar dacă v4.1 devine activ înainte de v4.2; altfel se scot la comutarea pe v4.2.
4. Rularea v12 pe aceeași sursă: proba-registru «ok», `valid_pentru_export` true.

## High-uri și scorul
Nicio high nouă. **Medium cu scenariu — R13 Hasnasenii Noi, turul de dimineață s1 fără urcare:** 744ARF vine de acasă la 05:15, trece prin Hăsnășenii Noi fără oprire și ajunge la poartă în fereastra turului s1. *Scenariu:* F2 îl socotește «cu oameni» (9,5 km), nu livrare (R1a), în săptămânile s1: aproximativ −9,5 km/zi livrare la 744ARF, iar ture/zi = 1 se sprijină pe 7 zile din 12 fără dovadă. Garda propusă: tur fără oprire §4.5 la capăt sau pe partea plină = livrare, nu tur.
**Scorul (10 − Σ; medium −0,5 · low −0,25):** HN tur fără urcare −0,5 · registru nere-semnat −0,5 · H4 rămas (Zarojeni, Prajila, Sturzovca, listă) −0,5 · Nihoreni «orice poartă» 8,3 % −0,25 · Lazo: sursa lanțului «toate» (C32: bune sept 2) față de 116 zile bune GPS −0,25 · rămase din runda precedentă (cheia cache-ului, prag §4.1, capete-gps.json în afara intrărilor) −0,75 = −2,75 → **7,25 / 10**. După v12 (registru re-semnat): 7,75; cu garda pe HN: ~8,25.
