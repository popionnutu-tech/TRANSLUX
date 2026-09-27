# ION-112 runda 7: R3 Nihoreni, partea Claude (logica de business)

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Reguli:** `lde_uzine.reguli_livrare` pentru id = DRAXELMAIER_BALTI, md5 `ce930b08d4d14ddd26db0dd8398a1cdb` (verificat azi), 27.835 de caractere.
- **Date:** `export-r3.json`, `export-r5-nihoreni.json` și urma brută `urma-186.mjs`, rulată azi pe VPS (`drax/p112-u186.mjs`).
  Am urmărit 186OMM pe turul din 22.09 și pe returul din 23.09; viteza e în noduri × 1,852, km-ul e cumulat pe urmă.

## Faptul care schimbă discuția: r3 NU tăia bucla
Pe urma lui 186OMM din 22.09, tur D:

| ora | km pe urmă | distanța până la capăt | ce e |
|---|---|---|---|
| 04:02 | 0 | 30,6 km | pleacă gol din Bălți |
| 04:49–05:04 | 40,7 | 1,7 km | **stă 15 minute**, fără altă mișcare (47.9504, 27.5452) |
| 05:13 | 43,6 | 1,3 km | prima urcare, în Nihoreni (47.9289, 27.5670) |
| 05:16 | **45,0** | 0,0 km | oprire în capăt |
| 05:17–05:30 | 45,5–51,4 | 0,5–3,2 km | 12 opriri în Rîșcani: **bucla**, circa 7,4 km pe urmă |
| 05:32 | 52,4 | 1,1 km | trece iar pe lângă Nihoreni |
| 06:11 | ~90,4 | — | poarta EST |

Unde taie fiecare export:
- **r3** taie la oprirea din capăt (≤ 0,8 km): 90,4 − 45,0 = **45,4**. Bucla stă între capăt și poartă, deci r3 o numără.
- **r5** taie la prima oprire din zona de 4,5 km: 90,4 − 40,7 = **49,7**. Numără în plus așteptarea de 15 minute și drumul de 4,3 km de acolo până la capăt.
  Din acești 4,3 km, doar ~1,4 km au oameni (de la urcarea de la 05:13).

Același tipar pe toată luna: în zilele măsurate de ambele exporturi (09.09 și 22.09), r5 − r3 = **4,3 km** de fiecare dată.

Returul din 23.09 arată la fel, în oglindă:
1. pleacă de la poartă;
2. coboară oamenii în bucla din Rîșcani, 16:36–16:45, la 39–43 km pe urmă;
3. oprește în capăt la 16:50, la 46,0 km;
4. mai oprește la 1,3 km dincolo de capăt la 16:54 și pe locul așteptării de dimineață la 16:59;
5. **stă 7 minute** la 3,8 km de capăt, 17:04–17:11;
6. pleacă gol spre Bălți.

r5 taie retururile după această staționare de 7 minute (53,3), iar r3 le taie la oprirea din capăt (44,75).

Staționările de 15 și de 7 minute nu sunt urcări: §5.1 numește urcare doar oprirea de 30 s – 5 min. În plus, ambele sunt DINCOLO de capăt,
iar §4.1 definește linia ca drumul de la capăt până la poartă.

## (1) Bucla prin Rîșcani face parte din linie?
**DA, și e deja în card.**
- Rîșcani e sat al rutei în act, cu 43 din 66 de angajați.
- Pe tur și pe retur, bucla are opriri scurte, între capăt și poartă, deci intră în linie prin §4.1.
- §5.1 și §4.1 scot orașul Rîșcani doar ca **loc de capăt** și ca sat pentru promovarea turului. Nu scot km-ii dintre capăt și poartă.
- **Capătul rămâne Nihoreni.** Rîșcani e oraș din lista §5.1, deci nu poate fi capăt (§4.1).

## (2) Cardul: **44,2 × 2** rămâne (176,8 km/zi), dar cu justificare nouă
- **Regula:** §4.1 (de la capăt la poartă), §6.2 (mediana) și convenția tuturor celorlalte 48 de linii: km-ul se ia de la oprirea din capăt și i se adaugă raza porții (~0,65).
  - D tur: 45,1 + 0,65 = 45,75, cu bucla inclusă.
  - EZ tur: 42,1 + 0,65 = 42,75.
- **Media grupelor e metoda corectă** (o pereche D și o pereche EZ pe zi, în 16 din 20 de zile, §6.5):
  - (45,75 + 42,75) / 2 = **44,25**;
  - 2 carduri pe grupă dau 177,0 km/zi, iar cardul comun dă 176,8.
- **Propunerea 46,4 (185,4 km/zi) cade:** folosește cifrele 49,4 și 53,3 ale lui r5, adică staționări de peste 5 minute dincolo de capăt. Ar fi derivă de formulă față de celelalte 48 de linii.
- **Singurul rest real e urcarea de la 1,3 km dincolo de capăt** (05:13 pe tur și 16:54 pe retur, în Nihoreni).
  - Dacă se numără de acolo, D devine ~46,8 + 0,6, iar cardul ~44,9 (+1,6 %), în toleranța §6.4.
  - Capătul se mută acolo doar prin excepția §4.1, care cere «la mai multe mașini». Aici e o singură mașină D, deci nu se aplică.

## (3) Textul §6.6 (înlocuiește fraza despre Nihoreni din 417 `$n4$`)
«Diferența dintre grupe (D / E+Z) NU face card pe schimb, pentru că grupele se rotesc săptămânal între schimburi (§2.3). Unde grupele merg pe drumuri diferite ale aceleiași linii și linia are zilnic câte o pereche din fiecare grupă, cardul = media km-ilor grupelor, măsurați la fel pentru ambele: de la oprirea din capăt la poartă (§4.1), mediana (§6.2), plus raza porții. Astfel 2 × card × ture dă aceiași km pe zi ca două carduri. R3 Nihoreni: grupa D intră pe poarta EST și face între capăt și poartă o buclă de ~7 km, cu opriri, prin Rîșcani (sat al rutei, 43 din 66 de angajați; 186OMM, 22.09, 05:17–05:30), tur 45,1; grupa EZ intră pe poarta VEST, fără buclă, tur 42,1; cardul este 44,2 × 2 (176,8 km/zi; două carduri: 177,0). Staționările de peste 5 minute dincolo de capăt (așteptarea de dimineață, 04:50–05:04; oprirea de 7 minute după retur) nu fac parte din linie (§5.1).»

## Deduceri
- **H1 (high, −2).** Propunerea sesiunii, 46,4 × 2, se bazează pe tăietura r5: zona de 4,5 km, fără limită de durată a opririi.
  - Scenariu: dacă se sigilează, linia primește +8,6 km/zi (185,4 față de 177,0), adică km fără oameni scriși ca livrare cu oameni.
  - Cifrele r5 de 49,4 și 53,3 nu se folosesc; exportul r5 trebuie refăcut cu oprirea de 30 s – 5 min.
- **M1 (−1).** Premisa rundei, «r3 tăia bucla (44,6 / 45,0)», e falsă pe urmă. Raportul v15 și runda-7.md trebuie corectate în acest punct.
- **L1 (−0,5).** Plinul lanțului pe D tur e bimodal (38 / 52), deci nu poate fi control pentru această linie. EZ retur are 7 picioare cu oprire din 19; din cele 9 retururi ale lui 457BRAX, doar 3.
- **L2 (−0,5).** Urcarea de la 1,3 km dincolo de capăt: de lămurit dacă `capatC` e pus bine (de verificat la EZ).

## Scor: 10 − 4 = **6 / 10**
