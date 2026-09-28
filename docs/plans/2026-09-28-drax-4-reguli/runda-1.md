# ION-120 — cele 4 reguli de optimizare Drăxlmaier: dezbaterea Claude + Codex, runda 1

Ion, 28.09.2026: «hai să punem 4 reguli optimizare: 1. Auto la capăt de rută rămâne dacă ruta se termină în aceeași localitate; 2. Auto rămâne la uzină;
3. Rutele împărțite altfel; 4. Nu pleacă acasă între schimburi. Lansează Claude Codex în dezbatere pentru a optimiza și oferi live aceste 4 reguli cu
optimizări propuse.» Regulile permanente ale lui Ion: km reali din GPS, nu geometrie (Valhalla doar pentru drumul PROPUS, care nu există pe urmă); verifică
toată flota; nu întreba ce arată datele; simplu; km, nu lei (Ion 27.09, la mașina mică: «km only is ok»).

## Ce există azi (reguli_livrare DRAXELMAIER_BALTI după migr. 417, md5 8c6ad18b; worker VPS drax/cod/economie/{categorii,alternative}.mjs)
- Regula B = R1a + R1b + R3 (§8.1). Săptămâna 14–20.09 (ideal-v4.3, după ION-115): pe zi-mașină R1a 30,6 · R1b 17,1 · R3 0 · B 47,7; pe zi lucrătoare pe flotă
  (extrapolare) R1a 1.156 · R1b 645 · R3 0.
  - R1a = marginile zilei (casă → prima cursă, ultima cursă → casă), «șofer din satul de start sau mașina doarme la capăt» — cost de azi, NU în indicații (§12.1).
  - R1b = ocolul pe acasă între curse care nu-s perechea aceluiași schimb = cât lungește casa drumul pe șosea (ION-115, §5.2) — în indicații.
  - R3 = între turul și returul aceleiași perechi, km din AFARA zonei uzinei, doar în zilele cu o singură pereche SAU pe liniile > 30 km, plafonat la drumul
    dus-întors până la cea mai lungă oprire ≥ 20 min (§8.3). Pe 14.09: 0 (golTure 916 km, dar 0 eligibili).
- §8.4: A («doarme lângă uzină, 4 drumuri pe rută», LEAR R1) NU se aplică: ar adăuga 28 km/zi-mașină.
- §8.5: realocarea rutelor (LEAR R2) NU se propune: net ≈ 550 km pe 31.08–25.09 (câștig ≈ 3.200, pierderi ≈ 2.700 la 9 mașini); pe 14.09: R2 net 143,9 (brut 661,6, pierderi 517,7).
- ION-119 (în lucru, azi): drumul VEST ↔ EST devine «cursă între uzine», nu gol (≈ 2.750 km/săpt. scoși din gol).

## Cele 4 reguli ale lui Ion — ce trebuie hotărât
R-1 «Auto la capăt de rută rămâne dacă ruta se termină în aceeași localitate»: citirea propusă — când cursa se termină într-o localitate (returul la capătul X)
și următoarea cursă a mașinii pornește din ACEEAȘI localitate X (turul de dimineață următoare, sau turul schimbului următor), mașina rămâne la X (nu merge
acasă și înapoi). Economie = km reali ai drumului X → casă → X (sau X → altundeva → X) din urmă. Întrebări: (a) doar noaptea (R1a cu «doarme la capăt»), doar
între schimburi, sau ambele? (b) «aceeași localitate» = satul capăt al liniei sau orice sat al rutei? (c) ce se întâmplă cu șoferul (navetă §5.10)?
R-2 «Auto rămâne la uzină»: citirea propusă — între turul și returul aceleiași perechi (și/sau între două curse cu capăt la uzină), mașina așteaptă lângă uzină
(parc / porți) în loc să plece. Economie = km reali ai intervalului din afara zonei. Întrebări: se scot restricțiile §8.3 (o pereche / linii > 30 km)?
unde e pragul de timp sub care are sens (durata așteptării)? ce facem cu A (§8.4)?
R-3 «Rutele împărțite altfel»: realocarea liniilor între mașini (casa șoferului / locul nopții mai aproape de capătul liniei, turele compatibile). Economie =
km goi azi − km goi pe atribuirea propusă (Valhalla pentru drumurile propuse). Întrebări: net (câștig − pierderi) sau doar mutările cu câștig? rotația
săptămânală (§2.3)? capacitatea mașinii (50/27/20 locuri — tipul de lângă plăcuță, ION-114)? ce propunere concretă pe pagină («linia X de la mașina A la B»)?
R-4 «Nu pleacă acasă între schimburi»: citirea propusă = R1b (ocolul pe acasă între curse, ION-115) — sau TOT drumul pe acasă între schimburi, nu doar ocolul?
Întrebare: unde așteaptă atunci — la capăt (R-1) sau la uzină (R-2)? cum se împarte între R-1/R-2/R-4 ca un km să nu fie numărat de două ori?

## Cerințe comune
- Fiecare regulă: definiția pe urmă, formula km/săpt. pe mașină, propunerea concretă (ce face dispecerul), probă pe toată flota (14.09), fără dublă numărare
  (ordinea regulilor sau atribuirea fiecărui km unei singure reguli).
- Pe pagină: «4 reguli de optimizare» — pe flotă și pe mașină, km/săpt., propunerea în limbaj simplu.
- Nu se schimbă scheletul; rularea automată de luni rămâne oprită.
