-- 440: ION-143 — parcarea propusă (1–2 locuri pe mașină) la LEAR Ungheni și LEAR Florești (secțiunea 13); Florești §4.2: capătul A2 = Cunicea (ION-63).
DO $$
DECLARE n int; t text;
  s13 text := $s$

13. PARCAREA PROPUSĂ (Ion, 29.09.2026: «aplica pe pagina harta si lear cu punctele optimale», după Drăxlmaier ION-136; dezbaterea Claude + Codex, ION-143)
13.1 Fiecare mașină primește unul sau două locuri unde să stea între curse și noaptea: poarta uzinei (regula 1), casa sau un sat / oraș la ≤ 15 km de capetele drumurilor ei. Se calculează luni, după raport, din urma GPS a săptămânii (lear-parcare.mjs); pe pagini: blocul «Parcarea propusă» din raport și «Harta mașinii» (P1 / P2, drumurile propuse). Fără poster.
13.2 Munca se ia din urmă, nu din ceas: cursa cu oameni = oprire în sate (§4.8), fără intersecțiile pe care încetinesc ≥ 5 mașini la ≥ 4 ore diferite. Tur = spre poartă, de la PRIMA apropiere ≤ 1 km de capătul rutei (lista §1.4 cu capetele fixate), altfel ≥ 2 opriri; retur = de la poartă până la ULTIMA apropiere de capăt; poartă → poartă cu opriri = cursă în plus (și schimbul 3); fără poartă cu ≥ 2 opriri = cursă întreruptă. Toate sunt muncă și nu se optimizează.
13.3 Drum de parcare = golul de ≥ 60 min dintre două curse, de la sfârșitul uneia la începutul celeilalte. Nu intră: golul mai lung de 12 h (zi incompletă), cel în care mașina nu iese la > 2 km de poartă, cel cu oprire la ≤ 4 km de Bălți (service) sau la poarta altei uzine. Oamenii lăsați după capăt sau luați înainte de el (opririle din gol) sunt muncă: drumul de parcare începe după ultima oprire și se termină la prima; un drum de parcare cu opriri rămase scoate mașina din propunere (controlul §10).
13.4 Km de acum = km GPS ai drumului de parcare, fără km «timp liber» și brambura (§11.9). Km propuși = drumul pe șosea (Valhalla bus × 1,05) de la sfârșitul cursei la loc și de la loc la cursa următoare. Pe fiecare drum: prin locul propus sau «rămâne cum e», când acum face mai puțin, când locul e la ≤ 4 km de unde mașina deja stă sau câștigul e sub max(2 km, 5 %). Km de tăiat = km de acum − km propuși, pe săptămână, niciodată negativ.
13.5 Al doilea loc doar dacă scade ≥ 20 km pe săptămână și e folosit la ≥ 3 drumuri; la scor apropiat (≤ 20 km/săpt.) câștigă locul unde mașina deja stă în ≥ 2 zile, apoi un oraș. Fără propunere: un singur schimb măsurat (§8.3), mai mult de jumătate din tururi / retururi fără trecere pe la capăt, niciun drum de parcare, propunerea nu scade km. Drumul șoferului spre casă nu e socotit (naveta nu se numără).
13.6 Parcarea propusă e varianta pe GPS a regulilor 1 și 3 (etalon): aceeași economie măsurată altfel — nu se adună cu ele.$s$;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = reguli_livrare || s13
   WHERE id = 'LEAR_UNGHENI' AND length(reguli_livrare) = 10424 AND md5(reguli_livrare) = '1d4d373b5aa2e62b3520ae2c6f51da2a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '440: textul LEAR_UNGHENI nu e cel așteptat, rânduri: %', n; END IF;

  UPDATE lde_uzine SET reguli_livrare = replace(replace(reguli_livrare,
      $a$4.2 Capăt fixat pe GPS: A2 → Cuhureștii de Sus.$a$,
      $b$4.2 Capătul A2 = Cunicea (Ion, 25.09.2026, ION-63: «Cunicea se face» — drumul prin Cunicea e rută, nu livrare). Până atunci (ION-59) capătul era fixat pe GPS la Cuhureștii de Sus.$b$),
      $c$Cunicea are pasager ocazional (9 opriri în 100 de zile), nu e capăt.$c$,
      $d$Cunicea avea pasager ocazional (9 opriri în 100 de zile).$d$)
    || replace(replace(s13, 'lista §1.4', 'lista §1.4 / capătul §4.2'), '(§8.3)', '(ca §8.3 Ungheni)')
   WHERE id = 'LEAR_FLORESTI' AND length(reguli_livrare) = 7924 AND md5(reguli_livrare) = 'beee9cda127f79ae2ae2140a8724d303';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '440: textul LEAR_FLORESTI nu e cel așteptat, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'LEAR_FLORESTI';
  IF position('Cuhureștii de Sus.' in t) = 0 OR position('nu e capăt' in t) > 0 THEN RAISE EXCEPTION '440: §4.2 Florești neînlocuit'; END IF;
END $$;
