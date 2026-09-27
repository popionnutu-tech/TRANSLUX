# ION-112 — runda 2: candidatul ideal-v4.3 cu mutările convenite, și cifrele MĂSURATE de lanț

Runda 1: Claude verificator (≈ 8,5 cu pozițiile lui) / business 6,0 / analist 6,5; Codex: rezultat invalid de două ori (deducere-placeholder),
poziția reală din rezumat: acceptă DIRECȚIA mutărilor (518MHD → R16, buclele 727CWN afară din R27, Putinești legitim pe R32), dar cere
cifre reproduse din lanț, pe aceleași perechi și aceeași metodă, cu grupele D/EZ separate, înainte să accepte cardurile noi.

## ideal-v4.3 (VPS `/root/lde-worker/drax/date/ideal-v4.3/`, cod `.../cod/ideal-v4.3/etalon.mjs`, nesigilat încă)
Schimbarea față de v4.2 (doar pe perechile (mașină, rută) convenite; regula generală pe toată flota a mutat 238 de picioare, multe dubioase —
414ASB Ciuciulea → Cobani, 146BRAZ Trifănești → alte linii —, deci a fost RESTRÂNSĂ):
1. pentru 727CWN pe R27 și 348KAJ pe R18: linia aleasă fără NICIO oprire în satele ei pe partea cu oameni cedează liniei candidate cu ≥ 2 opriri
   sau cu o oprire la capătul ei;
2. decizie de grafic pentru 518MHD (verdict-v3: «518MHD are R16 pe ambele schimburi»): cursele lui etichetate R32 devin R16.
Picioare mutate: 205 din 13.695 — 518MHD R32 → R16 Florești 64, R16 Vărvăreuca 57; 727CWN R27 → R11 Limbenii Noi 24, R13 Hăsnășenii Noi 10,
alte 5; 348KAJ R18 → R32 Trifănești 24, R21 8, R22 7, alte 7.

## Cardurile măsurate de lanț pe v4.3, FĂRĂ deciziile celor 6 linii (copie /tmp/ideal-v4.3-fara-decizii, card-gps.mjs)
| linie | card azi (decizie) | măsurat pe v4.3 | observație |
|---|---|---|---|
| Florești R16 | 35,7 × 1 | 35,7 × 1 (16 zile, C47 100 %) | decizia «poarta sensului» nu mai e necesară; ture/zi 1 — dar 518MHD face 2 perechi/zi (verificator, business) |
| Vărvăreuca R16 | 42,8 × 2 | 42,0 × 3 | primește picioarele 518MHD care opresc la Vărvăreuca: e corect sau sunt tot Florești? |
| Trifănești R32 | 40,2 × 2 (fără 518MHD prin decizie) | 40,2 × 2 (19 zile), fără decizie | 518MHD scos structural |
| Sturzovca R27 | 24,9 × 3 | 23,9 × 3 (15 zile, C47 64 %) | km-ii se aliniază (23,5–24,0); turele rămân 3 — D face 2? |
| Bocancea Schit R36 | 54,5 × 1 | 53,3 × 1 (doar 4 zile în sursă, C47 95 %) | business/analist 53,3–53,4; verificatorul 54,5 |
| Nihoreni R3 | 44,2 × 2 | DIAGNOSTIC: porți divergente (poarta sensului 42,3 / orice poartă 45,8) | verificator: etalon pe grupă D 51,8 / EZ 42,6; business/analist: 44,2 |
| Zarojeni R18 | 28,9 × 2 | DIAGNOSTIC: C47 35 % | Zarojeni deservit doar pe s2 (business, minut cu minut); retururile se termină la Gura Căinarului (analist) |
| card flotă | 5.789 | 5.862 fără cele 6 decizii / 5.870 cu ele | — |

## Întrebările rundei 2 (pe fiecare, poziția DA/NU/alt număr, cu dovadă)
Q1 Florești: 35,7 × 2 (518MHD 2 perechi/zi) — și picioarele la Vărvăreuca: Florești sau Vărvăreuca?
Q2 Trifănești: 40,2 × 2 fără decizie — închidem steagul?
Q3 Sturzovca: 23,9 — × 2 sau × 3?
Q4 Bocancea Schit: 53,3 (sursa septembrie, 4 zile) sau 54,5 (card vechi)? regula §6.3 cere ≥ 3 zile bune în septembrie.
Q5 Nihoreni: un card (44,2 sau media 47,2) sau câte un etalon pe grupă (D 51,8 / EZ 42,6)?
Q6 Zarojeni: 1 tură (doar s2), card pe tur (29,0) sau pe sens; ce se face cu retururile care se termină la Gura Căinarului?
Q7 lista «capăt prin parcare» după v4.3.
Scor după rubrică; high doar cu scenariu + dovadă. Scopul: aceleași poziții la toate părțile.
