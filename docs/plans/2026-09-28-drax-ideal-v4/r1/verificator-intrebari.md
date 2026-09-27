# Întrebări pentru dezbaterea Claude + Codex (runda 1, ideal-v4) — după migr. 412

1. **R37: capătul Năvîrneț (60,2 km) — confirmat de §4.1 nou; se activează doar după v4.1 (cache curățat)?**
   Cifre: Năvîrneț: 136/144 curse cu oprire §4.5 la mijlocul deplasării, sept 37/37; km GPS sept 59,7 / 59,8 / 59,9 / 61,5; +33,4 km/zi; v7 schimburi s1 44,8/45,6 (cache)
   Recomandarea verificatorului: DA, după v4.1

2. **§4.1 nou spune «în mod regulat» fără prag: ce prag numeric, și se numără pornirea din parcarea de noapte?**
   Cifre: R28 pe v6: tur 50 % cu parcare / 28 % fără; retur 74 % / 58 %; opriri §4.5 la Balatina pe fereastră tur 33/67 (29/67 fără parcare), retur 35/72; în sept fără parcare tur 5/18 (28 %), retur 11/19 (58 %); R32 Trifănești tur 47 % → 6 % fără parcare
   Recomandarea verificatorului: prag scris pe TOATĂ fereastra (capătul e structural; sept are 18 tururi): «oprire §4.5 în ≥ 30 % din curse pe fiecare sens, fără pornirea/sosirea din parcare, la ≥ 2 mașini» — R37 ~95 % și R28 43 % / 49 % trec; pe fereastra sursei R28 tur ar pica (28 %), deci alegerea ferestrei decide R28 și trebuie scrisă

3. **Clasa «capăt atins doar prin parcare»: se scoate din linie piciorul care atinge capătul doar la marginea deplasării și nu oprește în niciun sat propriu?**
   Cifre: Zarojeni 52 %, Dominteni 45 %, Prajila 27 %, Sturzovca 15 %; Dominteni ture/zi 3 vs act 1, Prajila 3 vs act 2; R13 Hasnasenii Noi și R18 Putinești fără ideal
   Recomandarea verificatorului: DA, ca schimbare de lanț separată (după v4), cu remăsurarea ture/zi și cu verificarea dacă R13/R18 primesc ideal

4. **R18 Zarojeni și R27 Sturzovca: G1 blocant se explică (card păstrat) sau se corectează spre etalonul GPS?**
   Cifre: Zarojeni: picioarele cu oprire la Zarojeni 28,3 + 0,6 = 28,9 = card; etalon 30,7 = serviciul R22. Sturzovca: orice poartă 24,1 (41 zile) vs poarta sensului 46,5 (8 zile, doar 727CWN, sate R11)
   Recomandarea verificatorului: explicație re-semnată, card păstrat; textul §6.6 despre Sturzovca («s1 24,7 / s2 46,9») se corectează: e diferență de mașină și de rută, nu de schimb

5. **capete-gps.json (sigilat în GATA) nu intră în copiile verificatorului: drax.mjs nu poate verifica mecanic sursa capetelor GPS**
   Cifre: GATA v4: capete-gps.json 55498ac8…; in/ al rulării v7 nu-l conține
   Recomandarea verificatorului: propunere de script (aprobată de sesiune): ruleaza.sh copiază capete-gps.json ca intrare opțională, iar drax.mjs verifică pentru fiecare linie mutată pragul și C48

Închise de migr. 412: amendarea §4.1/§4.7 (făcută) și R19 Sîngerei (orașele din §5.1 nu fac capăt).
