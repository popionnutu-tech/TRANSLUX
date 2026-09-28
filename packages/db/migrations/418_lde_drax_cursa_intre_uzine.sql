-- 418_lde_drax_cursa_intre_uzine.sql — Drăxlmaier §5.11: drumul între porțile VEST și EST = cursă între uzine, nu gol
-- (Ion, 28.09.2026: «from vest to east and vice versa is trip between factories also for work»; ION-119).
-- Gard de intrare: textul de după 417 (29570 / 8c6ad18b64b27b7cc342166a41649723).
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(reguli_livrare, $v0$5.10 NAVETA ȘOFERULUI nu se numără deloc (LEAR 5.5).$v0$, $n0$5.10 NAVETA ȘOFERULUI nu se numără deloc (LEAR 5.5).
5.11 CURSĂ ÎNTRE UZINE (Ion, 28.09.2026, ION-119: «de la VEST la EST și invers e cursă între uzine, tot pentru muncă»): drumul între porțile VEST și EST ale Drăxlmaier e muncă, NU gol și nu economie. Se recunoaște pe urmă: mașina e la poarta A (staționează efectiv cel puțin 1 minut — sub 8 km/h — sau cursa de dinainte s-a terminat acolo), merge prin zona uzinei (≤ 3 km de porți sau de parc, cel mult 40 de minute) și e la poarta B ≠ A (staționează efectiv cel puțin 1 minut sau cursa următoare pleacă de acolo); trecerea pe lângă ambele porți fără oprire nu intră. Mișcarea toată în zonă și de cel mult 11 km (de două ori drumul dintre porți, 5,4 km pe șosea) e toată cursă între uzine; în rest, doar porțiunea de la poarta A la poarta B, scăzută din categoria de bază a mișcării (5.2–5.7; ocolul pe acasă ultimul). Bate categoriile 5.2–5.8. Săptămâna 14–20.09: ≈ 1.880 km, ≈ 330 de drumuri (925FTI: poarta VEST → poarta EST în fiecare zi după turul de la Năvîrneț).$n0$)
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 29570 AND md5(reguli_livrare) = '8c6ad18b64b27b7cc342166a41649723';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '418: textul din bază nu e cel de după 417, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 30540 OR md5(t) <> '15baca3626a41a6e51aaf1eb22d44e9e' THEN RAISE EXCEPTION '418: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
