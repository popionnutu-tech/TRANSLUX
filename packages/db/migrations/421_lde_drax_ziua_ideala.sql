-- 421_lde_drax_ziua_ideala.sql — Drăxlmaier §8.8: «ziua ideală» a mașinii, cifra principală de optimizare (Ion, 28.09.2026; ION-123, Codex r3 10/10).
-- Gard de intrare: textul de după 420 (32653 / e83d5f226e01cb64031de63a580cc4f1).
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(reguli_livrare, $v0$

9. COSTUL KM$v0$, $n0$
8.8 ZIUA IDEALĂ — CIFRA PRINCIPALĂ DE OPTIMIZARE (Ion, 28.09.2026: «ideal ar fi 15–17 km × 6 drumuri dacă el ar fi capăt de rută … minus km total se primește economie»; «ce regulă ar rula pentru auto care fac ture diferite în ore diferite?»; dezbaterea Claude + Codex ION-123, 3 runde, Codex 10/10). Pentru fiecare mașină și zi, din propriile ei curse (orice linii, orice ore): IDEAL = km GPS ai deplasărilor obligatorii (cursele cu oameni, inclusiv prânzul și turele promovate; cursele între uzine 5.11; service; deplasarea 5.6; golul dintre turul și returul aceleiași ture; drumurile lângă uzină și prin oraș) + drumul direct între sfârșitul unei deplasări obligatorii și începutul următoarei, numai dacă locurile diferă cu peste 1,5 km (km reali: mediana GPS a drumurilor directe observate pe aceeași pereche de locuri, cel puțin 3; altfel drumul pe șosea × 1,05, cu steag) + noaptea la capăt (0 când seara se termină unde pleacă dimineața). ECONOMIE = km făcuți (suma bucăților, fără golul impus nefăcut) − IDEAL, pe cauze: noaptea departe de capăt, acasă între curse (ocolul 5.2 împreună cu drumul mai lung prin casă), drum mai lung decât cel direct fără casă; zilele mai scurte decât idealul se arată (steag), nu se plafonează. Eșantionul este al regulii B (luni–vineri, fără zilele 8.6 și «de lămurit»); weekendul (noaptea care atinge sâmbăta sau duminica), nopțile în Bălți (7.4) și mașinile cu posibilă cursă nedetectată (386PKP, 293QVT) sunt SEPARAT, în afara totalului. Probe pe toată flota: km făcuți − ideal = economie + separat; suma cauzelor = economia; economia ≤ golul; idealul ≥ deplasările obligatorii; munca adaugă 0. Săptămâna 14–20.09: 5.059 km măsurat (6.013 extrapolat) — acasă între curse 3.882, noaptea 1.163, drum mai lung 249, mai scurt decât idealul −235; separat weekend 450, Bălți 652; 22 de mașini peste 100 km pe săptămână (710CWN 546, 518MHD 544, 925FTI 450). Regulile 1 și 3 din 8.7 sunt cauzele «noaptea» și «acasă între curse» (aceleași km); regula 2 (rute împărțite altfel) rămâne separată. Pe pagină: blocul «Economie față de ziua ideală», deasupra celor 3 reguli.

9. COSTUL KM$n0$)
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 32653 AND md5(reguli_livrare) = 'e83d5f226e01cb64031de63a580cc4f1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '421: textul din bază nu e cel de după 420, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 34757 OR md5(t) <> '73b71dcfa9601552141352584e9cf73d' THEN RAISE EXCEPTION '421: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
