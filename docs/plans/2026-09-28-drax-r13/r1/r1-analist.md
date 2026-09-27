# ION-111, runda 1 — uzina-analist («cercetează»): liniile fără km (R13 întâi; R18, R27)

Autor: uzina-analist, 27.09.2026. Nu am scris în bază și n-am schimbat nimic pe VPS.

Surse:
- VPS `/root/lde-worker/drax/date/ideal-v4.1/`: `curse-ideal.json` (27.644 de mișcări brute, 04.05–26.09, cu satele atinse `apr` și
  opririle `opr`), `obs-ideal.json`, `etalon-ideal.json`, `schelet-ideal.json`, `card-gps-raport.txt`;
- codul `drax/cod/ideal-v4.1/etalon.mjs` și `drax/cod/economie/etichete.mjs`;
- rândul săptămânii 14.09 (`saptamanal/2026-09-14/economie.json`, rerulat la 16:11 UTC);
- regulile: textul după migrația 413 (Drăxlmaier §1.4, §5.1, §6.1–6.7) și `lde_uzine.reguli_livrare` LEAR / SEBN / Trox, citite
  în runda 1 a ION-110.

Scripturile sunt în `scratchpad/p111/`, cu ieșirile lor:
- `r13.mjs <R13|R18|R27>`: cine atinge satele și cu ce opriri. Ieșiri `r13-out.txt` și `r18r27-out.txt`.
- `a744.mjs`: zi cu zi, 744ARF prin Hăsnășenii Noi față de ce a intrat în obs. Ieșire `a744-out.txt`.
- `fara-e.mjs`: zilele excluse pentru «linie fără etalon». Ieșire `fara-out.txt`.
- `et13.mjs`: R13 și R14 în etalon și în card. Ieșire `et13-out.txt`.

---

## (a) Cine deservește satele R13 — Lazo, Hăsnășenii Noi, Dobrogea Veche — pe toată fereastra

Numai mișcările care OPRESC (≤ 0,8 km) într-un sat R13. Direcția e dată de poartă, fereastra de §3.2.

| mașină | direcția · fereastra | zile (din care sept.) | ora (mediană) | opriri | eticheta în obs | plin |
|---|---|---|---|---|---|---|
| **710CWN** | tur s1 → poartă | 57 (20) | 06:07 | Lazo 53, Hăsnășenii Noi 38, Dobrogea Veche 20 | **R14\|Dominteni** tur s1 | 33,7 |
| 710CWN | tur s2 → poartă | 56 (19) | 14:37 | Lazo 53, Dobrogea 34, Hăsnășenii 31 | R14\|Dominteni tur s2 | 33,5 |
| 710CWN | retur s1 ← poartă | 60 (20) | 15:54 | Lazo 50, Hăsnășenii 30, Dobrogea 16 | R14\|Dominteni retur s1 | 33,4 |
| 710CWN | retur s2 ← poartă | 56 (19) | 00:18 | Lazo 54, Hăsnășenii 27, Dobrogea 15 | R14\|Dominteni retur s2 | 33,6 |
| **744ARF** | tur s1: de acasă → Hăsnășenii Noi → poartă | 24 (9) | 06:04 | Hăsnășenii Noi 24 | **fără obs ×23** | 8,9 (calculat din `apr`) |
| 744ARF | poartă → Hăsnășenii → poartă, prânz (pleacă 13:3x, sosește 14:3x) | 30 (7) | 13:43 | Hăsnășenii 30, Dobrogea 10 | R13\|Hasnasenii Noi: «retur –» (prânz) și «tur s2» | 8,8–10,6 |
| 744ARF | retur s1: poartă 15:54 → Hăsnășenii → acasă / poartă | 13 (7) | 15:54 | Hăsnășenii 13 | fără obs ×12 | 8,8 |
| 744ARF | retur s2: poartă 00:2x → Hăsnășenii → acasă | 19 (4) | 00:20 | Hăsnășenii 19 | **fără obs ×19** | 8,8 |
| **043BRAU** | tur s1 / tur s2 / retur s1 / retur s2 | 14 / 13 / 11 / 13 (**0 în sept.**) | 06:09 / 14:41 / 15:54 / 00:19 | Lazo, Hăsnășenii, Dobrogea | **R13\|Lazo** | 15,8 |
| 727CWN | tur și retur, s1 și s2 | 3–4 pe sens (sept.: 2 + 4) | — | Hăsnășenii 1–4 | R27\|Sturzovca | 40,7 |
| 293QVT, 346KAJ, 549RNK, 348KAJ, 146BRAZ, 351KAJ | câte 1–2 curse | — | — | — | R13 / R27 | — |

Ce se vede:
1. **710CWN și 043BRAU merg pe ACELAȘI drum**, cu aceleași sate în aceeași ordine: Petreni → Hăsnășenii Mari → Moara de Piatră →
   Lazo → Hăsnășenii Noi → Dobrogea Veche → poartă.
   - La 043BRAU (în graficul R13) cursa e tăiată la Lazo și devine **R13\|Lazo** (plin 15,8).
   - La 710CWN aceeași cursă devine **R14\|Dominteni** (plin 33,5).
   - 043BRAU n-a mai făcut-o după 08.06, iar 710CWN o face pe toate cele patru picioare, în fiecare zi, inclusiv în septembrie.
   - Deci satele R13 \| Lazo sunt deservite zilnic, comasat în cursa R14 a lui 710CWN.
2. **744ARF face linia R13 \| Hăsnășenii Noi** (o ramură: Dobrogea Veche → Hăsnășenii Noi și înapoi), în perechi pe ACELAȘI schimb:
   - **s1**: tur 05:1x → 06:04 (de acasă, Dacia, prin Hăsnășenii Noi, la poarta EST) și retur 15:54. **24 de zile** din fereastră au
     amândouă cursele pe GPS brut; în septembrie 8 (1, 2, 4, 14–18.09). Plin: tur 8,9 km, retur 8,8 km (1 %).
   - **s2**: turul e bucla de prânz (sosire 14:3x, în fereastra tur s2), returul pleacă de la poartă la 00:19–00:25. Așa în mai și în
     21–25.09, pe rotația cealaltă.
3. **De ce în obs apare «tur s2 + retur s1», adică perechi încrucișate:** turul s1 și returul s2 lipsesc din obs.
   - Toate cele 24 de tururi s1 de la 05:1x pornesc de acasă, iar 19 retururi s2 și 12 retururi s1 se termină acasă (`a744-out.txt`).
   - Filtrul de la **`etalon.mjs:104`** le aruncă: `if (!grafic && !(c.dinP && c.spreP) && gol > plin) continue;`. Mișcarea are 23,4 km,
     din care plin 8,9 și gol 14,5, iar 744ARF nu e în graficul R13.
   - Rămân doar buclele poartă → poartă. Tururile din buclă sosesc la 14:3x (s2), retururile din buclă pleacă la 15:54 (s1).
     De aici «nicio candidată».
4. **Analiza săptămânală are deja filtrul relaxat**, iar scheletul nu.
   - La `etichete.mjs:73` (ION-109, Ion 27.09: «dacă au opriri și rutele sunt în schelet»), mașina din afara graficului nu mai e tranzit
     dacă are ≥ 2 opriri în satele rutei sau oprește la capăt:
     `… && oprRuta.length < 2 && !laCapatulLiniei) continue;`
   - Efectul pe săptămâna 14.09, după rerulare: 744ARF are cursele etichetate R13 \| Hasnasenii Noi în 5 zile, iar toate 5 ies din
     măsurare «linie fără etalon (R13|Hasnasenii Noi)» (`fara-out.txt`).
   - Cauza e divergența dintre cele două filtre, nu lipsa curselor.

---

## (b) Cum au rezolvat celelalte uzine (textul `reguli_livrare` și codul)

| situația | precedent (citat) | se transpune? |
|---|---|---|
| zi bună de etalon | LEAR Ungheni §6.1: «O zi intră în etalon doar dacă are ȘI tur, ȘI retur, și amândouă ajung până la capăt»; §6.2: «MEDIANA zilelor rămase, tur și retur la un loc»; Florești §6.1: «cu tur ȘI retur până la capăt … turul egal cu returul (≤ 18 %)»; SEBN §6.1 la fel | La LEAR, Florești și SEBN, perechea e pe ZI, nu pe schimb. La Drăxlmaier, §5.1 definește PERECHEA pe schimb (pentru R3). La R13 nu e nevoie de pereche pe zi: perechile pe schimb există (a) |
| cursa dus-întors poartă → capăt → poartă | SEBN §3.3: «poartă ambele sensuri: returul se termină la prima apropiere de capăt, turul începe la ultima» | DA, e deja în cod (`rt`, `c.dinP && c.spreP`). Buclele 744ARF de la 13:3x și 15:54 sunt exact acest caz |
| schimbul fără start propriu | SEBN §4.4: «schimbul care n-are start propriu … ia startul celorlalte schimburi ale rutei» (ION-56) | DA, ca argument că etalonul e al LINIEI (Drăxlmaier §6.1 o spune deja) |
| linie făcută de mașina altei linii | LEAR Ungheni §4.7: «Comasare: A4 se face împreună cu A3, A7 împreună cu A6. Rută fără mașină proprie ≠ rută nefăcută» | **DA pentru R13\|Lazo** (în R14\|Dominteni, la 710CWN), **R18\|Putinești** (în R32 / R17 / R22) și **R27\|Iabloana** (în R27\|Danu) |
| sate din act fără oprire / puncte care nu-s în act | Florești §4.3: «Sate din act fără opriri … Nu-s capete și nu se numără»; §4.4: puncte de încărcare regulate care nu-s în act «sunt muncă a rutei» | DA: Putinești și Iabloana nu sunt porniri de cursă, sunt opriri pe drumul altor linii |
| predarea la poartă (două roluri) | LEAR §3.4, Briceni §3.3 | NU e cazul aici |
| ce e o cursă pentru mașina din afara graficului | Drăxlmaier `etichete.mjs:73` (ION-109, citatul lui Ion) | **DA, în etalon** — vezi V5 |

Precedentele LEAR, Florești și SEBN taie cursa pe urmă și nu condiționează cursa de grafic: LEAR §1.1 «Graficul … NU se folosește»;
SEBN §1.1 «Cine lucrează și pe ce rută se vede din urma GPS». Filtrul «fără grafic și gol > plin» de la `etalon.mjs:104` e singurul loc
din lanț care încă cere graficul ca dovadă.

---

## (c) R18 Putinești și R27 Iabloana, pe scurt

**R18 \| Putinești** (`r18r27-out.txt`):
- Nicio mișcare nu PORNEȘTE din Putinești. Satul e o oprire pe drumul altor linii:
  - 146BRAZ, pe R32 Trifănești, oprește la Putinești pe toate patru picioarele, 9–11 zile fiecare, aproape toate în septembrie;
  - 763LYY, pe R17 Prajila (în mai), oprește acolo 19–23 de zile pe fiecare picior;
  - 412BRAY, pe R22 Țipletești\*, 4–5 zile pe picior;
  - 348KAJ, pe R18 \| Zarojeni, trece prin Putinești aproape fără să oprească.
- Cardul are deja nota v3: «146BRAZ face și R18 în aceeași cursă (Gura Căinarului, Putinești)».
- Linia R18 \| Putinești nu are cursă proprie. Precedentul e LEAR §4.7: comasare, fără km proprii.
- Eticheta R18 \| Putinești a lui 804MUM din săptămâna 14.09 e probabil R22 Țiplești:
  - drumul lui trece prin Biruința, Alexăndreni, Țipletești, Țiplești și Heciul Vechi;
  - Putinești e la ~1,5 km de Țiplești, iar capătul se socotește atins până la 2,5 km (`R_CAPAT_CURSA`).

**R27 \| Iabloana**:
- Satul e o oprire pe R27 \| Danu: 441ASB oprește la Iabloana în 11–16 zile pe fiecare picior, 447ASB în 5 zile pe s2, în septembrie.
- Nicio mișcare nu pornește din Iabloana. Doar 2 observații sunt etichetate «R27 \| Iabloana».
- Nicio zi-mașină nu iese din măsurare din cauza ei (`fara-out.txt`: 0).
- Precedentul e același: LEAR §4.7.

---

## Pozițiile

- **V1 (pereche «încrucișată», aceeași zi, schimburi diferite): NU.**
  - Premisa «perechea pe același schimb nu există niciodată» e falsă. Pe GPS brut sunt 24 de zile cu pereche s1: tur 06:04 (8,9 km)
    și retur 15:54 (8,8 km), din care 8 în septembrie. Există și perechi s2: bucla de prânz, apoi returul de la 00:2x.
  - Încrucișarea din obs e un efect al filtrului `etalon.mjs:104`.
  - V1 ar schimba definiția PERECHII din §5.1, pe care se sprijină R3 (intervalul dintre tur și retur) și §6.5 (ture pe zi). Precedentul
    LEAR/Florești «zi bună pe zi» ar justifica V1, dar nu e nevoie de el.
- **V2 (etalon doar din tururi): NU.** Retururile există: s1 în 13 zile, s2 în 19, plus buclele. Se pierd la același filtru.
- **V3 (reatribuirea curselor 710CWN / 043BRAU): NU ca reatribuire, DA ca notă de comasare** (LEAR §4.7).
  - Cursa lui 710CWN e o singură cursă cu oameni, prin satele R14 și R13 \| Lazo. Tăiată în două, ar dubla poarta sau ar rupe perechea.
  - Pe card, R13 \| Lazo are 16,4 km × 2 ture = 65,6 km/zi, măsurați doar pe 043BRAU în mai–iunie (sursa «toate», septembrie 0 candidate).
    În septembrie același drum e numărat în R14 \| Dominteni la 710CWN. Întrebare pentru Ion: mai merge R13 \| Lazo separat?
- **V4 (linia rămâne fără km, ziua se măsoară pe R1a / R1b, fără R3 pe acea linie): DA, dar ca rezervă, nu ca soluție pentru R13.**
  - Pentru R18 și R27 nu e nevoie: n-au curse proprii.
  - La o linie reală fără km (dacă mai apare), ziua nu trebuie să iasă întreagă: R1a și R1b nu depind de etalon. R3 pe linia fără etalon
    iese (§8.3 cere lungimea liniei).
  - Cere o frază în §8.6 (migrație).
- **V5 (nouă): DA — același filtru în schelet ca în analiza săptămânală.**
  - La `etalon.mjs:104`, cursa mașinii din afara graficului se păstrează când are ≥ 2 opriri de urcare în satele rutei sau oprește
    la capăt — ca la `etichete.mjs:73`, după citatul lui Ion.
  - Estimarea pe GPS brut: R13 \| Hasnasenii Noi primește ≥ 8 perechi s1 în septembrie (§6.3: sursa septembrie). Etalonul ~8,9 km,
    1 tură/zi, cu tur = retur la 1 %.
  - 744ARF intră în măsurare în săptămâna 14.09 (5 zile).
  - Condiții, obligatorii înainte de verdict:
    1. `curse-ideal.json` n-are durata opririi (`opr` = {n, km, lat, lon}, fără `sl`), deci regula de la `etichete.mjs:73` nu se poate
       copia ca atare. Trebuie `sl` în `curse.mjs`, sau regula pe numărul opririlor.
    2. Filtrul e global: rerulare pe TOATE cele 48 de linii, cu verificatorul (C31, C47, card-gps ±0,1) și diff pe fiecare linie. Sau
       relaxarea doar pe liniile `faraIdeal`, cu steag.
    3. Textul §1.4 se schimbă prin `replace`:
       - R13 \| Hasnasenii Noi are curse (744ARF);
       - R13 \| Lazo, R18 \| Putinești și R27 \| Iabloana sunt deservite comasat.

---

## Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică): documentul pune cauza «nicio pereche pe același schimb» și propune V1 / V2, dar cauza e filtrul de la `etalon.mjs:104`.**
- Scenariu:
  - Se implementează V1. R13 primește etalon din perechi (tur s2 la prânz + retur s1 la 15:54), iar §6.5 numără ture/zi pe (schimb, mașină)
    greșit.
  - Regula «pereche pe zi», aplicată tuturor liniilor, strică R3: intervalul dintre turul s1 și returul s2 devine «gol între ture» de
    ~18 h, pe fiecare mașină cu două linii.
  - Între timp, adevărata divergență dintre schelet (`etalon.mjs:104`) și analiza săptămânală (`etichete.mjs:73`) rămâne. Orice altă
    mașină din afara graficului care pleacă de acasă spre o linie scurtă pierde tururile în schelet, dar le are în analiză, cu ziua
    exclusă «linie fără etalon».
- Dovada:
  - `a744-out.txt`: 24 de zile cu tur 05:1x → 06:0x (plin 8,9) și retur 15:54 (plin 8,8). Turul de dimineață lipsește din obs în toate
    cele 24; `obs-ideal` are doar buclele.
  - `etalon.mjs:104` față de `etichete.mjs:73`.
  - `fara-out.txt`: 744ARF ×5 «linie fără etalon (R13|Hasnasenii Noi)».
- Corecția: V5 cu condițiile 1–3.

**M1 — medium, −1,0 (gol de acoperire): V5 schimbă filtrul pentru toate liniile, iar datele scheletului n-au durata opririlor.**
- Fără `sl` în `curse-ideal.json`, «≥ 2 opriri de urcare» se reduce la «≥ 2 opriri oricât de lungi».
- Fără rerularea verificatorului pe toate liniile, efectul pe cele 48 de linii e nemăsurat.
- Corecția: condițiile 1–2 de la V5.

**M2 — medium, −1,0 (date de verificat): R13 \| Lazo pe card (65,6 km/zi) vine din mai–iunie (043BRAU, 15 zile).**
- În septembrie, drumul Lazo → Hăsnășenii Noi → Dobrogea Veche → poartă e făcut zilnic de 710CWN, în cursa R14 \| Dominteni: 34,0 km,
  3 ture/zi pe linie.
- Același drum pare numărat de două ori pe card.
- Corecția: întrebare pentru Ion, apoi, după răspuns, comasare (LEAR §4.7) sau păstrare cu steag.

**L1 — low, −0,5:** eticheta R18 \| Putinești a lui 804MUM, pe 14.09, e probabil R22 Țiplești (Putinești la ~1,5 km de Țiplești, raza de
capăt 2,5 km). V4 nu trebuie să decidă nimic pe ea.

**L2 — low, −0,5:** textul §1.4 («n-au nicio cursă care să pornească din startul lor») e fals pentru R13 \| Hasnasenii Noi. Planul nu
prevede `replace` pe el.

**Scor: 10 − 2,0 − 1,0 − 1,0 − 0,5 − 0,5 = 5,0. Blocante (high): 1 (H1).**

## Întrebări pentru Ion
1. 744ARF face în fiecare zi Hăsnășenii Noi: pe schimbul 1, la 06:04 la poartă și la 15:54 înapoi; pe rotația cealaltă, bucla de la
   13:40 și returul de la 00:20. E linia R13 Hăsnășenii Noi, cu un autobuz?
2. R13 Lazo: în mai–iunie o făcea 043BRAU (2 ture/zi). Din iunie, Lazo, Hăsnășenii Noi și Dobrogea Veche sunt în cursa 710CWN pe Dominteni
   (4 curse/zi, cu opriri la Lazo). R13 Lazo se mai numără separat sau e comasată în Dominteni?
3. Putinești (R18) și Iabloana (R27) nu au curse care să pornească de acolo; sunt opriri pe liniile Trifănești / Prajila / Țipletești,
   respectiv Danu. Se trec ca «deservite comasat», fără km proprii?
