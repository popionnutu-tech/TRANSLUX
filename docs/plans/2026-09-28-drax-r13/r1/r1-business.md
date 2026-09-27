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
