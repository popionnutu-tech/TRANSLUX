# ION-112 — runda 3: triajul părții Claude și candidatul corectat (pentru Codex, runda 3)

## Pozițiile Claude, runda 3 (rapoartele: r3/verificator-raport.md, r3/r3-business.md, r3/r3-analist.md)
| linie | verificator (6,5; 9,0 după corecții) | business (8,5) | analist (6,5) | Codex r2 |
|---|---|---|---|---|
| Nihoreni R3 | 44,2 × 2 (retrage 47,2) | 44,2 × 2 | 44,2 × 2 | 44,2 × 2 provizoriu |
| Zarojeni R18 | 28,9 × 1 | 28,9 × 1 | 28,5 × 1 (acceptă 28,9) | × 1, km provizoriu 28,9 |
| Bocancea Schit R36 | 53,3 (retrage 54,5) | 53,3 | 53,3 | 53,3 |
| Prajila R17 | 41,3 × 2 | 41,3 × 2 | 41,3 × 2 | 41,3 × 2 provizoriu |
| Sturzovca R27 | 23,9 × 2 | 23,9 × 2 | 23,9 × 2 | 23,9 × 2 |
| Florești / Vărvăreuca / Trifănești | 36,5 / 42,8 / 40,2 × 2 | la fel | la fel | acord |
| H4 | 348KAJ iese; 763LYY diagnostic până îi ies picioarele din Prajila | 348KAJ iese; 763LYY «atribuire greșită» | toate ies; 763LYY de reetichetat | 348KAJ, 763LYY diagnostic |
Dovezi noi r3 (viteza în noduri × 1,852 peste tot): Nihoreni — pe aceeași poartă D și EZ merg pe același drum (tur 44,6 / 45,0), diferența din export vine de la poarta de intrare (EZ VEST 18/18, D EST 19/19). Zarojeni — returul EZ nu ajunge la capăt (0/8, se termină la Gura Căinarului), turul oprește 6/7; 348KAJ oprește 1,5–6,5 min în Zarojeni 5/5 zile după plecarea de acasă → cursă cu oameni, nu parcare. Prajila — 713IZX și 487NPL se înlocuiesc (o mașină pe zi); 763LYY nu oprește la Prajila în nicio zi lucrătoare din septembrie, picioarele lui «R17» sunt serviciul Zarojeni/Gura Căinarului (07–18.09) și Moara de Piatră (din 21.09).

## Triaj
- ACCEPTAT (verificator high): candidatul avea Zarojeni × 2 și Prajila × 3 (+140 km/zi fictivi). Reparat: card-gps.mjs — la «card-vechi» km din cardul sigilat ideal-v3, ture/zi MĂSURATE (cerința Codex r2 «cardul păstrează turele vechi»); decizia cu steag null = linie închisă, fără «diagnostic cerut».
- decizii-v3.json v4.3: scoase card-vechi Sturzovca, Bocancea Schit (GPS dă 23,9 × 2 și 53,3 × 1); Zarojeni card-vechi 28,9 cu ture măsurate (1); Nihoreni card-vechi 44,2 × 2 fără steag; Prajila poarta-sensului fără 763LYY → 41,3 × 2 (GPS, nu scris).
- Lanțul v4.3 rulat (r9): deciziile se reproduc ±0,1 km; diagnostic cerut 0; card 5.864 → 5.667 km/zi (Zarojeni −57,8, Prajila −82,6, Sturzovca −53,8, Bocancea −2,4). Blocantele (a) rămase: Putinești, Iabloana (linii comasate, §1.4, migr. 415, registrul le explică).
- 763LYY: scos din populația Prajila prin decizie (nu reetichetat pe altă linie; Zarojeni rămâne × 1 — tzE sept 1). Rămâne în H4? Propunere: iese din H4 ca «capăt atins prin parcare», intră în registru «atribuire greșită, scos din Prajila (decizie)».
- RESPINS: Zarojeni 28,5 (analist) — 1,4 % față de 28,9, aceeași convenție plin + rază ca restul cardurilor dă 28,9 (business); nu se schimbă o linie pe altă convenție.
- DESCHIS pentru Ion, neblocant: Rîșcani-Vest (1,7 km dincolo de Nihoreni) ca punct real de pornire (§4.1) → linia ar urca la ~48–50 km.

## Întrebări pentru Codex, runda 3
1. Accepți valorile finale pe cele 6 linii + Prajila (tabelul de mai sus, coloana majorității)?
2. Accepți regula «card-vechi = km sigilat, ture măsurate; steag null = linie închisă»?
3. H4: 348KAJ iese; 763LYY iese ca parcare și e explicat în registru ca atribuire greșită scoasă din Prajila — de acord?
4. Ceva blocant înainte de GATA + verificatorul vN + activare?
Fișiere: r3/vps/card-gps.mjs, r3/vps/decizii-v3.json, r3/vps/card-gps-raport.txt.
# ION-112 runda 3 — verificatorul: pozițiile finale (Nihoreni, Zarojeni, Bocancea Schit, Prajila, H4)

**Starea.** `ideal-v4.3` e tot **fără GATA** (`ls …/ideal-v4.3/GATA`: lipsă, 27.09 seara), deci `ruleaza.sh` îl refuză și nu există o rulare v15 pe
candidat. Pozițiile de mai jos se sprijină pe trei surse:
1. `export-r3.json`, unde viteza e în noduri × 1,852, deci problema C1 a lui Codex e închisă;
2. recalculările mele pe export: `r3/verif-perechi-zi.mjs` (tabelul zilnic al perechilor) și `r3/verif-perechi-km.mjs` (perechile tur+retur ale aceleiași mașini pe același schimb, bune = |t−r|/max ≤ 18 %, C18);
3. citirea (doar `grep`/`sed`) a fișierelor candidatului pe VPS: `card-gps-raport.txt`, `alege-ideal.log`, `control-ideal.log`, `schelet-ideal.json`.

Km-ii exportului sunt **bruți** (`plinLant`) sau **de la oprire până la primul punct la ≤ r + 0,1 km de centrul porții**. Nici unii, nici ceilalți nu sunt completați. Ca să îi compar cu cardul (C19 = plin + raza porții, EST 0,6 / VEST 0,5), adun ~0,6 km.
Aceasta este o rundă de dezbatere, nu o verificare oarbă `v<N>`, așa că nu am un verdict sigilat nou.

## Ce spune candidatul de pe disc (faptul care contează cel mai mult)
| linie | `schelet-ideal.json` / `card-gps-raport.txt` v4.3 | poziția comună | diferența |
|---|---|---|---|
| R18 Zarojeni | km 28,9, **tureZi 2** (tureZiE sept 1), km/zi **115,6**, «DECIZIE card-vechi» | 28,9 × 1 = 57,8 | **−57,8 km/zi** |
| R17 Prajila | km 41,3, **tureZi 3**, km/zi **247,8** | 41,3 × 2 = 165,2 | **−82,6 km/zi** |
| R3 Nihoreni | 44,2 × 2 = 176,8, «DECIZIE card-vechi» + steag | 44,2 × 2 | 0 (rămâne decizie, nu măsurare) |
| R36 Bocancea Schit | 54,5 × 1 = 109, «DECIZIE card-vechi» | 53,3 × 1 = 106,6 | −2,4 km/zi |

M-b (deciziile «card vechi» aduc înapoi și turele vechi) **nu e reparat în datele candidatului**: pe disc, Zarojeni e tot × 2. Prajila × 3
nu vine dintr-o decizie. Vine din C28 al lanțului («GPS 3 · act 2 (EZ 1 / D 1) · sursa sept», `control-ideal.log:96`), care numără și perechile lui 763LYY (mai jos).

## Q5 Nihoreni R3 — **ACORD: 44,2 × 2** (trec pe poziția majorității; retrag 47,2)
- **De ce retrag 47,2.** Media mea din runda 2 folosea D 51,8. Acea cifră era pe **toată fereastra**, cu 397VKV din mai–iul, iar §6.3/C20 cer septembrie (≥ 3 zile bune).
  În septembrie, D (186OMM) are **11 perechi bune din 20, mediana 49,95 brut**. D e și **bimodală**: turul are 38,0 km în 6 zile (02, 04, 15–18.09) și 47,5–55,8 în 14 zile.
  O medie a grupelor construită pe o grupă bimodală nu e o măsurare robustă.
- **Cifra pe linie, pe septembrie.** Pe toate perechile bune (27 din 36, ambele grupe) mediana e **45,25 brut → ≈ 45,8 completat**. Aceasta e exact «orice poartă 45,8» din steagul lanțului.
  EZ singură: 16/16 bune, mediana **41,55 brut**. Etalonul pe poarta sensului (C19) e **42,3**.
- **De ce 44,2 trece.** Față de 42,3 abaterea e +4,5 %, iar față de 45,8 e −3,5 %. Ambele sunt sub pragul G1 de 5 %, deci nu se cere nicio corecție de card.
  Km-ii de la oprire (D 45,1 / EZ 41,6, adică ~45,7 / ~42,2 completați) cad în același interval.
  Costul de a păstra 44,2 în loc de 45,8 este **−6,4 km/zi** (176,8 față de 183,2).
- **Ture: × 2.** Perechi/zi în septembrie: mediana 2 (în 16 zile din 20 câte o pereche EZ și una D; în 4 zile câte 1), la fel ca actul (EZ 1 / D 1).
- **Ce rămâne.** Steagul `diagnostic-drum` / E1: D trece fie prin Recea (~52), fie direct (~38). Ambele drumuri sunt din act (`sate`: Nihoreni, Riscani, Recea).
  Cardul 44,2 e o decizie în toleranță, nu o mediană. Registrul trebuie să spună asta pe sha-ul nou.

## Q6 Zarojeni R18 — **1 tură; card 28,9** (nu 27,8)
- **Ture: × 1.** Perechi/zi în septembrie (EZ, 348KAJ): 0 1 1 0 1 1 1 1 1, mediana 1. Actul spune EZ 1 / D 0. Candidatul scrie însă tureZi 2, ceea ce trebuie corectat.
- **De ce nu 27,8.** 27,8 e km-ul **de la oprire**, măsurat până la un punct aflat la ~0,7 km de centrul porții, deci **necompletat**. Completat (+0,6), ar fi ≈ **28,4**.
  Alte cifre pentru același drum:
  - turul brut al lanțului, mediana 28,5 (7 picioare), completat ≈ 29,1;
  - `alege-ideal.log:44` dă tur 28,9 / retur 27,9.
  Toate cifrele completate stau în **28,4–29,1**, iar 28,9 e la ±1 % de fiecare. Alegerea 27,8 ar fi amestecat un km necompletat cu carduri completate, adică o eroare de metodă de ~0,6 km, nu o dovadă.
- **Km pe tur, nu pe pereche.** Returul se termină la Gura Căinarului, la ~3,7 km de Zarojeni: 0/8 opriri la capăt (§4.5 real), plin 22,0 în 22–24.09 față de tur 26,8–27,0.
  Perechile acestor zile cad la C18 (18,5 %), așa că în septembrie rămân doar 3 perechi bune (33,3 / 50,3 / 28,3). Ziua de 18.09 (48,4 / 52,1) e atipică.
  Mediana perechilor nu e utilizabilă, de aceea turul cu oprire validă (6/7) e baza corectă.
  Diferența tur–retur rămâne o notă în registru (low), nu o schimbare de §6.1.
- 25.09: 348KAJ are o pereche s1 în săptămâna fazei A (29,8 / 29,6, fără oprire) plus turul s2. E un caz izolat pe o linie doar-EZ, deci «posibil Z» (D2), nu o a doua tură.

## Q4 Bocancea Schit R36 — **ACORD: 53,3 × 1** (trec pe poziția majorității; retrag 54,5)
- **De ce retrag 54,5.** Nicio regulă nu păstrează un card vechi doar pentru că e în toleranță (§6.3 și C19 cer etalonul pe septembrie). Aici Codex are dreptate.
- **De ce 53,3 și nu 54,0.** Cea mai bine susținută cifră GPS rămâne 54,0: 14 perechi bune în septembrie (runda 2), iar `alege-ideal.log:94` dă sept 5/5 bune, tur 54,4 / retur 54.
  Totuși 53,3 e rezultatul aceleiași metode `card-gps` aplicate tuturor celorlalte linii și **scoate o decizie manuală**. Diferența față de 54,0 e 1,3 %, sub G1 5 %, adică 1,4 km/zi.
  Consecvența metodei valorează mai mult decât 0,7 km.
- **Low.** Diferența 53,3 / 54,0 vine din eligibilitate: 4 zile după filtrul satelor regulate, față de 14 perechi. De notat în raportul cardului.

## Prajila R17 — **× 2, card 41,3** (nu × 3)
- **Tabelul zilnic din septembrie** (21 de zile), perechi/zi: `3 3 3 2 1 3 3 2 2 2 0 3 3 2 2 3 2 2 2 2 1`, **mediana 2**, cu 3 perechi în 8 zile.
  Nota din brief («mediana 2; 3 perechi în 10 zile») e aproape, dar dacă ar fi 10 zile din 19, mediana ar ieși 3. Pe export sunt **8 din 21**.
- **Ce e a treia pereche.** Aproape mereu e 763LYY: al doilea autobuz EZ pe **același** schimb cu 487NPL sau 713IZX (01–03, 07–08, 14–15, 18.09).
  Nu oprește la Prajila: are **1 tur cu oprire la capăt din ~15** în septembrie, singurul fiind 05.09, pe D, când era singura mașină a zilei. Perechile ei au 35,4–44,7 (mediana 38,5).
  Din 22.09 face picioare de **57 km**, ceea ce indică alt drum.
  Pe §4.2, drumul care doar trece prin sat nu face capătul, deci perechile lui 763LYY nu sunt ture Prajila.
- **Km-ul liniei.** Fără 763LYY: 34/34 perechi bune, mediana **40,65 brut → 41,25 ≈ 41,3** completat. Cu 763LYY: 40,5 → 41,1.
  Cardul 41,3 = C19 fără 763LYY, cu tur 40,8 și retur 40,6.
- Candidatul trebuie să scrie **tureZi 2**: 165,2 km/zi în loc de 247,8.

## H4
- **348KAJ Zarojeni — IESE.** Turul are opriri valide la capăt: **6/7 în septembrie** (§4.5, viteza reală), km de la oprire 27,8.
  Drumul spre casă nu intră în km: returul se oprește la Gura Căinarului (plin 22,0) și nu se prelungește.
  Criteriul H4 (capăt + atribuire) e satisfăcut pe tur. Returul scurt se notează în registru la Zarojeni, nu ca anomalie a mașinii.
  Rezervă: pe toată fereastra turul oprește doar 26/60, dar sursa e septembrie.
- **763LYY Prajila — RĂMÂNE diagnostic.** Nu declar serviciul R17 nelegitim: satele Lunga, Bahrinești și Mărculești sunt în act. Dar în septembrie nu atinge capătul (1/~15), iar din 22.09 face 57 km.
  E serviciu scurt sau alt drum, nu o tură Prajila. Ieșirea din H4 vine doar după ce picioarele lui ies din numărătoarea turelor Prajila și primesc linia lor, sau o explicație E1.
  Cardul Prajila (41,3 × 2) **nu mai depinde** de ea.

## Scorul (10 − Σ; high −2, medium −0,5, low −0,25)
- **High H-t — turele consensului nu sunt în datele candidatului.** *Scenariu:* cineva pune GATA pe `ideal-v4.3` așa cum e pe disc și exportă.
  LDE și F2 primesc Zarojeni × 2 (115,6) și Prajila × 3 (247,8), adică **+140,4 km/zi** cu oameni fictivi față de pozițiile comune.
  Cardul flotei rămâne umflat, iar Zarojeni, Nihoreni și Bocancea rămân «decizii card-vechi». −2.
- **Medium:** candidatul e nesigilat, deci niciun v15 nu a verificat C47, G1 sau ture/zi pe el. −0,5.
- **Low:**
  - Nihoreni 44,2 față de 45,8 (−6,4 km/zi, D bimodal), steag `diagnostic-drum` de păstrat;
  - Zarojeni: returul se termină la Gura Căinarului, notă în registru;
  - Bocancea 53,3 față de 54,0, din eligibilitate;
  - 763LYY rămâne în H4 până la reatribuire.

  Total: −1,0.

**Σ = 3,5 → 6,5 / 10** pe candidatul de pe disc. Cu turele scrise (Zarojeni 1, Prajila 2), deciziile «card-vechi» înlocuite (Zarojeni 28,9 și
Bocancea 53,3 din `card-gps`; Nihoreni 44,2 cu steag) și GATA + v15 verde: **9,0 / 10**.
**Pe poziții sunt acum de acord cu majoritatea pe toate cele cinci puncte.** Singura rezervă rămasă e 763LYY, care rămâne în H4.
# ION-112 runda 3: partea Claude (logica de business), poziția FINALĂ

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Reguli:** `lde_uzine.reguli_livrare` DRAXELMAIER_BALTI, md5 `1cfc6c53c3e0c23a3269c7bd834bdeef` (verificat azi), 27.406 car.
- **Date:** `export-r3.json` (879 de picioare, v4.3, viteza × 1,852, oprire ≤ 0,8 km / < 8 km/h / ≥ 20 s).
- **Calcul:** `r3/r3-business-calc.mjs` (mediana adevărată; exportul folosește mediana de sus, vezi L2).
- **Convenția cardului:** card = plin + raza porții (`etalon-gps.mjs` `plinC`). Km-ul «de la oprire» din export se oprește la
  primul punct din raza porții + 0,1 km, deci se compară cu cardul **după ce i se adaugă ~0,6–0,7 km**.

**Retrag din runda 2:** cifrele mele pentru retururile Zarojeni («4 ating / 3 opresc» în septembrie) erau făcute cu viteza în noduri
(C1 al Codex). Pe export, returul EZ din septembrie are **0 din 8** opriri la ≤ 0,8 km de Zarojeni. Concluzia «returul nu se termină la
Gura Căinarului» cade; rămâne doar că plinul de 22 km era o tăietură (în v4.3 returul are plinul 28,2, cât turul).

---

## Q5 Nihoreni: **ACORD, 44,2 × 2** (card comun, fără etalon pe grupă)
- **Ture:** 2 perechi pe zi în 16 din 20 de zile din septembrie (186OMM pe grupa D + o mașină EZ: 345KAJ, apoi 457BRAX din 14.09).
  Zilele cu 1 pereche sunt 09, 14, 16 și 25.09, cu picioare fără pereche. Mediana e **2**.
- **Km pe grupă de la oprire:**
  - D tur 45,1 în septembrie (5 picioare, 45,1 / 45,1 / 45,1 / 45,4 / 47,1) și 45,0–46,0 pe toată fereastra;
  - EZ tur 41,4 în septembrie (345KAJ, 2 picioare) și **42,1** pe toată fereastra (345KAJ, 26 de picioare, 39,7–43,9).
- **Proba cardului comun:** grupele se rotesc între schimburi (§2.3), deci fiecare schimb are jumătate D, jumătate EZ.
  - media grupelor la oprire = (45,1 + 42,1) / 2 = 43,6;
  - plus raza porții (0,65) = **44,25 ≈ 44,2**;
  - km pe zi: un card comun dă 176,8, iar două carduri pe grupă dau 2 × (45,75 + 42,75) = 177,0. **Diferența e 0,2 km pe zi.**
- **Lanțul nu susține altă cifră:** mediana plinului pe perechile bune din septembrie e 45,25 (+ 0,6 = 45,8). E umflată de
  tăietura pe atingere la 186OMM (plin 47,9 față de 45,1 de la oprire, adică +2,8). Se folosește cifra de la oprire, nu plinul.
- **Rest deschis (L1):** 457BRAX (EZ, 14–25.09) are **0 din 18** picioare cu oprire la capăt, deși plinul lui e 43–47.
  - EZ din septembrie se sprijină pe 2 picioare, iar cifra EZ vine de pe toată fereastra.
  - Nu schimbă cardul (±1,5 km pe EZ = ±1,5 km pe zi), dar 457BRAX trebuie verificat la «capăt prin parcare» sau «descărcare în alt
    punct al satului».

## Q6 Zarojeni: **1 tură; card 28,9** (nu 27,8)
- **Ture:** o singură mașină, 348KAJ, cu 1 pereche pe zi în toate zilele 17–25.09 (pe 25.09 face și un tur s2 fără pereche).
  Trackerul lui 348KAJ are date doar din 17.09. Picioarele D (1 + 1) nu au oprire. Mediana e **1**.
- **De ce 28,9 și nu 27,8:**
  - 27,8 e km-ul de la oprire **fără raza porții**. În convenția tuturor celorlalte carduri e 27,75 + 0,65 = **28,4**.
  - 28,9 iese din regula §6.2 aplicată cum se aplică la celelalte 47 de linii: plinul EZ din septembrie, tur 28,5 și retur 28,2,
    plus raza 0,6 dă **≈ 28,9**.
  - Diferența dintre 28,9 și 28,4 e de 1,7 %, în toleranța §6.4 (±5 %), adică 1,0 km pe zi.
  - Un card luat pe altă convenție pentru o singură linie ar fi derivă de formulă. Cifra de la oprire rămâne **control**, nu card.
- **Capătul rămâne Zarojeni:**
  - turul EZ oprește în Zarojeni în 6 din 7 picioare din septembrie (27,6–27,9 km de la oprire; excepțiile 33,9 și 39,7 sunt ocoluri);
  - returul trece prin Zarojeni fără oprire și se termină la Gura Căinarului (verificatorul: 8 din 8);
  - excepția de la §4.1 cere «la mai multe mașini», iar aici e o singură mașină, deci **nu se aplică**. Se notează în registru.

## Q4 Bocancea Schit: **53,3 × 1** (neschimbat)
§6.3 cere septembrie la ≥ 3 zile bune, iar septembrie are 4. Cardul vechi 54,5 nu are regulă de păstrare (Codex runda 2 e de acord).
Exportul din runda 3 nu atinge linia.

## Prajila: **× 2, card 41,3** (nu × 3)
Tabelul zilnic al perechilor din septembrie (tur și retur, aceeași mașină și același schimb):

| perechi pe zi | zile |
|---|---|
| 3 | 01, 02, 03, 07, 08, 14, 15, 18 (8 zile) |
| 2 | 04, 09, 10, 11, 16, 17, 21, 22, 23, 24 (10 zile) |
| 1 | 05 (sâmbătă), 25 |
| 0 | 12 (sâmbătă) |

Mediana formală §6.5 e **2** și pe 21 de zile, și pe cele 19 zile lucrătoare.

**Faptul care decide:** a treia pereche e întotdeauna a lui **763LYY**, iar 763LYY **nu oprește la Prajila**:
- în septembrie are o singură oprire, din 30 de picioare (turul D din 05.09);
- EZ tur 0 din 15, EZ retur 0 din 13;
- plinul lui variază 34,7–57,8 și nu seamănă cu linia.

713IZX, în schimb, oprește la capăt în toate tururile (D 14 din 14, EZ 12 din 12), iar 487NPL în 9 din 12. Ele sunt **substitute**, nu se adună: 487NPL face
ambele schimburi exact în zilele fără 713IZX (01–03 și 10–11.09).

Deci linia are **2 perechi pe zi, câte una pe schimb**, iar a treia pereche e serviciul altei linii (R32 sau Putinești, §1.4, migr. 415)
etichetat pe R17.

**Km:**
- mediana plinului pe perechile bune e 40,65 cu 763LYY și 40,7 fără el, deci **41,3** cu raza, identic;
- de la oprire: D 41,6, EZ 40,1, în medie 40,85 + 0,65 = 41,5 (+0,5 %).

## H4 (lista «capăt prin parcare»)
- **348KAJ Zarojeni — IESE din H4.**
  - Pe unități corecte, turul oprește la capăt în 86 % din picioarele din septembrie (6 din 7), deci capătul e real, nu parcare.
  - Returul fără oprire nu e parcare: cursa continuă până la Gura Căinarului, cu o singură mașină (vezi Q6).
  - Rămâne o notă în registru, fără diagnostic: «returul trece prin capăt, descarcă mai departe».
  - Separarea de drumul spre casă, cerută de Codex, nu schimbă cardul: el se ia pe tur, de la oprire, iar returul intră doar prin
    §6.1 (tur = retur).
- **763LYY Prajila — IESE din H4, dar TRECE la «atribuire greșită, de mutat»** (aceeași clasă ca 727CWN și 518MHD).
  - Faptul: 1 din 30 de picioare cu oprire la Prajila în septembrie.
  - Nu furnizează nici km (40,65 față de 40,7), nici ture (× 2 fără el).
  - Clasificarea pe picioare cerută de Codex (serviciul scurt de la Lunga, parcare, serviciu complet) **rămâne nefăcută** (L3). Nu
    schimbă nici cardul, nici turele, dar e necesară la mutarea picioarelor la re-rulare.

## Ce se schimbă în textul regulilor (pentru ca textul să spună ce măsoară scheletul)
1. **§6.5, turele.** De adăugat după «dispozitivele duble…»:
   - «Se numără doar perechile liniei: cel puțin un sens cu oprire (§4.5) la capătul liniei. Mașina care în sursă (§6.3) oprește la
     capăt în mai puțin de 10 % din picioare nu intră la numărare; picioarele ei se mută la linia unde opresc (R17 Prajila,
     septembrie: 763LYY, 1 din 30).»
   - «Turele se iau din aceeași sursă ca km-ii (§6.3), iar cardul poartă turele măsurate, și la linia cu decizie (card vechi).»
   - **Rezultatul** se rescrie după re-rulare. Azi 2 × 3 → **0 × 3**: Prajila 2 și Sturzovca 2 trec la × 2, Zarojeni rămâne 1,
     iar Florești trece 1 → 2. De scris numărul exact de linii × 1 / × 2 și noul total km pe zi al uzinei (5.789 nu mai e valabil).
2. **§6.6, exemplul.** «R27 Sturzovca: s1 24,7 km, s2 46,9 km» e fals: 46,9 erau buclele lui 727CWN, atribuite greșit. Sturzovca e o
   linie a grupei D, pe un singur schimb pe zi, cu două mașini, **23,9 × 2**.
   - Varianta propusă: «Unde schimbul 1 și schimbul 2 merg pe drumuri diferite… etalonul se ține pe schimb (azi nicio linie).»
   - Plus: «Diferența pe GRUPĂ (D / E+Z) nu face etalon separat. Grupele se rotesc între schimburi (§2.3), iar cardul comun = media
     grupelor dă aceiași km pe zi (R3 Nihoreni: D 45,1 / EZ 42,1 la oprire → 44,2 × 2; două carduri 177,0 față de 176,8 km pe zi).»
3. **§2.4 Sturzovca:** «merge pe ambele schimburi, cu două mașini» → «merge pe schimbul grupei D, cu două mașini».
4. **§6.2, o frază despre convenție:** «Km-ul liniei = plinul GPS completat cu raza porții; km-ul măsurat de la oprirea din capăt se
   folosește ca control (±5 %, §6.4), pe aceeași convenție.» Asta închide disputa 27,8 / 28,9.
5. **§4.1 sau registru, Zarojeni:** «R18 Zarojeni: returul lui 348KAJ trece prin Zarojeni și descarcă la Gura Căinarului. O singură
   mașină, deci capătul rămâne Zarojeni.»

## Deduceri (doar ce nu s-a dedus în rundele 1–2)
- **L1 (low, −0,5):** 457BRAX, EZ Nihoreni din 14.09, are 0 din 18 opriri la capăt. EZ din septembrie se sprijină pe 2 picioare.
- **L2 (low, −0,5):** `export-r3.mjs` `med()` ia mediana de sus la n par (Zarojeni 27,8 față de 27,75; Nihoreni EZ 41,6 față de 41,4).
  Suma `cum` sare peste salturile de peste 5 km (golurile trackerului), deci km-ii de la oprire pot ieși subestimați. Cifrele de
  la oprire nu includ raza porții. Toate trei sunt de spus lângă cifre.
- **L3 (low, −0,5):** clasificarea picioarelor 763LYY (serviciul scurt, parcare, serviciu complet) nu e făcută. Nu schimbă cardul
  și nici turele, dar e cerută de Codex și e necesară la mutarea picioarelor la re-rulare.

Niciun high: niciun scenariu nu schimbă km pe zi cu peste 2 km pe vreo linie.

## Scor: 10 − 1,5 = **8,5 / 10**

| linie | card final |
|---|---|
| Florești | 36,5 × 2 |
| Vărvăreuca | 42,8 × 2 |
| Trifănești | 40,2 × 2 |
| Sturzovca | 23,9 × 2 |
| Bocancea Schit | 53,3 × 1 |
| Nihoreni | **44,2 × 2** |
| Zarojeni | **28,9 × 1** |
| Prajila | **41,3 × 2** |

- **H4:** 348KAJ iese; 412BRAY iese; 727CWN iese; 763LYY iese din H4 și trece la mutare.
# ION-112, runda 3 — uzina-analist («cercetează»): pozițiile finale Q5, Q6, Q4, Prajila, H4

Autor: uzina-analist, 27.09.2026. Nu am scris în bază, n-am schimbat scheletul și n-am rulat lanțul.

**Regulile folosite:** `lde_uzine.reguli_livrare` Drăxlmaier, `reguli_livrare_la` 2026-09-27 18:22:08 UTC, md5 `1cfc6c53…`:
- §2.3 — grupele și alternanța, ancora 21.09 = faza A;
- §4.1, §4.2, §4.5 — capătul și oprirea;
- §6.2, §6.3, §6.5 — mediana zilelor bune, sursa septembrie, turele măsurate.

Convenția cardului e `plinC = plin + raza porții`, din `2026-09-26-schelet-verificator/cod/etalon-gps.mjs:37`. Raza porții EST e 0,6 km.

## Metoda și ce retrag

**Accept C1 (Codex).** `leg.mjs` din runda 2 compara viteza în noduri cu pragul de 8 km/h. Retrag toate cifrele «la oprire» din r2:
- tabelul Nihoreni pe mașini (45,2 / 41,5 / 43,2);
- afirmația «348KAJ trece încet prin Zarojeni la 00:32–00:37»;
- mediana 33,5 a returului Florești.

Pe viteza reală, niciuna dintre ele nu se confirmă.

**Dovada nouă** e urma din trackerul pg, cu viteza în noduri × 1,852 și `w_date` ca UTC. Opririle sunt la < 8 km/h real și durează ≥ 20 s. Scripturile și ieșirile sunt în `scratchpad/p112r3/`:
- `r3.mjs` — ziua mașinii tăiată în picioare poartă↔poartă, cu toate opririle, satul OSM și eticheta obs v4.3; rezultatul e în `p112r3-out.json`, iar `arata.mjs` îl afișează;
- `r3b.mjs` + `zone.json` — pe fiecare picior obs v4.3 al celor trei linii, plus toate picioarele lui 763LYY, 348KAJ, 713IZX și 487NPL: prima oprire (la tur) sau ultima (la retur) în fiecare zonă a capătului, cu km pe urmă până la FIECARE poartă (marginea razei și punctul cel mai apropiat de centru); rezultatul e în `p112r3b-out.json`;
- ieșirile: `sum-nihoreni.txt`, `sum-zarojeni.txt`, `sum-prajila.txt`, `tab-prajila.txt` (tabelul zilnic din septembrie), `leg-348-r3.txt`.

## Q5 Nihoreni (R3) — ACORD: 44,2 × 2, un card

1. **Diferența D/EZ din export e diferența de POARTĂ, nu de grupă.**
   - Turul EZ intră întâi pe poarta VEST: 345KAJ 9/9 și 457BRAX 9/9, apoi merge pe EST după ~10 min.
   - Turul D (186OMM) intră doar pe EST, 19/19.
   - `export-r3.mjs` ia «prima poartă atinsă», deci compară EZ→VEST cu D→EST.
2. **Pe aceeași poartă și în același punct, cele două grupe merg pe același drum.** Punctul comun e nodul de pe șoseaua principală, (47.9486, 27.5665), la 1,08 km de capăt. Km până la centrul porții EST:

| | D (186OMM) | EZ (345KAJ) | EZ (457BRAX) |
|---|---|---|---|
| tur, nod → EST | **44,6** (n9) | **45,0** (n6) | 46,0 (n3) |
| retur, EST → nod | **39,0** (n7) | **38,9** (n3) | 42,5 (n3) |

3. **Punctul real de pornire e același pentru ambele grupe:** Rîșcani-Vest, (47.9504, 27.5452), la 1,7 km de capătul «Nihoreni».
   - D pornește de acolo în 17 tururi din 19 și așteaptă 13–25 min înainte de plecare. Până la EST sunt 50,3 km.
   - EZ (345KAJ) pornește de acolo în 6 tururi din 9 și așteaptă 5–7 min. Până la EST sunt 48,2 km, până la VEST 42,7 km.
4. **Returul nu se termină în capăt:**
   - D coboară ultimii oameni în Rîșcani-NE/E, la 54,1–55,2 km de EST (12 din 19);
   - EZ se termină la nod sau în Rîșcani-V, apoi mașina merge acasă, la Zăicani.
   - De aceea exportul prinde rar oprirea la ≤ 0,8 km de capăt la retur.
5. **Turele:** în septembrie sunt 2 pe zi — o pereche D (186OMM) și o pereche EZ (345KAJ, apoi 457BRAX).

**Poziția: 44,2 × 2, un card** (§6.1: scheletul e al liniei).
- De la oprirea din capăt, la tur: D 46,0 până la centrul EST, EZ 42,0 până la centrul VEST. Media e 44,0.
- 44,2 e la 0,5 % de această medie și în ±5 % de tot plicul măsurat.
- Nu există două servicii. Etalon pe grupă (§6.6) nu se justifică.
- **Întrebare pentru Ion** (nu se decide aici): Rîșcani-Vest îndeplinește la tur criteriul §4.1 «capăt dincolo de Starting point». Satul e în numele rutei, e punctul de pornire al ambelor grupe și are așteptare înainte de tur. La retur însă îl îndeplinește doar parțial: EZ 3 din 19, D se termină în alt capăt al orașului. Dacă Ion îl face capăt, linia ar crește la ~48–50 km.

## Q6 Zarojeni (R18) — 1 tură; card 28,5 (28,9 acceptabil, nu blochează)

348KAJ, 17–25.09. Trackerul are puncte doar din 17.09. Detaliile sunt în `leg-348-r3.txt`.

**Turul EZ** (21, 22, 23, 25.09, faza A, s2):
- 348KAJ pleacă de acasă, din Gura Căinarului (31–33 km de EST, unde stă parcat 5–6 h);
- oprește în Zarojeni, la (47.8682, 28.1555), 0,72 km de capăt, 99–397 s, la 13:37–13:44;
- apoi oprește în Gura Căinarului 3–14 min și ajunge pe EST la 14:30–14:35;
- km de la oprirea din Zarojeni: **27,8 / 27,9 / 27,8 / 28,0 până la marginea razei EST, 28,3–28,4 până la centru**;
- pe 24.09 a ocolit: 39,7 km.

**Returul EZ s2 NU ajunge în Zarojeni** (0 din 5 nopți pe viteza reală):
- pleacă de pe EST la 00:15–00:19 și merge direct acasă, în Gura Căinarului, la 26,3–27,5 km, unde parchează ~2 h 15 min;
- casa e la 1,34 km de capăt, deci peste raza de 1,2 km a §4.2;
- lanțul taie acest retur la 21,9–22,0 km (`plin`), ceea ce nu e o măsurătoare a liniei.

**De unde vin 28,9 și 29,5:**
- 28,9 e «card vechi (decizie v3)» (`card.decizie.metoda = card-vechi`), nu o măsurătoare a acestui serviciu;
- etalonul nou al lanțului, 29,5, amestecă zilele s1 17–18.09 și 25.09. Pe 25.09 turul s1 etichetat R18 oprește în Putinești și Țiplești, fără Zarojeni, adică pe drumul R22.

**Poziția: 1 tură pe zi (grupa EZ, urmează rotația); card 28,5 = 27,9 (median, de la oprire la marginea EST) + 0,6 (raza EST).**
- E aceeași convenție `plinC` ca la celelalte 47 de linii. Cele 27,8 din export sunt până la marginea razei, fără rază, deci nu se compară cu celelalte carduri.
- 28,9 diferă cu 1,4 % (0,8 km/zi): îl accept dacă majoritatea îl vrea, nu e blocant.
- Returul nu intră în km: nu atinge capătul. Drumul poartă → casă e al mașinii (navetă/livrare), nu al liniei.

**Dovada că e o singură tură: 763LYY a făcut exact același serviciu înainte ca trackerul lui 348KAJ să aibă puncte.**
- Oprirea din Zarojeni e în același punct, (47.8682, 28.1555), la 27,8–28,1 km de EST.
- Zilele: tur s2 pe 07, 08, 10 și 11.09 (faza A); tur s1 pe 15 și 18.09 (faza B). Pe 17.09 serviciul l-a făcut 348KAJ.
- În fiecare zi o singură mașină face perechea EZ Zarojeni. v4.3 a etichetat aceste picioare ale lui 763LYY drept «R17 Prajila» (vezi mai jos).

## Q4 Bocancea Schit (R36) — 53,3 × 1 (neschimbat)

- §6.3 din textul curent: «Sursa = septembrie, dacă are ≥ 3 zile bune».
- În cardul v4.3, `zileBuneGPS` = 4, `sursaEtalon` = sept, `etalonGPS` = 53,3 și C47 = 95 %.
- Cele 54,5 sunt `km` din cardul vechi, cu +2,2 %. Pragul de 5 % nu e o regulă de păstrare a cardului vechi (aici sunt de acord cu Codex).
- N-am o măsurătoare nouă de urmă pe această linie.

## Prajila (R17) — × 2; «a treia pereche» a lui 763LYY NU e Prajila

Tabelul zilnic din septembrie e în `tab-prajila.txt`, cu ora la poartă și zonele cu oprire pe fiecare picior.

1. **713IZX și 487NPL fac împreună exact o mașină pe zi, pe ambele schimburi, deci 2 perechi pe zi.**
   - 487NPL face 01–03.09 și 10.09;
   - 713IZX face 07, 08, 14–18 și 21–25.09;
   - pe 04, 09 și 11.09 predau mașina la mijlocul zilei (de ex. 09.09: 713IZX tur s1, apoi 487NPL retur s1 + s2). Zilele sunt disjuncte.
   - Oprirea în Prajila, la (47.8437, 28.2006), e pe TOATE picioarele: 713IZX D tur 14/14, D retur 13/13, EZ tur 12/12, EZ retur 13/13; 487NPL tur 5/5 + 7/7.
2. **763LYY nu oprește în Prajila în nicio zi lucrătoare din septembrie.** Excepția e sâmbăta 05.09: tur s2 239 s, retur 20 s.
   - «Lunga» lui 763LYY e **casa lui**, la (47.8558, 28.2338), 2,46 km de capătul Prajila: parchează acolo 3,5–6 h ziua și noaptea. §4.1 și §4.2 spun că drumul de acasă nu face capătul.
   - Picioarele etichetate «R17 Prajila» în v4.3 sunt de fapt:
     - **serviciul R18 Zarojeni / Gura Căinarului** — oprire în Zarojeni la 0,72 km de capătul R18: 07, 08, 10, 11, 15 și 18.09; doar Gura Căinarului: 01–04, 14 și 16.09;
     - **un serviciu prin Moara de Piatră** (sat din afara R17 și R18), din 21.09: oprire de 20–27 min la 23,7 km de EST pe 21–25.09;
     - drumul spre casă, la Lunga, fără oameni în satele R17.
3. §6.5 numără perechile (schimb, mașină). Pe septembrie, fără picioarele greșit etichetate ale lui 763LYY, **ture pe zi = 2**.
4. **Km: 41,3 (card v4.3) — ACORD.**
   - Pe urmă, de la oprirea din Prajila până la marginea EST: 713IZX D tur 41,8, D retur 41,8, EZ tur 40,2, EZ retur 39,5; 487NPL între 40,4 și 41,9. Mediana ~40,9, plus raza 0,6, dă ~41,5.
   - D ≈ EZ + 1,5 km, deci un singur card (§6.1).

**Poziția: 41,3 × 2 = 165,2 km/zi**, adică −82,6 km/zi față de × 3.

## H4 — capăt atins prin parcare sau cursă cu oameni

| rând | pe urmă (viteza reală) | poziția |
|---|---|---|
| **348KAJ Zarojeni** | Turul EZ oprește 99–397 s în Zarojeni, la 0,72 km de capăt, DUPĂ ce pleacă de acasă (Gura Căinarului, parcare de 5–6 h), apoi urcă oameni în Gura Căinarului: 5 zile din 5 (21–25.09), plus 17.09 s1. Parcarea e acasă, nu în capăt. Returul s2 nu atinge Zarojeni (0/5). | **IESE din H4** (clasa «capăt atins prin parcare»). Rămâne o notă: returul nu ajunge în capăt, deci km-ii cardului vin din tur (Q6). |
| **763LYY Prajila** | 0 opriri în Prajila în zilele lucrătoare din septembrie; «Lunga» e parcarea de acasă (2,46 km de capăt). Picioarele «R17» sunt R18 Zarojeni / Gura Căinarului sau Moara de Piatră. | **IESE din H4 ca rând R17**, dar NU fiindcă ar fi un serviciu R17 legitim, ci fiindcă nu e deloc serviciu R17. Corecția e în obs: relabel, vezi O2. Retrag formularea mea din r2, «face R17 cu oameni, pornește de la Lunga»: pe viteza reală, opririle «de la Lunga» sunt parcarea. |
| 412BRAY Heciul Vechi\* | 0 picioare în septembrie (runda 2) | iese (acord cu Codex) |
| 727CWN Sturzovca | buclele au trecut pe R11/R13 | iese (acord) |

## Matricea mea finală

| linie | poziția | față de runda 2 |
|---|---|---|
| Florești R16 | 36,5 × 2 (lanț v4.3) | aliniat cu Codex; retrag 35,7 (proba mea era în noduri) |
| Vărvăreuca R16 | 42,8 × 2 | aliniat |
| Trifănești R32 | 40,2 × 2 | aliniat |
| Sturzovca R27 | 23,9 × 2 | aliniat |
| Bocancea R36 | 53,3 × 1 | neschimbat |
| Nihoreni R3 | 44,2 × 2, un card | neschimbat; motivul corectat: D/EZ = poarta, nu grupa |
| Zarojeni R18 | 28,5 × 1 (28,9 acceptabil) | 27,7 → 28,5 (convenția `plinC`) |
| Prajila R17 | 41,3 × 2 | neschimbat; dovada: 763LYY nu e pe R17 |
| H4 | 348KAJ iese; 763LYY iese ca R17 cu relabel în obs; 412BRAY iese; 727CWN iese | cu dovada pe viteza reală |

## Observații (rubrica comună)

**O1 — medium, −1,0 (metodă, export-r3):** tăietura D/EZ din export compară porți diferite (EZ intră întâi pe VEST).
- La același punct și aceeași poartă, D și EZ diferă cu ≤ 0,4 km (tabelul de la Q5).
- Corecția: orice comparație pe grupe se face pe poarta cardului («poarta sensului»), nu pe «prima poartă atinsă».

**O2 — medium, −1,0 (candidat v4.3, etichete obs):** picioarele lui 763LYY etichetate «R17 Prajila» nu ating nicio localitate R17 în afară de casa lui (Lunga), prin parcare.
- Ce acoperă ele de fapt: serviciul R18 Zarojeni (07–18.09) și Moara de Piatră (21–25.09).
- Scenariu: dacă se păstrează așa, cardul Prajila iese × 3 (+82,6 km/zi), iar analiza săptămânală pune pe R17 curse fără sate R17.
- Corecția: turele Prajila = 2; picioarele 763LYY cu oprire în Zarojeni trec pe R18 Zarojeni; cele prin Moara de Piatră se clasifică separat, pe ruta satului.
- Rămâne medium doar cu × 2 adoptat. Cu × 3 ar fi high.

**O3 — low, −0,5 (întrebare pentru Ion):** Nihoreni pornește în realitate din Rîșcani-Vest, la 1,7 km dincolo de capăt, la ambele grupe (§4.1, excepția ION-110). La retur criteriul e îndeplinit doar parțial. Nu schimb cardul, ridic întrebarea.

**O4 — low, −0,5 (măsurătoare pe un sens):**
- Zarojeni: returul nu atinge capătul, iar cardul vine din tur (5 zile).
- Nihoreni și Prajila: returul se termină rar la ≤ 0,8 km de coordonata capătului.
- Corecția: §6.2 «ajunge la capăt în ambele sensuri» trebuie aplicat cu raza §4.2 (1,2 / 2,5 km), nu cu raza opririi (0,8).

**O5 — low, −0,5:** 348KAJ are urmă doar din 17.09. Faza B se vede doar prin 763LYY (15 și 18.09).

**Scor: 10 − 1,0 − 1,0 − 0,5 − 0,5 − 0,5 = 6,5. Blocante (high): 0.**
