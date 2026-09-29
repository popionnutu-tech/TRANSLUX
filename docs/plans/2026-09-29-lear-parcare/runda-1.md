# ION-143 — LEAR Ungheni + LEAR Florești: locurile optime de parcare (runda 1)

## Cererea lui Ion (nu se dezbate)
Ion, 29.09.2026, după posterul Drăxlmaier «unde să stea mașina» (ION-140, parcarea propusă ION-136): «aplica pe pagina harta si lear cu
punctele optimale». Deci: aceleași locuri optime (P1 / P2) și pentru LEAR, pe pagina «Harta mașinii» și în raportul LEAR.
Reguli permanente ale lui Ion: km reali din GPS (nu geometria); doar km, nu lei; naveta șoferului nu se numără (LEAR, 24.09); drumul la
parcul Bălți = reparație, nu intră nicăieri (24.09); regulile LEAR R1 (doarme la uzină, rutele de 4 ori), R2 (mutarea rutelor), R3 (nu
pleacă acasă între schimburi) rămân cum sunt. La Drăxlmaier «rămâne la uzină» NU se propune (ION-120, doar Drăxlmaier); la LEAR a dormi la
uzină e chiar regula 1 a lui Ion, deci poarta e candidat.

## De ce nu se poate lua metoda Drăxlmaier ca atare
Drăxlmaier are ziua ideală (curse cu oameni pe zi, ancore E / S, legături GPS); LEAR n-are: analiza LEAR (lear-analiza.mjs) e pe etaloane
(R1 = 4 × etalonul rutei, R3 = 2 × etalon + casă → capete + uzină → capete) și nu taie ziua în curse. Deci munca LEAR se reconstituie
din urmă, cu ferestrele de ceas ale uzinei (lde_uzina_ferestre_ceas: tur s1 02:30–07:30, s2 11:00–14:30; retur s1 13:30–16:45,
s2 21:30–02:30; Florești tur s1 03:00–07:30, s2 11:00–16:30).

## Metoda (vps/lear-parcare.mjs; intrarea: `lear-analiza.mjs --dump`, opțional, nu schimbă nimic din raportul LEAR)
1. Munca: vizitele la poartă (≤ 0,7 km, lipite dacă pauza < 10 min).
   - tur = vizită cu SOSIREA în fereastră de tur; începe la ultima trecere ≤ 1,5 km de capătul uneia din rutele mașinii din săptămână
     (alese + comasate de lear-analiza) — punctul cel mai depărtat de poartă din acea trecere; fără trecere, punctul cel mai depărtat de
     poartă. Căutarea înapoi se oprește la vizita precedentă, la o staționare ≥ 60 min sau la 4 h.
   - retur = vizită cu PLECAREA în fereastră de retur; se termină la prima trecere pe lângă capăt (cel mai depărtat punct al ei), altfel cel
     mai depărtat punct; căutarea înainte se oprește la vizita următoare, la o staționare ≥ 60 min sau la 4 h.
   - atingerea scurtă a porții (< 60 min) în afara ferestrelor = cursă în plus pentru uzină, muncă; cea lungă = mașina stă la poartă (parcare).
2. Golurile: între două bucăți de muncă consecutive (bucățile suprapuse se lipesc). Golul ≥ 60 min e «drum de parcare» de la capătul E al
   muncii la începutul S al muncii următoare. Nu intră: golurile < 60 min (mașina n-are când să stea — rămân cum sunt, nici real, nici
   propus), cele > 20 h (weekend, pauză), cele prin zona parcului Bălți (≤ 3 km, reparație), cele care pleacă și vin la poartă (așteaptă la
   uzină). Ziua golului = ziua de lucru (03:00) a capătului E; doar zilele de lucru măsurate ale săptămânii (km > 20, ca lear-analiza).
3. Real = km GPS ai golului (salt > 5 km și deriva mașinii oprite nu se numără — kmPas din lear-timp-liber). Propus prin P =
   (V(E,P) + V(P,S)) × 1,05, V = Valhalla bus (matrice, cache pe disc).
4. Candidați: poarta LEAR, casa (unde doarme în zilele de lucru — casa din lear-analiza, din urmă), TOATE satele / orașele OSM la ≤ 15 km
   de un E / S (fără zona parcului Bălți).
5. Alegerea ca la Drăxlmaier (ION-136, Codex 10/10): cel mai bun loc unic; perechea doar dacă scade ≥ 20 km/săpt. și fiecare loc e folosit
   la ≥ 3 drumuri; preferința la scor apropiat (toleranță 20 km/săpt.): locul unde mașina deja stă ≥ 60 min > oraș > sat. Fiecare drum merge
   prin locul cel mai ieftin din cele alese.
6. Economia mașinii = max(0, Σ real − Σ propus) pe săptămână (zilele măsurate, fără aducere la 5 zile: la LEAR toate zilele sunt măsurate).
   Sub 0,5 km: «rămâne cum e», fără loc.

## Rezultatul săptămânii 21–27.09 (vps/rulare-21.09.txt; determinist — a doua rulare dă același fișier, doar `rulat` diferă)
LEAR Ungheni: 14 mașini, **−4.181,7 km/săpt.**, 12 cu două locuri.
827MUM 670,6 (Petrești; casa Fălești, rute A6 Bulhac + B5 Todirești: la prânz poartă → Fălești → Todirești 94 km, propus 21) ·
807MUM 592 (Todirești + poarta) · 189OMM 500 (Unțești + Sculeni) · 809MUM 391 (Unțești + Lucăceni) · 217RST 363 (Fălești + poarta) ·
061COY 324 · 320BRAT 297 · 537BRAT 236 · 032BRAT 208 · 183BZP 190 · 732SHS 166 · 145BRAZ 123 · 456BRAX 117 · 504BRAR 3 (Ungheni, deja
doarme lângă poartă).
LEAR Florești: 6 mașini, **−963,3 km/săpt.**: 894BRAX 330 (Pohoarna + Vărăncău) · 849BRAN 224 · 279BRAT 211 · 035BRAT 161 · 603BRAS 37 ·
713IZX fără loc (niciun gol ≥ 60 min).
Pentru comparație, raportul LEAR Ungheni 21.09 (lde_analiza_reguli): R1 total 194.257 lei/lună, R3 184.547 — pe etaloane, nu pe urmă.

## Probe și semne de întrebare (vps/rulare-21.09.txt, `stat` pe mașină)
- Bucăți fără capăt (tur / retur care nu trec pe lângă capătul niciunei rute): 145BRAZ 23 din 46, 456BRAX 22 / 45, 504BRAR 22 / 34,
  320BRAT 22 / 34, 035BRAT 12 / 24, 809MUM 11 / 30 (retur Frăsinești 14:48–15:33, apoi înapoi la poartă 16:12 și acasă la Lucăceni 17:19 —
  a doua «retur» pleacă în fereastră, deci e socotită muncă; golul serii pornește de la Lucăceni, iar drumul poartă → Lucăceni nu intră).
  Rămân socotite muncă — prudent (economia iese mai mică), dar pot ascunde o cursă goală.
- 189OMM: 24 de atingeri scurte ale porții în afara ferestrelor (drumul rutei A5 trece pe lângă poartă) — tăiate ca «curse în plus».
- Golurile de la 04:00 poartă → capăt (809MUM doarme la poartă, pleacă la 03:32 spre Frăsinești) intră ca drum de parcare de 1,2 h.

## Afișarea (după verdict)
- VPS: `lear-parcare.mjs` scrie `date.parcare` în rândul LEAR (lde_analiza_reguli) cu validarea comună (peste real, nefinit, două locuri
  neeligibile, drum fără loc) și `lear-harta.mjs` scrie lde_harta_zi (uzina LEAR_UNGHENI / LEAR_FLORESTI): urma zilei tăiată pe tur / retur
  (cu oameni) / gol / la poartă, opririle ≥ 5 min, casa, P1 / P2 și drumurile propuse. Pașii intră în lear-saptamanal.sh (luni 08:00),
  după lear-analiza și înaintea albumului; picat = nu scrie, restul merge.
- Panou: /lde/harta?uz=ungheni|floresti|drax (implicit drax), scheletul LEAR (public/lde/schelet.json, schelet-floresti.json) sub urmă;
  raportul LEAR (/lde/reguli, ?uz=floresti) cu blocul «Parcarea propusă» (mașina, acum stă, P1 / P2, km/săpt.), link «pe hartă».
- Posterul: la LEAR albumul are deja posterul «cât se putea economisi» (R1 / R3). Propunere: NU un poster nou; în rândul fiecărei mașini din
  posterul LEAR existent nu se adaugă nimic acum — întrebare pentru dezbatere (vezi 5).

## Întrebări
1. Tăierea muncii pe ferestre + capete: corectă și prudentă? Ce facem cu bucățile fără capăt (le lăsăm muncă, le scoatem, steag)?
2. Pragul golului de 60 min: drumurile mai scurte nu intră deloc — corect? (Drăxlmaier le lua pe toate > 1,5 km, cu ideal + ocol.)
3. Real = km GPS întregi ai golului (include orice hoinăreală din gol); propus = Valhalla × 1,05. E corect ca economia să conțină și
   hoinăreala din gol (timp liber / brambura, pe care lear-timp-liber le numără separat)? Alternativă: real = V(E, locul unde stă acum) +
   V(locul, S) (modelul pe ambele părți).
4. Poarta ca loc de parcare la LEAR (R1 al lui Ion) — da; parcul Bălți exclus. Casa candidat obișnuit.
5. Posterul LEAR: rândul cu locul optim (ca Drăxlmaier) sau doar paginile? Ion a cerut «pagina hartă și LEAR».
6. Relația cu R1 / R3 din raportul LEAR (cifre diferite, pe etaloane): cum le arătăm fără să se contrazică?
