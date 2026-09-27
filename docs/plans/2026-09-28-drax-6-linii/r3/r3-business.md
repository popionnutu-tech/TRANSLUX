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
