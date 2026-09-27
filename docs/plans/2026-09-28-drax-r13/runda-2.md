# ION-111 — runda 2: ideal-v4.2 (filtrul de «tranzit» pe opriri, în schelet)

Runda 1: Claude 5,0 (verificator 5,0 / business 6,0 / analist 5,0), Codex 7,0 fail (C1 high: `sl` lipsește în curse-ideal.json și
cârpirea reface opririle fără el → regula săptămânală nu se poate copia ca atare). Consens: V1 NU, V2 NU, V3 diagnostic, V5 DA.

## Răspunsul la C1 (Codex) — regula echivalentă FĂRĂ durată
`curse.mjs:133-145` și `carpire.mjs:48-56` păstrează o oprire doar cu viteza minimă < 8 km/h și ≥ 20 s lent (S_LENT) — exact pragul de jos
al regulii săptămânale; lipsește doar plafonul de sus (15 min), înlocuit cu excluderea opririlor de la începutul/sfârșitul cursei (≤ 0,5 km
de c.a / c.b — casa, parcarea). Cârpirea folosește aceeași definiție, deci regula supraviețuiește lanțului. Nicio propagare de `sl` nu e
necesară. În `ideal-v4.2/etalon.mjs` (în locul liniei 104 din v4.1):
  cursa mașinii din afara graficului (fără dus-întors, gol > plin) NU se respinge dacă are ≥ 2 opriri în satele rutei (în afara capetelor
  cursei) SAU o oprire la ≤ 2,5 km de capătul liniei.

## ideal-v4.2 (VPS `/root/lde-worker/drax/date/ideal-v4.2/`, cod `.../cod/ideal-v4.2/`; reproductibil 24/24; GATA, schelet sha 629b0c1d…)
| linie | v4.1 | v4.2 |
|---|---|---|
| R13 Hăsnășenii Noi | fără ideal (C31) | 9,5 km × 1 → 19 km/zi (etalon 9,6, s1/s2 9,6/9,6) |
| R14 Dominteni | 34,0 × 3 → 204 km/zi | 29,9 × 1 → 59,8 km/zi (act: 1 tură; verificator H4 «Dominteni 3 ture cu serviciul R13 al lui 710CWN») |
| R22 Țiplești | 21,4 × 1 → 42,8 | 21,9 × 2 → 87,6 (act: 2 ture; returul s2 al lui 804MUM, recunoscut după opriri) |
| R13 Lazo | 65,6 | 64,8 |
| R33 Iezărenii Vechi | 69,4 | 68,2 |
| celelalte 44 | — | identice |
| flota (card) | 5.872 | 5.789 km/zi (−83) |
R18 Putinești și R27 Iabloana: tot fără ideal (C31), cum a hotărât runda 1.

## Ce se cere
(A) v4.2 e corect pe toate liniile (verificatorul pe km GPS; Dominteni/Țiplești — schimbarea e reală, nu o mutare greșită)?
(B) săptămâna 14.09 pe v4.2 (simulare pe copie, instantaneu nou din v4.2, aceleași date): 744ARF intră în măsurare? ce se schimbă pe flotă?
(C) textul §1.4 (R13 n-are curse) + regula tranzitului — migrație. Scor după rubrică.
