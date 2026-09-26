#!/bin/bash
# F3 pasul E.1b (execuție ION-94, contractul actualizat din runda finală ION-95): cardul = etalonul GPS completat (modulul comun
# /home/verif/verificator/cod/etalon-gps.mjs), pagina și comparația refăcute, apoi marcajul GATA (sha256 pe fiecare fișier).
# Idealul vechi (drax/date/*.json, drax/cod/ideal) NEATINS — manifestul înainte / după.
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; O=$S/e1b.out; D2=$W/drax/date/ideal-v2
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
test -f /home/verif/verificator/cod/etalon-gps.mjs
sha256sum /home/verif/verificator/cod/etalon-gps.mjs
man() { ( cd $W/drax/date && for f in *.json; do printf '%s %s %s\n' "$(sha256sum "$f" | cut -c1-64)" "$(stat -c '%i %h' "$f")" "$f"; done; cd $W/drax/cod/ideal && md5sum *.mjs *.sh ) ; }
man > $S/manifest-e1b-inainte.txt
rm -f $D2/GATA $D2/GATA.sha256
cp $D2/schelet-ideal.json $S/schelet-ideal-v2-inainte-de-card.json
node $S/card-gps.mjs $D2
( cd $W/drax/cod/ideal-v2 && node pagina.mjs )
node $S/compara-ideal.mjs $W/drax/date/schelet-ideal.json $D2 > $D2/ce-s-a-schimbat.md
{ echo; echo "## Cardul = etalonul GPS completat (etalon-gps.mjs, ION-95)"; echo; sed 's/^/- /' $D2/card-gps-raport.txt; } >> $D2/ce-s-a-schimbat.md
head -3 $D2/ce-s-a-schimbat.md | tail -1
man > $S/manifest-e1b-dupa.txt
diff $S/manifest-e1b-inainte.txt $S/manifest-e1b-dupa.txt && echo "MANIFEST IDENTIC (idealul vechi neatins)"
( cd $D2 && for f in *.json; do [ -f "$f" ] && sha256sum "$f"; done ) > $D2/GATA.tmp
cp $D2/GATA.tmp $D2/GATA.sha256.tmp && mv $D2/GATA.sha256.tmp $D2/GATA.sha256 && mv $D2/GATA.tmp $D2/GATA
for f in schelet-ideal obs-ideal etalon-ideal curse-ideal regulate-ideal schimburi-ideal care-schimb-ideal dubluri-ideal nomenclator; do
  grep -q "^$(sha256sum < $D2/$f.json | cut -c1-64)  $f.json$" $D2/GATA && echo "GATA ok $f" || { echo "GATA LIPSĂ $f"; exit 1; }; done
wc -l < $D2/GATA
echo "GATA $(date -Is)"
