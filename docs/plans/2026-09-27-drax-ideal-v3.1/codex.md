## 1. R6 Mihăilenii Vechi — păstrăm „orice poartă”: 54,9 km × 1 tură

**Nu aprob trecerea la 58,0 km.** Corectăm separat determinarea porții sensului, fără schimbarea automată a metodei aprobate.

[diag-r6.txt](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/diag-r6.txt) confirmă:

- **54,9 km pe 17 zile-pereche**, orice poartă; **58,0 km pe numai 5 perechi**, EST–EST.
- La 54,9: C47 **19/24 = 79%** pe poarta configurată și **34/39 = 87%** pe orice poartă.
- Cele **17 picioare mutate ale lui 345KAJ**, pe **10 zile**, au **zero km cârpiți**, conform [mutari.md](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/mutari.md).

**58,0 nu reprezintă recalcularea cu turul pe VEST.** Este rezultatul porții EST preluate din candidatele desenate. Din rândurile diagnosticului am numărat **15 tururi VEST și 5 EST** după selecția pe zi/schimb/mașină; raportul **18/23** din întrebare nu poate fi verificat direct din această listă agregată. Cele **12 perechi VEST–EST** afișate dau orientativ **54,8 km**, calculat din valorile rotunjite; acesta nu înlocuiește rularea metodei comune.

**Ce s-ar strica altfel:** 58,0 ar introduce **+6,2 km/zi** față de 54,9, printr-o selecție nereprezentativă a porții. Păstrăm **109,8 km/zi, fără steagul vechii atribuiri**, deoarece cauza acelui steag a fost corectată.

**Încredere: ridicată.**

## 2. R19 Copăceni — deplasare repetată demonstrată; a doua tură R19 încă nedemonstrată

**Nu aprob încă 32,8 × 2 ture ca serviciu R19 confirmat. Păstrăm provizoriu cardul v3: 32,7 × 1, cu steag de atribuire.** Nici afirmația „sigur face R33 pe alt drum” nu este demonstrată.

Am recalculat din [mutari-v31.json](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/mutari-v31.json):

- **60 picioare**, dintre care **55 cu schimb**, pe **44 zile**; mediana **32,8 km**.
- **58** au scorul de **4 sate în ordine**, două au scorul 3; toate au **zero km cârpiți pe partea cu oameni**.
- În septembrie: **27 picioare**, **25 cu schimb**, **11 perechi complete** între picioarele mutate. Acestea sunt perechi brute, nu certificarea tuturor filtrelor metodei comune.

Este o mișcare regulată, nu un accident GPS. Dar [etalon.mjs:70](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/vps/cod/etalon.mjs:70) verifică un subșir de apropieri cu distanțe descrescătoare față de poartă; nu verifică serviciul comandat, îmbarcarea sau întregul itinerar în ordinea contractuală.

[compara-v3-v31.md:23](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/compara-v3-v31.md:23) confirmă saltul **65,4 → 131,2 km/zi, adică +65,8**. Simultan, R33 Iezărenii Vechi păstrează **69,4 km/zi**.

**Ce s-ar strica altfel:** putem transforma alternanța sau comasarea serviciilor într-o tură zilnică suplimentară. Nu afirm dublarea aceleiași curse; trebuie reconciliate **ziua, schimbul, dispozitivul și graficul**, împreună cu opririle reale. Picioarele rămân vizibile în diagnostic.

**Încredere: ridicată pentru mișcarea repetată; medie pentru identitatea serviciului.**

## 3. Golurile la margine — nu prelungim automat piciorul de la poartă

**Nu. Cârpim numai după demonstrarea continuității aceleiași curse între două puncte GPS reale.**

[goluri-prag.json](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/goluri-prag.json) confirmă **302 goluri de margine**, **2.591,1 km pe dreaptă**, dintre care **65 peste două ore**, plus **100 în afara curselor**. Clasificarea „margine” înseamnă doar că un capăt temporal coincide cu limita unei curse, conform [goluri-prag.mjs:40](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/vps/cod/goluri-prag.mjs:40).

Acești **2.591,1 km nu sunt kilometri cu pasageri dovediți**. Pentru fiecare recuperare trebuie stabilite continuitatea dispozitivului, sensul, traversarea porții și absența unei curse intermediare; apoi refăcute segmentarea și atribuirea. Cele 65 de intervale lungi cer diagnostic individual.

**Ce s-ar strica altfel:** am putea lega două servicii distincte, include deplasarea la garaj în partea cu oameni sau atribui cursa altui schimb. O poartă presupusă nu poate înlocui punctul GPS lipsă.

**Încredere: foarte ridicată.**

## 4. Picioarele puternic cârpite și capetele sintetice — le excludem din etalonul decisiv

**Da. Excludem perechea dacă unul dintre sensuri are capătul susținut numai de cârpire sau depășește pragul de 30% pe partea cu oameni. Păstrăm observațiile pentru diagnostic.**

[carpire-statistica.md](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/carpire-statistica.md) raportează:

- **64 picioare cu steag**, dintre care **52 cu schimb**;
- **98 cu capăt pe cârpire**, dintre care **81 cu schimb**.

**Nu adunăm aceste categorii:** intersecția nu este raportată.

Există și o corecție necesară a definiției: [carpire.mjs:98](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/vps/cod/carpire.mjs:98) calculează steagul pentru **întreaga cursă**, iar piciorul îl moștenește. Pentru etalon trebuie evaluat și **`plinCarpit / plin`**; procentul întregii curse poate ascunde o parte cu oameni predominant reconstruită.

Aplicăm aceeași eligibilitate la perechi, selecția zilei și C47, raportând separat observațiile excluse. Dacă rămân sub trei perechi bune, aplicăm rezerva cu garda comună; dacă nu ajunge, cardul vechi cu steag.

**Ce s-ar strica altfel:** traseul estimat de Valhalla poate inventa atingerea capătului, iar aceeași estimare ajunge să valideze etalonul. C47 nu mai constituie o confirmare independentă.

**Încredere: ridicată; efectul numeric după excludere trebuie recalculat.**

## 5. R36 Bocancea Schit — redeschidem analiza, păstrăm steagul

**Nu scoatem steagul. Cardul rămâne 54,5 km × 1 tură = 109 km/zi.** Noua probă slăbește argumentul pentru 46,2, dar nu rezolvă atribuirea drumului lung.

[compara-v3-v31.md:62](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/iesiri/compara-v3-v31.md:62) confirmă **46,2 → 54,0 km**, adică **+7,8 km, aproximativ 16,9%**. Diferența față de card este numai **0,5 km, aproximativ 0,9%**.

Dar statistica arată **704,4 km cârpiți cumulat**, **51 picioare cu schimb pe curse cârpite**, **14 cu steag** și **3 cu capăt pe cârpire**. Cei 704,4 km reprezintă lungimea segmentelor reconstruite, nu creșterea netă a kilometrilor și nici exclusiv populația etalonului din septembrie.

[Verdictul anterior](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-97-translux-draxlmaier-ideal-v3-c/docs/plans/2026-09-27-drax-ideal-v3/verdict-v3.md) reține **8 din 9 retururi nocturne pe drumul lung** și **zero perechi pe drumul scurt**. Posibila comasare prin Bilicenii Vechi rămâne nelămurită.

**Ce s-ar strica altfel:** apropierea unei valori reconstruite de card ar fi confundată cu demonstrarea serviciului. Scoaterea steagului cere etalonul recalculat după filtrul de la întrebarea 4 și reconcilierea drumului lung.

**Încredere: ridicată.**

## Riscuri pe care Claude probabil nu le vede

- **Cârpirea poate schimba ruta, nu doar kilometrii.** Apropierile sintetice intră în `atinse`, `laCapat` și `sateInOrdine` fără excluderea marcajului `carpit`. Un drum calculat poate astfel produce propria justificare pentru reatribuire. Fișier: [etalon.mjs:57](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/vps/cod/etalon.mjs:57).
- **Cache-ul vechi poate păstra autoritate fără observație actuală.** `ramane` acceptă candidata când observația lipsește (`!o`); porțile sunt apoi calculate din candidatele desenate. Absența probei nu trebuie să valideze candidata. Fișier: [alege.mjs:58](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/vps/cod/alege.mjs:58).
- **„Ture/zi” poate număra zile cu un singur sens.** După calificarea mașinii/schimbului prin minimum trei perechi, numărătoarea zilnică include și înregistrările fără ambele sensuri. Dublarea R19 trebuie verificată explicit pe perechi complete. Fișier: [etalon.mjs:161](/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-99-translux-draxlmaier-ideal-v3-1/docs/plans/2026-09-27-drax-ideal-v3.1/vps/cod/etalon.mjs:161).