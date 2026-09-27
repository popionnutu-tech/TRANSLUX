# Drăxlmaier — liniile fără km în schelet (R13 întâi): dezbaterea Claude + Codex, runda 1 (ION-111, 27.09.2026)

Ion: «lansează Claude Codex în găsirea soluției». Problema: R13 (Lazo – Hăsnășenii Noi – Dobrogea Veche) n-are km în ideal-v4.1
(activ, VPS `/root/lde-worker/drax/date/ideal-v4.1/`), deci 744ARF (care o face zilnic, recunoscută după opriri din ION-109) iese din
măsurare («linie fără etalon»). La fel R18 Putinești și R27 Iabloana (C31 în registrul verificatorului). Regulile (text 26.373, md5
56dfde04, după migr. 413): §6.1 scheletul liniei = un drum, tur = retur; §6.2 km = mediana zilelor BUNE (urma ajunge la capăt în ambele
sensuri, tur/retur ≤ 18 % unul de altul); §6.3 sursa septembrie ≥ 3 zile bune, altfel toată fereastra; §1.3 km-ii din act NU se folosesc.

## Faptele (obs-ideal.json v4.1, fereastra 04.05–17.07 + 01.09–25.09; curse-ideal.json)
R13 Hasnasenii Noi — 69 de observații:
| sens | schimb | n | plin median | din sept. | mașini |
|---|---|---|---|---|---|
| tur | s2 | 24 | 8,9 km | 8 | 744ARF 20, 293QVT/346KAJ/549RNK/727CWN câte 1 |
| tur | fără schimb | 11 | 10,5 | 2 | 744ARF |
| retur | s1 | 11 | 8,8 | 2 | 744ARF |
| retur | fără schimb | 23 | 10,5 | 8 | 744ARF 19 + 4 câte 1 |
Deci 744ARF face R13 în AMBELE sensuri, dar pe schimburi diferite ale aceleiași zile (sosește ~14:40 cu schimbul 2, pleacă ~15:40 cu
schimbul 1): perechea «pe același schimb» (etalon.mjs, candidatele) nu există niciodată → «nicio candidată». Săptămâna 14.09: tur zilnic
~06:05 (s1) cu 4–5 opriri de urcare în Hăsnășenii Noi (+ Dobrogea Veche), retur rar.
Curse brute care trec prin Hăsnășenii Noi (toată fereastra): 710CWN 118 de la poartă + 114 spre poartă (etichetat Dominteni — verificatorul
l-a pus pe lista «capăt atins prin parcare», Dominteni 45 %, «Lazo, Hăsnășenii Noi (R13)»); 744ARF ~89; 043BRAU 51; 727CWN 7.
R18 Putinești — 16 observații (tur s1 7: 397VKV, 804MUM; retur s1 4: 763LYY; …), 407 curse brute prin Putinești (348KAJ, 763LYY, 146BRAZ).
R27 Iabloana — 5 observații (441ASB, 348KAJ, 487NPL), 161 curse brute prin Iabloana (441ASB 121).

## Variante de discutat (nu e o listă închisă)
(V1) Pereche «încrucișată»: turul și returul aceleiași linii, aceeași mașină, aceeași zi, pe schimburi diferite = zi bună pentru etalon (§6.2
cu «aceeași zi» în loc de «același schimb»), dacă km-ii se potrivesc (≤ 18 %).
(V2) Etalon doar din tururi (tur = retur, §6.1) când linia n-are retururi — mediana plinului pe tururile cu opriri în satele liniei.
(V3) Reatribuirea curselor care deservesc satele R13 dar sunt etichetate pe altă linie (710CWN/Dominteni, 043BRAU) — clasa «capăt prin
parcare» (runda 2 ION-110: doar diagnostic, fără excludere automată).
(V4) Linia rămâne fără km, dar ziua mașinii se măsoară pe celelalte componente (R1a, R1b) fără R3 pe acea linie.

## Ce se cere
Pe V1–V4 (și altele): DA / NU / steag cu dovadă GPS; ce se schimbă în lanțul scheletului (`/root/lde-worker/drax/cod/ideal-v4.1/etalon.mjs`,
`alege.mjs`, `card-gps.mjs`), în analiza săptămânală (`drax/cod/economie/alternative.mjs:exclusDe`) și în textul regulilor (migrație);
cum se verifică (verificatorul, registrul C31). Scor după rubrica comună; high doar cu scenariu + dovadă.


## Răspunsurile părții Claude (runda 1) — verificator 5,0 (pe pachetul V1+V2; subsetul recomandat ≈ 8,5) · business 6,0 · analist 5,0 → Claude = 5,0
Convergență Claude: premisa documentului e FALSĂ (turul s2 și returul s1 cad în săptămâni diferite, după rotație; perechile pe același schimb există — 24 de zile, 8 în septembrie — dar cursele care pornesc/se termină acasă, în Bălți, sunt aruncate de filtrul de «tranzit» din etalon.mjs:104, același filtru reparat azi în analiza săptămânală, etichete.mjs). V1 NU, V2 NU, V3 doar diagnostic/comasare, V4 doar rezervă; V5 (filtrul relaxat în schelet ca în analiză) DA, cu control pe toate liniile și §1.4 prin migrație. R18/R27: fără km proprii (sate pe drumul altor linii: R22, R32, R17, R27 Danu). Întrebare deschisă: R13 Lazo 65,6 km/zi pe card, posibil dublat cu R14 al lui 710CWN.


---
### r1-business.md

# ION-111 runda 1: partea Claude (logica de business). Liniile fără km (R13 întâi, R18, R27)

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Regulile** le-am citit din bază: 26.373 de caractere, md5 `56dfde04…`.
- **Datele** sunt pe VPS, în `drax/date/ideal-v4.1` (`obs-ideal.json`, `curse-ideal.json`, `nomenclator.json`, `schelet-ideal.json`).
- **Codul** e `drax/cod/ideal-v4.1/etalon.mjs`.
- **Scripturile** sunt în `scratchpad/p111/c2…c8`, rulate pe VPS ca `/tmp/p111c*.mjs`.

---

## Faptul care schimbă problema: premisa «pe schimburi diferite ale aceleiași zile» nu se confirmă

**1. R13: 64 din 69 de observații sunt aceeași cursă numărată în ambele sensuri** (`rt: true`, același `t0` și `t1`). Sunt buclele
poartă → Hăsnășenii Noi → poartă ale lui 744ARF:
- bucla de 13:38–14:35 = «tur s2» (jumătatea care sosește în fereastră) plus «retur –» (jumătatea goală, care pleacă în afara ferestrei);
- bucla de 15:53–16:30 = «retur s1» plus «tur –».

**2. Nicio zi nu are tur și retur în fereastră** (0 din 35 de zile-mașină). Buclele **alternează pe săptămână**, nu în aceeași zi:
tur s2 în săptămânile 04.05, 01.06, 15.06, 29.06, 13.07, 21.09; retur s1 în 11.05, 22.06, 06.07, 31.08, 14.09. E rotația grupei EZ
(§2.3). Linia R13 Hăsnășenii Noi e «EZ: 1, D: 0» în act, cu 20 de locuri.

**3. Jumătățile care lipsesc există, dar etichetarea le aruncă.**
- Pe fereastră sunt 90 de curse ale lui 744ARF prin Hăsnășenii Noi, iar **58 n-au etichetă** în `obs-ideal`.
- Acestea sunt drumurile care pornesc sau se termină **acasă, în Bălți** (Dacia, 2,4 km de poartă). Exemplu, 14–18.09:
  - tur s1 05:04 acasă → Dobrogea Veche → Hăsnășenii Noi → poarta EST 06:04 (23,4–23,6 km);
  - retur s1 15:54 poarta EST → Dobrogea Veche → Hăsnășenii Noi → acasă.
  - Pe 14–17.09 niciuna nu e în `obs`.
- În săptămânile de schimbul 2: bucla tur s2 de la 13:38 plus returul s2 de la ~00:20 spre casă. Returul nu e etichetat.
- Cauza, în cod: `etalon.mjs:104`, `if (!grafic && !(c.dinP && c.spreP) && gol > plin) continue;`.
  - 744ARF nu e în graficul R13, unde actul are 043BRAU.
  - La turul de dimineață, golul acasă → Hăsnășenii Noi are ~14 km, iar plinul Hăsnășenii Noi → poartă ~9 km.
  - Hăsnășenii Noi e la 8,3 km de poartă, deci pentru o mașină care doarme în Bălți drumul gol e aproape mereu mai lung decât cel plin.

**4. Cu aceleași reguli (perechea pe ACELAȘI schimb, §5.1 / §6.2), dar cu jumătățile aruncate puse înapoi** (`c7.mjs`):
- 89 de picioare în ferestre;
- **42 de perechi zi × schimb, 38 de zile bune** (≤ 18 %), din care **12 în septembrie** (22 pe s1, 16 pe s2);
- **mediana plinului 8,9 km, tur 8,9 = retur 8,9.**
- Exemple: 13.05 s1, 8,8 / 8,8; 16.06 s2, 9,0 / 8,9; 22.06 s1, 9,0 / 8,9.
- §6.2 și §6.3 sunt îndeplinite **așa cum sunt scrise** (sursa septembrie, ≥ 3 zile bune).

**Concluzia:** R13 nu are o problemă de regulă, ci una de etichetare. Pe fiecare schimb există o pereche completă, dar jumătatea care
pornește sau se termină acasă, în Bălți, e aruncată.

## Pozițiile

### V1 «pereche încrucișată, aceeași zi»: **NU** (H-a)
- În date nu există nicio zi cu tur și retur în fereastră (0 din 35). V1 ar lăsa R13 tot fără candidate.
- În schimb, V1 ar schimba §6.2 pe toate cele 48 de linii. §6.6 arată că schimburile pot merge pe drumuri diferite (R27 Sturzovca: s1
  24,7 / s2 46,9), iar o pereche s1 + s2 care iese la ≤ 18 % ar amesteca două drumuri.
- Nu e nevoie de migrație pentru §6.2.

### V2 «etalon doar din tururi»: **NU ca regulă generală**; pentru R13 nu mai e nevoie (M-b)
- Pe R13, V2 ar da 8,9 km, dar V5 dă aceeași cifră fără să schimbe regula.
- Pe R18, V2 ar produce un etalon greșit.
  - 10 din cele 16 observații «R18 Putinesti» sunt tururile s1 ale lui 397VKV și 804MUM (04:5x → 06:1x) și retururile lor s2, cu plinul
    de 22,8 km.
  - Opririle lor sunt Pământeni, Bălți, Alexăndreni, Țiplești, Heciul Vechi, Biruința, **fără nicio oprire în Putinești**.
  - E șirul liniei R22 Țiplești: aceleași două mașini au 36 de observații R22 Țiplești, iar etalonul R22 Țiplești e 22,1 km.
  - V2 ar pune pe Putinești un etalon de 22,8 km luat din drumurile Țiplești.
  - Mecanismul etichetării greșite (probabil capătul atins «la ≤ 2,5 km» de la pornire, §4.2) nu l-am izolat; e de verificat.
- §6.2 cere textual ambele sensuri. V2 ar avea nevoie de o migrație, iar pe datele de azi ar fi greșită.

### V3 «reatribuirea 710CWN / 043BRAU»: **NU** (L-c)
- Hăsnășenii Noi e pe **drumul desenat al R14 Dominteni** (`sateDrum`: Petreni › Hăsnășenii Mari › Moara de Piatră › Lazo › Hăsnășenii
  Noi › Dobrogea Veche › Dobrogea Nouă) și pe cel al R13 Lazo (043BRAU, 16,4 km, 2 ture pe zi).
- Cursele lui 710CWN au capătul Dominteni (§4.2, cel mai depărtat start atins). Dacă ar fi mutate pe R13, aceiași km ar sta în două
  linii.
- Rămâne steag («urcă oamenii din Hăsnășenii Noi în R14 / R13 Lazo?»), ca diagnostic, după decizia din runda 2 a ION-110 (capătul prin
  parcare, fără reatribuire).
- 043BRAU e mașina din grafic a R13, dar pe linia Lazo, care trece prin Hăsnășenii Noi. Nu e o cursă a liniei Hăsnășenii Noi.

### V4 «linia fără km, ziua măsurată»: **NU**
- Fără km, lanțul săptămânal nu taie cursa: ea cade în livrare. Analistul a arătat asta în runda 1 a ION-109, iar ION-109 a găsit exact
  aceste zile ca «cursă probabil nedetectată».
- Dacă ziua ar fi măsurată, R1a ar conține km cu oameni. Asta contrazice §8.1 și §8.6 (după 413, ziua cu cursă nedetectată iese întreagă).
- `exclusDe` («linie fără etalon») rămâne cum e, pentru R18 și R27.

### V5 (propunerea mea): **DA**. Jumătatea care pornește sau se termină acasă, în zona Bălți, primește linia
- **Unde:** `etalon.mjs:104`. Cursa nu se mai respinge pentru «gol > plin» când capătul golului e în zona uzinei, adică pornirea turului
  sau sfârșitul returului la ≤ 3 km de porți sau de parc (aceeași zonă ca §5.3 a, §7.4 și `departeUz` din ION-109).
- **De ce doar atât:** relaxarea generală a regulii ar lăsa 710CWN (golul de la Dominteni) să intre pe R13, fiindcă R13 are acoperirea
  1,0. Condiția pe zona Bălți îl ține afară, pentru că pornirea lui e la Dominteni.
- **Ce iese:** R13 cu etalon ≈ 8,9 km din septembrie (12 zile bune), 1 tură pe zi (EZ, un singur schimb pe zi), 744ARF măsurat.
  - Detectorul ION-109 nu se mai declanșează pe aceste zile, pentru că cursa devine vizibilă.
  - Drumul acasă ↔ Hăsnășenii Noi devine livrare (R1a), ca în §7.4.
- **Aceeași excepție în `economie/etichete.mjs`.** Săptămânalul e o copie a logicii `alege()`; altfel apare din nou deriva din ION-110 M-a.
- **Fără schimbări** în `alege.mjs` și `card-gps.mjs`: iau zilele bune prin regula de acum.
- **Controlul pe toată flota (obligatoriu).**
  - Diferența de etichete v4.1 → v4.2 pe toate mașinile care dorm în Bălți: 435ASB, 144BRAZ, 186OMM, 804MUM, 297LVY, 397VKV.
  - Nicio linie cu etalon nu trebuie să se miște peste 5 %, iar R14 și R13 Lazo trebuie să rămână neschimbate.
  - În registrul verificatorului, C31 trebuie să iasă pentru R13 și să rămână pentru R18 și R27.
- **Migrația:** nu atinge §6.2. Atinge **§1.4**, care spune «R13 … n-are nicio cursă care să pornească din startul lor în GPS», fals
  după V5. Se adaugă o frază: «cursele care pornesc sau se termină la locul nopții din zona Bălți (≤ 3 km) nu se resping pentru că drumul
  gol e mai lung decât cel plin; R13 are etalon din ION-111; R18 și R27 rămân fără etalon».

### R18 Putinești și R27 Iabloana: **steag, rămân fără km**
- **R18:** în afara drumurilor Țiplești de mai sus rămân 763LYY retur s1 (4, mai–iulie, 18,4–18,5 km, opriri în Putinești și Lunga),
  731ARF 1 și 348KAJ 1 (fără nicio oprire în Putinești). Sub pragul §6.3 (≥ 3 zile bune).
- **R27:** 5 observații, 441ASB tur s1 de 2 ori, cu `kmCap` 11,5 / 12,5 față de un plin de 28–30 km (nepotrivire de verificat).
- De făcut: eticheta greșită «R18 ← R22» se repară la etichetare (vezi M-b). Linia rămâne pe steagul C31.

## Constatări cu deducere
- **H-a (high, −2): premisa documentului nu se verifică, iar V1 ar cere o migrație pe §6.2 care nu rezolvă nimic.**
  - Dovada: 0 din 35 de zile au tur și retur în fereastră; 64 din 69 de observații sunt dubluri `rt`; turul s2 și returul s1 cad în
    săptămâni diferite (rotația EZ).
  - Scenariul: se aplică V1 → §6.2 cu «aceeași zi» pe 48 de linii → R13 tot fără candidate, iar pe liniile unde schimburile merg pe drumuri
    diferite pot intra perechi amestecate.
  - Cauza reală (`etalon.mjs:104`) rămâne.
- **M-b (medium, −1): datele R18 sunt contaminate.** 10 din 16 observații «Putinești» sunt drumuri Țiplești (fără oprire în Putinești).
  Documentul le folosește ca date R18, iar V2 le-ar transforma în etalon.
- **L-c (low, −0,5): 710CWN e prezentat ca posibil deservent al R13.** În realitate, satul e pe culoarul R14 și al R13 Lazo (V3).
- **L-d (low, −0,5): «săptămâna 14.09: retur rar» e fals.** Returul s1 de la 15:54 e zilnic pe 14–18.09. E doar neetichetat, din aceeași
  cauză ca H-a.

## Scor

10 − (2 + 1 + 0,5 + 0,5) = **6,0 / 10**

**Direcția e corectă:** R13 trebuie să aibă km, iar R18 și R27 rămân cu steag.

**Mecanismul propus e greșit:** V1 și V2 schimbă regula pentru un defect de etichetare. Cu V5:
- controlul pe toată flota;
- aceeași excepție în `etichete.mjs`;
- migrația pe §1.4.

estimez ≥ 8,5.


---
### r1-analist.md

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


---
### verificator-raport.md

# ION-111 — liniile fără ideal (R13 Hasnasenii Noi, R18 Putinești, R27 Iabloana) — variantele V1 / V2 pe km GPS

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v10-1790525974` (sursa ideal-v4.1, schelet bfa070f0…, verdict 53d60821…, valid_pentru_export true, 5 explicate — identic cu v9).
Diagnosticul: `/root/diag-verif/fara-ideal.mjs` → `diag-fara-ideal.txt`. Km = plin + raza porții (EST 0,6 / VEST 0,5), ca `etalon-gps.mjs`. Nu am rescris nimic.
**Regulile:** textul după migr. 413 (md5 56dfde04…) **nu l-am primit** (în scratchpad există doar `reguli-drax-sim413.txt`, md5 518f41a0 — alt text). §-urile de mai jos sunt citate provizoriu după 62eace0d; cer fișierul 413 înainte ca judecata să fie folosită.
Cum numără verificatorul azi: zi bună = pereche (schimb, mașină, zi) cu tur ȘI retur, ≤ 18 % (`etalon-gps.mjs:59-66`); picioarele fără schimb nu intră; gemenii rt nu sunt pereche (C7).

## Ce dau V1 și V2
| linie | obs (sept) | V1 pereche încrucișată: zile · km | V2 din tururi: picioare / zile sept · km | tur vs retur (mediane) | dispozitive duble | ce e pe urmă |
|---|---|---|---|---|---|---|
| R13 Hasnasenii Noi | 69 (20), 64 rt | **0 zile → nedeterminat** | 24 / 8 · **9,5** (9,4–10,2) | 9,5 / 9,4 (1 %) | 0 | navetă 744ARF de la poarta EST: EST → Hăsnășenii Noi → EST, 19,4 km, ~55 min; 13:40 = tur s2 + dus gol, 15:53 = retur s1 + întors gol |
| R18 Putinești | 16 (10), 5 mașini | 1 zi → nedeterminat | 9 / 7 · **23,4** (toate 22,8 + 0,6) | 23,4 / 23,4 | 0 | **0/10 opriri la Putinești** (trece ≤ 1,2 km); opriri la Alexăndreni, Țiplești, Heciul Vechi, Biruința = serviciul R22/R21, de la Pământeni |
| R27 Iabloana | 5 (1), 3 mașini | 0 zile | 2 / 1 → **nedeterminat** (28,5 / 30,6) | 29,6 / 27,9 | 0 | oprire reală la Iabloana (441ASB 09.09), dar rar |

**Faptul sesiunii pe R13 nu se confirmă:** tur s2 (22 de picioare) și retur s1 (10 + 1) nu cad niciodată în aceeași zi pe toată fereastra — rotația: în săptămâna s2, 744ARF aduce schimbul 2; în săptămâna s1, duce schimbul 1 acasă. Fiecare picior cu oameni are geamănul lui gol în aceeași deplasare (32 de gemeni rt).

## Riscurile de verificare
- **V1** nu produce nicio zi bună pe cele trei linii. Dacă i se admit picioarele fără schimb, R13 primește 32 de «perechi» din gemenii rt (tur s2 8,8–9,6 cu dusul gol de 10,5–11,1: 16 % ≤ 18 %), adică o pereche din aceeași deplasare, cu un picior gol — exact ce interzice C7. În plus, C17/G1 (zi bună = pereche pe același schimb) și C28 (ture/zi pe (schimb, mașină)) își pierd sensul.
- **V2** e curat pe R13 (8 zile, dispersie 0,8 km, tur = retur pe mediană — §6.7), dar:
  (a) **R18: certifică o linie greșită** — 23,4 km din cursele R22 care doar trec pe lângă Putinești (§4.2 «trece ≤ 1,2 km» atinge capătul fără nicio urcare, §4.5);
  (b) km/zi nu e definit: la R13 e un singur picior cu oameni pe zi, iar §6.5 (2 × km × ture, ture din perechi) dă fie 0, fie 19 km/zi «cu oameni», din care jumătate goi;
  (c) C33/C18 (tur ≈ retur pe zi) nu se mai pot aplica; rămâne doar comparația pe mediane.

## Ce trebuie schimbat (propuneri; nimic scris)
- **În verificator** (sesiunea aprobă scriptul): ramura `metoda_etalon = tururi` în G1/C47 — etalonul = mediana tururilor cu schimb (sept ≥ 3 zile); C47 pe retururile cu schimb; tur vs retur pe mediane (≤ 18 %, «neconfirmat» sub 3 retururi); gemenii rt fără schimb excluși explicit; plus un control nou, **«urcare la capăt»**: la liniile cu etalon din tururi, oprire §4.5 la capăt în ≥ 50 % din picioare (R13 20/20 în sept — trece; R18 0/10 — pică).
- **În lanț / reguli:** o regulă de km/zi pentru navetele de la poartă (un picior cu oameni pe zi): propun km/zi = km × picioare cu oameni pe zi (R13: 9,5 km/zi cu oameni + 9,9 gol pe rută).
- **În registru:** R13 — dacă primește ideal prin V2, explicația C31 devine moartă (X1) și se șterge la re-semnare. R18 — C31 rămâne, cu motivul scris din nou: «cursele atribuite sunt serviciul R22 Țiplești (397VKV, 804MUM), fără oprire la Putinești». R27 — C31 rămâne (2 picioare).
- **V3** (reatribuirea 710CWN / 043BRAU): pe lista H4, 710CWN oprește în Lazo 52, Hăsnășenii Noi 30, Dobrogea Veche 23 — mai mult Lazo (linia R13 cu ideal, 16,4 km). O reatribuire trebuie să aleagă linia R13 după §4.2 (cel mai depărtat start atins), nu direct Hasnasenii Noi. Doar diagnostic, cum s-a hotărât la H4.

## High-uri (cu scenariu) și scorul
- **H1 — V2 pe R18 face ideal dintr-o linie greșită.** *Scenariu:* R18 Putinești primește 23,4 km și ture/zi din perechile 397VKV/804MUM; cardul crește cu ~47–94 km/zi, iar aceleași curse lipsesc din R22 Țiplești (1 tură GPS vs 2 în act). F2 pune economia pe o linie la care nu urcă nimeni; când R22 primește a doua tură, km-ii se numără de două ori.
- **H2 — V1 cu picioare fără schimb transformă gemenii rt în perechi.** *Scenariu:* R13 primește 32 de zile «bune» din deplasări unice; etalonul amestecă piciorul cu oameni (~9) cu dusul gol (~10,5), iar ture/zi = 1 declară oameni în ambele sensuri; C7 e încălcat fără ca vreun control să pice, pentru că G1 compară etalonul cu el însuși.
- Medium: faptul de pornire («ambele sensuri, aceeași zi», R13) e fals pe date; km/zi pentru navete nedefinit; regulile 413 lipsă.

**Scorul pachetului V1 + V2 așa cum e (10 − Σ; high −2 / −1,5, medium −0,5):** H1 −2 · H2 −1,5 · fapt greșit −0,5 · km/zi nedefinit −0,5 · reguli 413 neprimite −0,5 = **5,0 / 10**.
Varianta recomandată — **V1 respinsă; V2 doar pe R13, cu garda «urcare la capăt» și regula km/zi pentru navete; R18 și R27 rămân C31** — ar fi ~8,5.
