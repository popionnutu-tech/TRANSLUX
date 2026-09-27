-- 413_lde_drax_livrare_balti.sql — Drăxlmaier: noaptea în Bălți (parc, uzină, acasă la ≤ 3 km) NU mai scutește livrarea (§5.3 a, §7.4);
-- ziua cu o cursă probabil nedetectată în livrare iese întreagă (§8.6, criteriul cu trei condiții); blocul «dorm în Bălți» pe pagină (§12.1).
-- Ion, 27.09.2026 (ION-109): «mașina care doarme la Bălți, fie la uzină, fie lângă uzină la om acasă — trebuie de analizat livrările tot».
-- Gard de intrare: textul de după 412 (25072 / 62eace0d0dd8f37e678a27ef639f5c0e); ieșire verificată pe lungime + md5 din simulare.
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine
     SET reguli_livrare = replace(replace(replace(replace(reguli_livrare, $va53$; după o noapte la Parcul Bălți, drumul parc ↔ capăt până la lungimea liniei;$va53$, $na53$; după o noapte în Bălți — la Parcul Bălți, la uzină sau acasă la ≤ 3 km de porți sau de parc — NU există gol impus: tot drumul până la capăt și înapoi e livrare (7.4);$na53$), $va74$7.4 Noaptea la Parcul Bălți (14 nopți din 749, 10 mașini) = doarme lângă uzină: drumul parc ↔ capăt e golul impus (5.3 a), nu livrare.$va74$, $na74$7.4 Noaptea în Bălți — la Parcul Bălți (14 nopți din 749, 10 mașini), la uzină sau acasă la ≤ 3 km de porți sau de parc — NU scutește livrarea (Ion, 27.09.2026, ION-109: «mașina care doarme la Bălți, fie la uzină, fie lângă uzină la om acasă — trebuie de analizat livrările tot»): drumul până la capătul liniei și înapoi e livrare (R1a) și se analizează ca la orice mașină.$na74$), $va86$Zilele cu curse de prânz rămân în regulile de economie doar dacă perechea e completă; cursa de prânz nu e nici economie, nici nelămurit.$va86$, $na86$Zilele cu curse de prânz rămân în regulile de economie doar dacă perechea e completă; cursa de prânz nu e nici economie, nici nelămurit. Tot așa iese ÎNTREAGĂ ziua în care o bucată de livrare conține o cursă probabil nedetectată (ION-109, dezbaterea Claude + Codex, runda 2): mașina atinge poarta (raza porții + 0,3 km) în interiorul bucății, la cel puțin 5 minute de marginile ei, într-o fereastră de ceas (§3.2), în sensul cursei: TUR = în ora de dinainte a fost la cel puțin 5 km de porți și de parc și nu pleacă iar atât de departe în următoarele 10 minute (sosește); RETUR = în ora de după ajunge la cel puțin 5 km și n-a venit de atât de departe în cele 30 de minute de dinainte (pleacă). Drumurile de pe lista «de lămurit» (§11.8) rămân acolo; o cursă nevăzută în afara bucăților de livrare (de ex. în golul dintre ture) nu scoate ziua.$na86$), $va121$R1a, marginile zilei, e cost de azi (se taie doar cu alt șofer din satul de start) și nu intră în indicații; se vede pe pagină.$va121$, $na121$R1a, marginile zilei, e cost de azi (se taie doar cu alt șofer din satul de start) și nu intră în indicații; se vede pe pagină. Mașinile cu casa în Bălți (≤ 3 km de porți sau de parc, 7.4) apar pe pagină într-un bloc separat de indicații, «de analizat», cu livrarea lor în km pe săptămână (R1a) și cu zilele cu cursă probabil nedetectată (8.6), fără lei; nu intră în mesajul pentru dispecer.$na121$),
         reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI'
     AND length(reguli_livrare) = 25072
     AND md5(reguli_livrare) = '62eace0d0dd8f37e678a27ef639f5c0e';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '413: textul din bază nu e cel de după 412 (25072 / md5), rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 26373 OR md5(t) <> '56dfde040fe3c376618fb75d4507501d' OR position('drumul parc ↔ capăt e golul impus' in t) > 0
  THEN RAISE EXCEPTION '413: textul după înlocuire nu e cel așteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
