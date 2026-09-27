# ION-111 — verdictul dezbaterii Claude + Codex: km pentru R13 (27.09.2026)
Runda 1: Claude 5,0 / Codex 7,0 (1 high). Runda 2: Claude 7,25 (verificator v11 7,25, business 8,0) / Codex 8,0 pass, 0 high.
- Cauza: nu lipsa perechilor, ci filtrul de «tranzit» din etalon.mjs, care arunca cursele mașinilor din afara graficului cu drumul gol
  mai lung decât cel plin (mașinile care dorm în Bălți). V1 (pereche pe schimburi diferite) și V2 (etalon din tururi) — respinse de ambele părți.
- Soluția (V5): cursa e a liniei dacă are opriri (< 8 km/h, ≥ 20 s) în satele rutei — cel puțin 2 în afara capetelor cursei sau una la
  capătul liniei. ideal-v4.2, ACTIV din 27.09 19:4x (sha 629b0c1d; verificator v12 valid, registru re-semnat).
- Efect: R13 Hăsnășenii Noi 9,5 km × 1; R14 Dominteni 3 → 1 tură (serviciul 710CWN e al R13 Lazo); R22 Țiplești 1 → 2 ture; card 5.872 → 5.789 km/zi.
- Migrația 414: §1.4, §4.2, §6.5. R18 Putinești și R27 Iabloana rămân fără km (sate pe drumul R22 / R27 Danu).
- Steag (medium, Codex C3 + verificator): în săptămânile pe s1, turul de dimineață al lui 744ARF trece prin Hăsnășenii Noi fără oprire —
  de verificat dacă e cursă cu oameni sau drumul de acasă. Low C4: regula e scrisă în două forme (schelet fără durată / analiza cu durată).
