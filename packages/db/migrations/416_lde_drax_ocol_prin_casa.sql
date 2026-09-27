-- 416_lde_drax_ocol_prin_casa.sql — Drăxlmaier §5.2 + §8.2: ocolul pe acasă între curse = cât lungește casa drumul pe șosea
-- (Ion, 27.09.2026: «880RNK e din Pelinia, toate turele din Pelinia — de ce are de optimizat?»; ION-115). Pe săptămâna 14.09 R1b 4.136 → 2.532 km.
-- Gard de intrare: textul de după 415 (27406 / 1cfc6c53c3e0c23a3269c7bd834bdeef).
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(replace(reguli_livrare, $v0$livrare e DOAR ocolul: km peste drumul direct pe șosea dintre sfârșitul unei curse și începutul următoarei (drumul direct × 1,05, toleranța GPS); drumul direct rămâne în categoria lui (5.3 b sau 5.7) — ca la Briceni (26.09).$v0$, $n0$livrare e DOAR ocolul, adică cât LUNGEȘTE casa drumul pe șosea: (sfârșitul cursei → casă) + (casă → începutul următoarei) − (sfârșitul cursei → începutul următoarei), toate pe șosea, și cel mult km GPS peste drumul direct × 1,05 (toleranța GPS). Casa în satul unde se termină cursa sau de unde pleacă următoarea = ocol 0 (Ion, 27.09.2026, ION-115: «880RNK e din Pelinia, toate turele din Pelinia — de ce are de optimizat?»). Restul drumului — alt drum decât cel mai scurt, ocoluri prin oraș — rămâne în categoria lui (5.3 b sau 5.7), nu e din cauza casei.$n0$), $v1$R1b ocolul pe acasă între curse — nu pleacă acasă, așteaptă la capăt sau la uzină: 27 km pe zi-mașină, ≈ 1.020 km pe zi lucrătoare pe flotă (extrapolare).$v1$, $n1$R1b ocolul pe acasă între curse — nu pleacă acasă, așteaptă la capăt sau la uzină: 16 km pe zi-mașină, ≈ 590 km pe zi lucrătoare pe flotă (extrapolare, săptămâna 14.09, după ION-115; înainte 27 și 1.020, când drumul ales de șofer se număra drept ocol).$n1$)
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 27406 AND md5(reguli_livrare) = '1cfc6c53c3e0c23a3269c7bd834bdeef';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '416: textul din bază nu e cel de după 415, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 27835 OR md5(t) <> 'ce930b08d4d14ddd26db0dd8398a1cdb' THEN RAISE EXCEPTION '416: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
