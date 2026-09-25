-- 401: §12 — indicațiile de luni pentru dispecer, împreună cu posterul (ION-62)
--
-- Ion, 25.09.2026, după posterul LEAR Florești și mesajul de mână către Alexei despre 894BRAX ↔ 279BRAT:
-- «acum săptămânal, unde este semnificativ, împreună cu poster, mesaj lui Alexei cu indicații ce să facă,
-- la SEBN și LEAR ambele uzini — pun regulă». Regula intră în cuvinte în regulile livrării fiecărei uzine
-- (/lde/livrare-reguli), ca §11; codul: apps/admin/src/lib/lde/indicatii-alexei.ts (LEAR, mesaj separat
-- după poster, din /api/cron/lde-timp-liber) și textulSebn din sebn-optimizari-image.ts (SEBN, sub poster).
-- Idempotent: se adaugă doar dacă §12 lipsește.

UPDATE lde_uzine SET reguli_livrare_la = now(), reguli_livrare = reguli_livrare || $s12$

12. INDICAȚII SĂPTĂMÂNALE PENTRU DISPECER (Ion, 25.09: «săptămânal, unde este semnificativ, împreună cu poster, mesaj lui Alexei cu indicații ce să facă»)
12.1 Luni la 08:00, după ce raportul săptămânii e scris, în grupa livrărilor de uzină pleacă posterul «cât se putea economisi» și, imediat după el, un mesaj pentru dispecer (Alexei) cu CE SE FACE — nu doar cât se putea economisi.
12.2 SEMNIFICATIV = 100 km pe săptămână pe mașină, la regula ei cea mai bună (regula 1, 2 sau 3, km/zi × zilele lucrate). Regula 2 (rutele împărțite altfel) se propune doar dacă flota câștigă net ≥ 100 km pe săptămână — altfel o mașină ar câștiga pe spinarea alteia. Sub prag nu se scrie nimic despre mașina aceea.
12.3 Fiecare mașină apare o singură dată, la regula ei cea mai bună; regulile nu se adună. Regula 2 se scrie ca schimb: «X ia ruta A de la Y, dă ruta B» și ce ia Y în loc. Regula 1: «doarme lângă uzină». Regula 3: «între ture așteaptă la uzină sau la capătul rutei, nu acasă».
12.4 Km liberi și brambura peste pragul din §11 (50 km pe săptămână) intră în același mesaj, cu întrebarea «unde a fost?» — doar cifrele; opririle rămân pe pagină.
12.5 Fără nimic semnificativ nu pleacă niciun mesaj (posterul pleacă oricum). O săptămână nu se trimite de două ori (app_config.indicatii_alexei_last_<uzina>); un poster deja plecat de mână nu oprește indicațiile.
12.6 La SEBN, unde regulile 1–3 nu se aplică, indicațiile stau sub poster: primele 3 mașini cu livrare peste 40 km pe zi și întrebarea «șofer din satul de start, sau mașina așteaptă la capătul rutei între ture?»; brambura, cu șoferul și «unde a fost?», e pe poster.$s12$
WHERE id IN ('LEAR_UNGHENI', 'LEAR_FLORESTI', 'SEBN_ORHEI', 'SEBN_STRASENI')
  AND reguli_livrare IS NOT NULL AND position('12. INDICAȚII' IN reguli_livrare) = 0;
