# Ideal-v3 Drăxlmaier (ION-97): poziția Claude în dezbatere (27.09.2026)

Partea: business-logic-auditor (Claude). Am lucrat doar pe citire: `date/ideal-v3` pe VPS (sondele mele `/tmp/dezb-probe1.mjs` și `/tmp/dezb-probe3.mjs`,
ieșirile în scratchpad `v3/dezb-probe{1,2,3}.out`) și Supabase (`lde_atribuiri_zilnice`, `lde_factory_routes`, `vehicles`, 25.08–26.09).
km/zi = 2 × card × ture/zi. Δ-urile sunt față de v2 (5.765,6).

**Faptele noi care schimbă propunerile** (verificate de mine, nu apar în `intrebari-v3.md`):

- **F1. 518MHD e autobuzul R16, iar cursa lui e una singură.** În grafic are R16 (Florești → Vărvăreuca → Mărculești) pe s1 și s2 în fiecare zi lucrătoare
  01–22.09 (36 de înregistrări) și nicio zi pe R32. În GPS, fiecare picior lung trece prin satele R32 (Izvoare, Bezeni, Frumușica, Alexandrovca, Trifănești,
  Sevirova, Ivanovca) **și** prin Mărculești–Florești(–Vărvăreuca). În septembrie singura mașină pe R16|Florești e 518MHD: 6 picioare «drum direct»,
  plin 35,0–35,3. R16|Vărvăreuca are autobuzul ei, 350KAJ (116 picioare, ambele schimburi). R16|Florești (35,7 × 1 = 71,4) și o linie separată
  «518MHD 52,9 × 2» ar număra de două ori **aceeași mașină**. Bilanțul agentului (+203,2) nu scade cei 71,4, deși textul spune că «nu se mai adună».
- **F2. 146BRAZ e comasat R32 + R18.** În grafic are R18 și R32 în aceeași zi, în slotul 2, zilnic. Piciorul EZ trece prin Gura Căinarului și Putinești
  (satele R18) și prin Tipletești–Alexandreni (satele R22). Varianta D e doar R32 + Mărășești.
- **F3. «Drumul scurt de 38,6 fără Rîșcani» al lui 186OMM nu există.** Sunt picioare `rt`: `km` total 88–93, `plin` 38, iar lista satelor conține
  Rîșcani și Nihoreni. E un artefact de tăiere, nu un drum. Întrebarea 6b trebuie scoasă.
- **F4. Cele două drumuri de pe Nihoreni ating aceleași sate.** 186OMM (D) face bucla Corlăteni → Recea → Nihoreni → Rîșcani → poarta EST: plin 52, km total 88.
  345KAJ (EZ) pleacă gol până la Pîrjota și apoi încarcă Rîșcani → Nihoreni → Recea → Corlăteni: plin 40, km total 60, și atinge un sat **în plus** (Pîrjota).
  Grupa D nu are niciun sat în plus care să explice cei +10 km.
- **F5. Pe Mihăileni, din 14.09, lucrează 345KAJ, dar etalonul îl pune pe R3|Recea\*.** În grafic are R6 în slotul 1 pe 14–22.09 (7 zile). În GPS, 18 picioare
  trec prin Mihăileni și Ochiul Alb, VEST/EST, km total 87–89. Capătul R3|Recea\* e la Recea, de aceea plin iese 24–26. Linia e informativă, deci km/zi
  nu se dublează. Observațiile R6 se opresc însă pe 14.09. 917FTI nu mai apare deloc în GPS după 14.09. **Răspunsul la întrebarea 7 iese deci din date.**
- **F6. Bilicenii Vechi e sat din actul R19** (Copăceni → Grigoreuca → Sîngerei → Bilicenii Vechi), nu din R36 (Bocancea Schit → Coșcodeni → Bobletici).
  R19 are autobuzele lui, 830MUM și 744ARF, care fac returul s2. Drumul lung al lui 224BZP e o comasare cu R19. Același 224BZP face Catranic pe un schimb
  și Bocancea pe celălalt.
- **F7. Graficul de după 22.09 e copie automată.** 917FTI apare pe R6 pe 23–26.09, deși lipsește din GPS din 14.09. 518MHD și 146BRAZ lipsesc cu totul.
  Graficul nu se folosește ca probă după 22.09.

**Regula pe care o aplic la fel pe toate liniile.** Cardul e mediana pe zile-pereche bune (metoda comună), cu un `scoate` definit (variantă, mașină sau zi).
Picioarele scoase trebuie să fie dovedite **și** de sate, **și** de grafic ca serviciu al altei rute. Când linia are două drumuri recurente care ating
aceleași sate din act, idealul e cel mai scurt, iar diferența trece la exces. Drumul lung se păstrează ca atare, cu steag, doar când atinge sate
dintr-un alt act și nu se poate dovedi că altă mașină le servește la aceeași oră.

---

## 1. R18 Zarojeni: acord parțial

- **Cardul 30,0** (septembrie, fără cele 4 picioare comasate), 2 ture/zi, **120,0 km/zi (+4,4)**. Agentul propune 29,9.
- **Steagul:** «diagnostic cerut» se înlocuiește cu «decizie». `scoate` = picioarele din zilele în care graficul dă mașinii altă rută și piciorul
  atinge satele acelei rute.
- **Argumentul.** Am verificat în `lde_atribuiri_zilnice` că toate cele 4 comasări au altă rută în grafic pentru 348KAJ: 17.09 R32, 18.09 R14
  (Moara de Piatră–Cubolta), 19.09 R21 (Heciul Nou, pe s1 și pe s2). În septembrie sunt 9 zile bune, deci regula din `alege.mjs:56-58` alege
  septembrie, nu toată fereastra. Cu 29,9 am folosi regula de rezervă pe o linie care nu o cere, adică exact opusul cazului Catranic. Între 29,9 și 30,0
  sunt 0,4 km/zi; contează metoda, nu cifra.
- **Ce s-ar strica altfel.** Cu 30,7, cardul ar conține Cubolta și Heciul Nou, iar comasarea ar dispărea din analiza săptămânală ca exces.
  Cu «toate», decizia ar crea un precedent: rezerva ar putea fi aleasă după gust.
- **Încredere:** medie (5 zile D + 1 zi EZ după scoatere).
- **Notă pentru Ion:** din F2 reiese că 146BRAZ ia și el Gura Căinarului–Putinești pe EZ, deci R18 are două autobuze pe EZ. Întrebarea 1 trebuie
  completată cu asta.

## 2. R24 Catranic: acord

- **Cardul 29,3** (toată fereastra, 41 de zile), 1 tură/zi, **58,6 km/zi (−1,4)**.
- **Steagul:** «decizie: rezervă pe toată fereastra (C20)», plus o notă despre trackerul 2302.
- **Argumentul.** Picioarele întregi din septembrie (tur 28,7 · retur 29,8; retururile s2 de la 00:20 dau 29,1–30,1) se încadrează la ±0,6 de 29,3,
  deci drumul nu s-a schimbat. Rupturile sunt doar în picioarele de după-amiază (retur s1 15:5x cu plin 4–23, tur s2 14:00 cu 9,9–15,5).
  Cursa e aceeași pe mașina 224BZP.
- **Ce s-ar strica altfel.** 30,0 e cardul vechi din geometrie și contrazice regula lui Ion. Steagul ar rămâne pe viață, pentru că trackerul nu se repară din date.
- **Încredere:** mare.

## 3. R36 Bocancea Schit: acord (argumentul e mai tare decât în propunere)

- **Cardul 46,2**, 1 tură/zi, **92,4 km/zi (−16,6)**.
- **Steagul:** «decizie».
- **Garda obligatorie:** până la răspunsul lui Ion, excesul de noapte (retur s2 prin Bilicenii Vechi) nu intră în indicațiile pentru dispecer.
- **Argumentul.** F6: Bilicenii Vechi aparține R19 și are autobuzele lui la aceeași oră, deci drumul lung e comasare, nu nevoia R36. Varianta pe sens
  (46,2 / 52,3) o resping, din două motive. Primul: 52,3 pe retur conține tocmai comasarea cu R19. Al doilea: asimetria reală nu e pe sens, ci pe
  schimb × sens (lung pe tur s1 și pe retur s2, adică picioarele de noapte), iar cardul are un singur km pe linie.
  Rezerva mea: cele 14 valori din cele 7 perechi sunt bimodale (8 între 42,6 și 46,6 · 6 între 50,0 și 55,5). Mediana 46,2 cade la marginea de sus a
  grupului scurt. Asta o face o limită superioară a drumului scurt (picioarele întregi fără Bilicenii Vechi, pe toate cele trei sate din act, dau 42–46,5),
  deci prudentă față de economie. Nu o cobor mai jos.
- **Ce s-ar strica altfel.** 54,5 (cardul vechi) ar ascunde comasarea cu R19. Pe sens, R19 ar fi numărat o dată în R36 și încă o dată în R19.
- **Încredere:** medie spre mare pe drum, medie pe cifră (depinde de o zi lungă în plus).

## 4. R27 Sturzovca și R11 Limbenii Noi: acord pe cifre, dezacord pe mecanism

- **Sturzovca:** cardul 24,0 (orice poartă, 33 de zile; VEST/VEST 24,0 și EST/EST 23,9), 2 ture/zi, **96,0 km/zi (−53,4)**.
  «Porți divergente» se înlocuiește cu «decizie».
- **R11:** rămâne 31,2 × 1 = 62,4, fără steag.
- **Argumentul.** Graficul confirmă ce arată GPS-ul: 727CWN e pe R11 în slotul 1, zilnic, pe 14–22.09 (plus 05.09), iar 457BRAX trece pe R3 s2 din 14.09.
  Bucla atinge Limbenii Noi și Fundurii Noi, adică satele R11, și e pe grupa EZ (21 din 22), grupa R11. Dacă scoatem bucla, datele GPS dau 2 ture/zi,
  cu dedup pe aceeași mașină. Deci 3 → 2 e dovedit. Scăderea la 1 tură, pe care o cerea verdictul anterior pentru −99,6, nu e dovedită și nu o propun.
- **Mecanismul.** Bucla **nu** se mută acum pe R11 printr-o regulă de atribuire în `etalon.mjs`. Motivul: cele 28 de picioare de 44,6–47,1 ar intra în
  observațiile R11 și ar trage etalonul R11 (31,2 din 9 zile 457BRAX) spre steagul C47. Am repara Sturzovca și am strica R11. În v3, bucla se
  scoate de pe R27 prin `decizii-v3.json` (`scoate` după semnătura limbeniinoi|funduriinoi pe 727CWN, EZ) și se marchează în observații
  «variantă R11 (727CWN)», fără să schimbe etalonul R11. Regula generală de atribuire (întrebarea 11) se face separat, cu măsurătoare pe toată flota.
- **Ce s-ar strica altfel.** Cu 3 ture, bucla EZ ar fi numărată ca tură Sturzovca, adică +49,8 km/zi fictivi. Cu mutarea prin atribuire, R11 ar primi steag.
- **Încredere:** medie spre mare.

## 5. R32 Trifănești: DEZACORD (cea mai mare diferență)

- **R32|Trifanesti = doar 146BRAZ:** 40,2 (18 zile), 2 ture/zi, **160,8 km/zi (−8,4)**. Steagul se înlocuiește cu «decizie».
- **518MHD:** linie derivată **«R16 Florești prin satele R32 (518MHD)»**, 52,9 (12 zile; toată fereastra 53,4), 2 ture/zi, **211,6 km/zi**.
  Steagul **rămâne** («diagnostic cerut: ocol prin satele R32, +17,7 km/picior față de drumul direct 35,2, pe care aceeași mașină îl face în 6 zile»).
- **R16|Floresti** (35,7 × 1 = 71,4) devine informativă (0 km/zi), cu motivul «serviciul e în cursa 518MHD».
- **Net pe cele trei linii:** 160,8 + 211,6 − 169,2 − 71,4 = **+131,8** (agentul propune +203,2; mecanic ar fi +169,2).
- **Argumentul.** F1: aceeași mașină nu poate avea două carduri. 518MHD face ambele schimburi zilnic (act R16: ambele schimburi, iar GPS dă 2 ture/zi).
  Păstrez km-ul real (52,9) și nu drumul direct (35,7 × 2 = 142,8, încă −68,8), pentru că ocolul atinge satele altui act. 146BRAZ servește aceleași
  sate la același minut, dar pe EZ duce și oamenii R18 (F2), deci capacitatea nu se poate dovedi din GPS. Unde datele nu hotărăsc, km-ul rămâne cel real,
  cu steag.
- **Ce s-ar strica altfel.** Cu 4 ture pe R32 plus R16 Florești 71,4 (v3 mecanic), Floreștiul se numără de două ori și dispare cursa lui 518MHD.
  Cu linia separată fără să scoatem R16 Florești (propunerea agentului), dubla numărare e tot de +71,4. Cu «numai 146BRAZ» fără linia 518MHD,
  ar dispărea 211,6 km/zi reali ai unei mașini care lucrează zilnic.
- **Încredere:** mare pe identitatea mașinii (grafic + sate + R16|Florești doar 518MHD); medie pe 52,9 față de 35,7.
- **Întrebarea pentru Ion, reformulată:** «518MHD (autobuzul Floreștiului) trece zilnic prin Izvoare–Trifănești–Sevirova. Ia oameni de acolo,
  pe care 146BRAZ nu-i mai încape, sau e un ocol?»

## 6. R3 Nihoreni: DEZACORD

- **Un singur card, 42,3** (metoda comună pe porțile liniei VEST/EST, 16 zile), 2 ture/zi, **169,2 km/zi (−7,6)**. Agentul propune 190,0 (+13,2).
- **Steagul:** «decizie».
- **Garda:** bucla D intră în analiza săptămânală ca exces; poate ajunge în indicații doar după răspunsul lui Ion (vezi mai jos).
- **Argumentul.** F4: grupa D atinge aceleași sate (fără Pîrjota) pe o buclă cu +12 km încărcați și +28 km totali pe picior. Grupa EZ servește
  zilnic aceleași sate pe 40–44 km. După regula de mai sus (aceleași sate, două drumuri recurente), idealul e cel scurt. E și singura decizie
  coerentă cu Bocancea: acolo drumul lung măcar avea un sat din alt act, aici nu are niciunul. Separarea pe grupă ar pune în schelet, ca «ideal»,
  o buclă fără niciun motiv în sate. F3 elimină și al doilea argument al propunerii (drumul de 38,6).
- **Ce s-ar strica altfel.** Cu 52,7 pe D, excesul real al buclei (≈ 2 × 10,4 km/zi încărcați, 2 × 28 total) nu apare nicăieri în analiză.
  S-ar crea și schema «linie pe grupă», adică un tip nou de linie derivată, cu risc pe pagină și pe export, pentru o singură linie fără justificare.
- **Nuanță pe cifră.** 42,3 amestecă 345KAJ (41,4, până pe 14.09) cu 457BRAX (44,3, din 14.09; pleacă prin Hijdieni–Glodeni, comasat cu R29).
  Rămân pe 42,3 (septembrie întreg) și nu cobor la 41,4 fără o regulă comună.
- **Încredere:** medie spre mare pe drum; medie pe faptul că D poate inversa sensul buclei.
- **Întrebarea 6 pentru Ion, reformulată:** «Grupa D (186OMM) încarcă din Corlăteni și face bucla prin Nihoreni–Rîșcani. Poate merge ca grupa EZ
  (gol până la capăt, apoi încărcat spre Bălți)?»

## 7. R6 Mihăilenii Vechi: acord

- **Cardul 54,8** (orice poartă, 10 zile), 1 tură/zi, **109,6 km/zi (−1,8)**.
- **Steagul:** «decizie». `scoate` = 12.09, confirmat în grafic: 917FTI e pe R12 Sofia–Pelinia pe s1 și s2.
- **Argumentul.** Toate estimările convergente cad între 54,3 și 55,2: VEST/EST 54,3, orice poartă 54,8, EST/EST fără 12.09 ≈ 55,2.
  54,8 e la mijloc. Poarta EST a turului e ea însăși un artefact: turul real e pe VEST în 6 din 9 picioare necomasate și în 5 din 5 la 345KAJ.
- **Ce rămâne de făcut (nu blochează cardul).** F5: picioarele lui 345KAJ din 14.09 trebuie atribuite pe R6, nu pe R3|Recea\*. Altfel ture/zi și excesul
  R6 din analiza săptămânală sunt goale din 15.09 încoace. Regula e aceeași cu cea de la întrebarea 11 (capătul liniei mai departe de poartă decât
  capătul propriu) și trebuie măsurată pe toată flota odată cu ea. Întrebarea 7 către Ion devine o confirmare: «345KAJ face Mihăilenii din 14.09?».
- **Încredere:** mare.

---

## Cele 4 alinieri ale verificatorului

**(a) Dedup doar pe aceeași mașină (`etalon-gps.mjs:68`): acord, cu o condiție.**
- Default-ul `faraDedupIntreMasini = true`, ca în `etalon.mjs:139`. Altfel verificarea 3 vede 2 ture la Trifănești față de 4 (sau față de 2 + 2 pe
  două linii, după decizia 5) și pică pe o regulă, nu pe date. Efectul pe flotă e o singură linie (compara-v2-v3), iar acolo am dovedit că sunt
  două autobuze diferite (F1, F2).
- **Condiția:** cheia de dedup să fie `x.m === p.m || (x.dispozitiv && x.dispozitiv === p.dispozitiv)`. Protecția contra dispozitivelor duble
  (două plăcuțe pe același tracker, cazul 880RNK) nu trebuie pierdută odată cu dedupul între mașini.
- Versiunea `VERSIUNE_ETALON` se ridică, deci registrul C31 se re-semnează.

**(b) Regula de rezervă pe toată fereastra (C20): acord, cu gardă.**
- Verificatorul aplică aceeași regulă ca `alege.mjs:56-58`: septembrie sub 3 zile bune → «toate».
- **Defectul-sursă:** `alege.mjs` numără zilele bune fără `filtru-rupte`, iar `etalon-gps` le numără cu filtru. Din cauza asta Catranic are `sursa: sept`
  în schelet, deși după filtru are 2 zile. Ambele trebuie să numere cu același filtru. Altfel, liniile cu tracker rupt vor diverge mereu.
- **Garda:** rezerva e validă doar dacă picioarele întregi din septembrie stau în ±max(10 % × E, 1 km) față de etalonul «toate» în cel puțin 60 %
  din cazuri (C47 pe septembrie față de etalonul «toate»), ca să nu se ia din mai–iulie un drum care nu se mai face (vezi Bocancea: «toate» 59,1).

**(c) `ziLucru` unic: acord, dar faptul din `lant-schimbari.md` e incomplet.**
- Am rulat `dezb-dst.mjs` (pe toate minutele) pe VPS, cu Node 20.20.2 și tz 2025c. Cele două definiții diferă în **două** ore:
  02:00–02:59 EET pe 25.10.2026 (timp.mjs → 24.10, drax.mjs → 25.10) **și** 03:00–03:59 EEST pe 28.03.2027 (timp.mjs → 28.03, drax.mjs → 27.03).
- Pe mini (tz **2026a**) aceeași sondă dă **0 diferențe**: acolo Europe/Chisinau schimbă ora la 01:00 UTC, ca în UE, nu la 00:00 UTC.
  Afirmația «Moldova schimbă la 00:00 UTC, nu 04:00 ca în UE» e deci un fapt al tzdata 2025c, nu o certitudine.
- **Propunere:**
  - o singură sursă, `timp.mjs` (ceasul local), importată sigilat (sha în GATA.sha256) de verificator, în loc de reimplementare;
  - `process.versions.tz` scris în proveniența rulării și în manifest, iar lanțul și verificatorul rulate pe aceeași gazdă;
  - aducerea tzdata de pe VPS la ≥ 2026a se hotărăște separat.
- Impactul pe datele de azi e 0: nicio deplasare nu cade în acele ore (retururile s2 pleacă la 00:1x–00:2x).

**(d) `decizii-v3.json` aplicat de `card-gps.mjs`: acord, cu patru condiții.**
1. Fiecare decizie e o **metodă**: `sursa`, modul porții, `scoate` ca predicat (mașină / variantă după semnătura satelor / listă de zile cu motivul
   din grafic) și, pentru liniile derivate, cheia nouă. Nu conține niciun km.
2. Fiecare decizie are **valoarea așteptată** din dezbatere, iar `card-gps.mjs` se oprește cu eroare dacă rezultatul diferă cu mai mult de 0,1.
   Așa, o schimbare de intrări nu mută tăcut un card «decis».
3. Verificatorul citește **același** `decizii-v3.json`, sigilat în GATA.sha256, și refolosește `scoate` în `metrici()`. Altfel G1 compară un card
   calculat pe o submulțime cu etalonul întregii linii și redă steagul.
4. O linie derivată (518MHD) are cheie unică `ruta|linie`, iar linia pe care o înlocuiește (R16|Floresti) trece la `informativ` în **același** pas
   atomic. `export-lde.mjs` și pagina trebuie verificate că nu adună informativele.

**Întrebarea 12 (regimul Trifăneștilor):** da, regimul se recalculează pe sursa liniei (D1). Cu 146BRAZ singur pe R32, regimul iese pe mașina lui
(ambele schimburi zilnic în septembrie), nu pe amestecul cu 518MHD.

---

## Tabelul final

| linie | card km | ture/zi | km/zi | Δ față de v2 | steag |
|---|---:|---:|---:|---:|---|
| R18 Zarojeni | 30,0 | 2 | 120,0 | +4,4 | decizie (scoate 4 comasate, grafic) |
| R24 Catranic | 29,3 | 1 | 58,6 | −1,4 | decizie (rezervă C20) + notă tracker 2302 |
| R36 Bocancea Schit | 46,2 | 1 | 92,4 | −16,6 | decizie; excesul de noapte ține de răspunsul lui Ion |
| R27 Sturzovca | 24,0 | 2 | 96,0 | −53,4 | decizie (scoate bucla 727CWN = variantă R11) |
| R11 Limbenii Noi | 31,2 | 1 | 62,4 | 0 | — (neschimbat) |
| R32 Trifănești (146BRAZ) | 40,2 | 2 | 160,8 | −8,4 | decizie (submulțime pe mașină) |
| R16 Florești prin satele R32 (518MHD), derivată | 52,9 | 2 | 211,6 | +211,6 | **diagnostic cerut** (ocol +17,7/picior) |
| R16 Florești | — | — | 0 (informativ) | −71,4 | serviciul e în cursa 518MHD |
| R3 Nihoreni | 42,3 | 2 | 169,2 | −7,6 | decizie; bucla D ține de răspunsul lui Ion |
| R6 Mihăilenii Vechi | 54,8 | 1 | 109,6 | −1,8 | decizie (scoate 12.09); atribuirea 345KAJ de făcut |

**Totalul pe flotă (km/zi card):** 5.765,6 + 4,4 − 1,4 − 16,6 − 53,4 + 131,8 − 7,6 − 1,8 = **5.821,0 km/zi** (Δ +55,4).
- Propunerea agentului: 5.912,8. Diferența de −91,8 vine din −71,4 (Floreștiul dublat), −20,8 (Nihoreni un card) și +0,4 (Zarojeni).
- Dacă Ion spune că ocolul lui 518MHD e fără oameni, linia derivată scade la 35,7 × 2 = 142,8 și totalul devine **5.752,2**.
- Referințe: km/zi GPS 5.818,4 cu dedup între mașini și 5.983,2 cu dedup doar pe aceeași mașină.

## Riscuri pe care propunerea nu le vede

1. **Floreștiul numărat de două ori** (F1): +71,4 km/zi în bilanțul propus. `intrebari-v3.md` §5 și bilanțul final.
2. **Mihăilenii pe R3|Recea\*** din 14.09 (F5): ture/zi și excesul R6 goale în analiza săptămânală. `etalon.mjs`, atribuirea după capăt.
3. **Graficul din 23.09 e copie automată** (F7): orice probă «din grafic» pe zilele acestea e falsă. Dovezile mele din grafic sunt toate din 01–22.09.
4. **Gazdele au tzdata diferit** (2025c pe VPS, 2026a pe mini): reproducerea «octet cu octet» nu e garantată între gazde în orele schimbării.
   Contează la proveniență, nu la km.
5. **R32|Căinarii Vechi (302YEK)**, în afara celor 7 linii: 72 de picioare pe ambele schimburi, dar ture/zi 1. De verificat la verificarea 3,
   pentru că e aceeași clasă de defect ca Trifăneștii.
