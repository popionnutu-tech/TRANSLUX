# ideal-v4 — triajul rundei 2 (27.09.2026)

Scoruri: business 7,0 (0 high) · uzina-analist 3,5 (pe subiectul C, 2 high) · schelet-verificator 7,5 (v8, 0 high nou) → **Claude 3,5**;
**Codex 5,0**, fail, 2 high — AMBELE pe subiectul C (Bălți), niciunul pe schelet.

## Scheletul (A, B, D) — consens
| subiect | Claude | Codex | decizie |
|---|---|---|---|
| A v4.1 activabil | business DA cu M-a; verificator DA după v9 (registru) | DA condiționat de M-a + v9 + export | **M-a făcut** (`economie/etichete.mjs`: startAct + cursa scurtă, copie `.bak-ion110-r2`); **registrul re-semnat** (5 explicații pe sha bfa070f0…, 12 intrări moarte scoase, v3.1 păstrat până la comutare); v9 rulează |
| B capăt prin parcare | DA diagnostic (+ distanța până la locul nopții) | DA exclusiv diagnostic | listă de diagnostic, fără excludere |
| D steaguri | confirmate | confirmate, Bocancea inclusiv | carduri v3.1 pe cele 6 linii |
| L-b textul regulii în capete-gps.json | low | — | în versiunea finală (fișierul e sigilat în GATA-ul v4.1): textul §4.1 din migrația 412 |
| cheia cache-ului fără capăt | low (verificator) | — | în lanț, la următoarea mutare de capăt (notat) |

## Bălți (C) — ION-109, corecturi acceptate
| id | sev. | esență | decizie |
|---|---|---|---|
| Codex C1 = analist H1 | high | atingerea porții nu dovedește o cursă nedetectată | ACCEPTAT: criteriul cu trei condiții (atingere în interiorul bucății, ≥ 5 min de margini; sensul — sosire la tur / plecare la retur; un sat ≥ 5 km de porți, fără cartierele Bălțiului); §11.8 are precedență (024XKY rămâne «de lămurit»); probe: 024XKY, 744ARF 16.09, trecerile spre casă 744ARF 15–17.09 și 804MUM 17:0x |
| Codex C2 = business M-c | high | bucată sau zi | ACCEPTAT: iese ZIUA întreagă (§8.1, §8.6), declanșatorul nou scris în §8.6 prin migrația 413 (gard 25.072 / 62eace0d); recalcul zile incluse, B, extrapolări, indicații, cifrele c2 |
| analist H2 | high | 744ARF / 804MUM nu apar | Codex: nu e high (tabelul arată și nemăsuratele, RaportDrax.tsx:181–207); ACCEPTAT ca medium: rândul «cursă probabil nedetectată pe linia X» în bloc |
| business L-d | low | blocul în afara «Ce faci» (§12.1) | ACCEPTAT: bloc separat, alături, câmp propriu în date |
| analist M2 | medium | «capătul > 15 km» nedefinit | ACCEPTAT: pe șosea (Valhalla), de la casă la capătul liniei |
| c2 | — | casa ≤ 3 km = lângă uzină | rămâne întrebare pentru Ion, cu cifrele recalculate după criteriu |
