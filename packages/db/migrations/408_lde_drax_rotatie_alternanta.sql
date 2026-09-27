-- 408_lde_drax_rotatie_alternanta.sql — Drăxlmaier §2.3: rotația schimburilor prin alternanță de la ancora 21.09.2026,
-- nu după paritatea săptămânii ISO (Ion, 27.09.2026; lanțul ideal-v3 folosește deja alternanța, ION-97).
-- Gard de intrare: textul de după 407 (24000 / f4e5f5293505d6cd53f18fef0cc935b5); ieșire verificată pe lungime + md5 din simulare.
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine
     SET reguli_livrare = overlay(reguli_livrare placing $s23$2.3 Grupele din act: «I - EZ» și «II - D» sunt grupele de oameni ale autobuzului (E+Z, respectiv D), nu programul și nu drumul (Ion, 25.09). Rotația merge săptămână cu săptămână (luni–duminică) prin ALTERNANȚĂ de la o săptămână-ancoră, nu după paritatea numărului săptămânii ISO (Ion, 27.09): săptămâna care începe luni 21.09.2026 e faza A — grupa D face schimbul 1, grupa E+Z schimbul 2; săptămâna următoare e faza B — invers; și tot așa, alternând fără excepție, inclusiv la trecerea de an. Anul 2026 are săptămâna ISO 53, deci săptămânile ISO 53 și 1 sunt amândouă impare, dar faza alternează: săptămâna din 28.12.2026 e faza A, săptămâna din 04.01.2027 e faza B. Liniile cu ambele grupe (EZ+D) merg pe ambele schimburi, zilnic. Pe GPS (ION-71), în fazele A schimbul 1 are 33 de linii (D + ambele grupe) și schimbul 2 are 25 (EZ + ambele); în fazele B 26 și 32. Cifrele urmează GPS-ul, nu actul (2.4).$s23$ from position(E'\n2.3 ' in reguli_livrare) + 1 for position(E'\n2.4 ' in reguli_livrare) - position(E'\n2.3 ' in reguli_livrare) - 1),
         reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI'
     AND length(reguli_livrare) = 24000
     AND md5(reguli_livrare) = 'f4e5f5293505d6cd53f18fef0cc935b5'
     AND position(E'\n2.3 ' in reguli_livrare) > 0
     AND position(E'\n2.4 ' in reguli_livrare) > position(E'\n2.3 ' in reguli_livrare);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '408: textul din bază nu e cel de după 407 (24000 / md5), rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 24334 OR md5(t) <> '810297f3c831a2cf4b2dbaea0d6e2c22' OR position('săptămânile IMPARE' in t) > 0 OR position('$' in t) > 0
  THEN RAISE EXCEPTION '408: textul după înlocuire nu e cel așteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
