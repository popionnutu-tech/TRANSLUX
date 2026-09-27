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
