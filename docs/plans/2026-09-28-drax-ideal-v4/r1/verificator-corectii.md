# Corecții PROPUSE — dezbaterea ideal-v4, runda 1 (nimic scris; toate în dosare noi, niciodată pe loc)

1. **v4.1 — cache-ul candidatelor (H1).** Linii: R28 Cuhnești, R37 Musteața. Control: C23 (R28 12,7 %), D6 (R37 s1 45,2 / s2 62,0 fals), coerența card ↔ etalon/real/schimburi.
   Fișiere atinse: `drax/cod/ideal/schelet.mjs` (cheia `ruta|linie|zi|schimb|m`, :5,114) și `alege.mjs` (:14,80-92). Minim: în copia `drax/date/ideal-v4.1/` se șterg din
   `schelet-cand.json` cheile `R28|Cuhnesti|*` și `R37|Musteata|*`, apoi schelet → alege → card. Durabil: cheia include capătul (`…|capat`) ca orice schimbare de capăt să invalideze.
   Efect km/zi GPS: 0 pe card (rămâne 75 și 60,2); F2 pe R37 s1: plafonul §5.3 a 45,2 → 60,2 km (+15 km/picior în săptămânile s1); R28: culoarul acoperă Balatina ↔ Cuhnești (~9 km/picior) → iese din livrare.
   Acceptare: C23 R28 ≤ 5 %, |s1 − s2| ≤ 5 % pe R37, D6 R37 dispare, `compara.mjs` v6 → v4.1 identic pe card cu v7.
2. **Regulile (H2) — §4.1/§4.7 FĂCUTE prin migr. 412.** Rămâne: pragul numeric pentru «în mod regulat» în §4.1 (și fereastra pe care se măsoară)
   §6.6 Sturzovca reformulat (diferență de mașină/rută, nu de schimb). Efect km: 0. Apoi se re-semnează registrul pe sha-ul lui v4.1.
3. **R37 Musteața → Năvîrneț:** se păstrează în v4.1 (60,2 km; +33,4 km/zi GPS față de v3.1). Dovada: 136/144 opriri la Năvîrneț, km sept 59,7–61,5.
4. **R28 Cuhnești → Balatina:** se păstrează în v4.1 (conform §4.1 nou). Dacă dezbaterea scrie pragul «regulat» pe fereastra SURSEI fără parcare, turul are 28 % (5/18) — atunci pragul trebuie ≤ 25 % sau fereastra = toată (43 %); altfel înapoi la 65,5 cu steag (−19 km/zi).
5. **R36 Bocancea Schit:** corecție directă card 54,5 → 54,0 (G1 0,9 %, C47 94 %), steagul se scoate, intrarea G1 din registru se șterge. Efect −1,0 km/zi GPS. Fișier: cardul din `alege`/`card` în copia nouă.
6. **R18 Zarojeni, R27 Sturzovca:** fără corecție de card; explicații G1 re-semnate cu diagnosticul de aici (Zarojeni: 28,9 = picioarele prin Zarojeni; Sturzovca: 46,5 = 727CWN prin satele R11).
7. **Clasa «capăt prin parcare» (H4), schimbare de lanț separată, după v4:** în `etalon.mjs` (atingerea capătului, §4.2), un picior care atinge capătul doar la ≤ 1 km de marginea deplasării și nu oprește în niciun sat propriu nu intră pe linie.
   Linii: Zarojeni (52 %), Dominteni (45 %), Prajila (27 %), Sturzovca (15 %). Efect: până la −68 km/zi pe Dominteni (dacă a treia tură e R13), mutat, nu pierdut; se remăsoară ture/zi și se verifică dacă R13 Hasnasenii Noi / R18 Putinești primesc ideal.
8. **Script (propunere pentru sesiune, nu schimbată acum):** `ruleaza.sh` copiază `capete-gps.json` ca intrare opțională sigilată; `drax.mjs` verifică pe fiecare linie mutată pragul (varianta fără parcare) și raportează C48.
