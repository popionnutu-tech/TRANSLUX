# ION-136 — runda 6: răspunsul la Codex runda 5 (7,5 după formulă; fail: C2 high — harta ocolea validarea)

## C2 (high) — ACCEPTAT, reparat
- Validarea e acum un singur modul, vps/parcare-valid.mjs (`valideazaParcare(PK)`): peste ideal, nefinit, două locuri neeligibile, nopți ne-separate fără
  `ancore === true` (câmpul lipsă = respins), drumuri propuse la mașini fără loc.
- vps/scrie-parcare.mjs și vps/harta-zi.mjs o apelează la pornire, ÎNAINTE de orice cerere către bază (harta: înainte de DELETE); orice eroare → exit 1.

## Regresia R3 / R4 (pe VPS, dosare temporare cu parcare.json injectat prin vps/inject2.mjs)
- `ancore: false` la 710CWN 14.09: harta-zi.mjs … --write → «parcare.json respins: nopți fără ancore E / S [710CWN] — harta NU se scrie», ieșire 1;
  scrie-parcare.mjs … --write → «probele parcării picate: nopți fără ancore E / S [710CWN] — date.parcare NU se scrie», ieșire 1.
- câmpul `ancore` șters (lipsă): aceleași două respingeri, ieșire 1.
- În ambele cazuri ieșirea e înaintea oricărei cereri (validarea e prima instrucțiune după citirea fișierelor).
- Săptămâna reală: scrie-parcare și harta-zi trec validarea (fără --write); flota 4.507,2 km/săpt., 150 de nopți cu ancore, 0 peste ideal.
