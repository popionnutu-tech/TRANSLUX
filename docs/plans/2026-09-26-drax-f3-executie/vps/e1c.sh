#!/bin/bash
# E.1b (reluare, execuție ION-94): dispozitivul pe fiecare cursă + generatorul de card legat în lanț + filtrul comun de urme rupte,
# lanțul ideal-v2 rerulat, marcajul GATA. Idealul vechi NEATINS (manifest înainte / după).
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; O=$S/e1c.out; C2=$W/drax/cod/ideal-v2; D2=$W/drax/date/ideal-v2
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
sha256sum /home/verif/verificator/cod/{etalon-gps,filtru-rupte,c4}.mjs
man() { ( cd $W/drax/date && for f in *.json; do printf '%s %s %s\n' "$(sha256sum "$f" | cut -c1-64)" "$(stat -c '%i %h' "$f")" "$f"; done; cd $W/drax/cod/ideal && md5sum *.mjs *.sh ) ; }
man > $S/manifest-e1c-inainte.txt
rm -f $D2/GATA $D2/GATA.sha256
[ -s $D2/dispozitive-sursa.json ] || bash $S/extrage-dispozitive.sh
cp $S/dispozitiv.mjs $S/card-gps.mjs $C2/
node $S/patch-v2.mjs $C2
for f in $C2/*.mjs; do node --check "$f"; done
echo "writeFileSync( rămase: $(cat $C2/*.mjs | grep -c 'writeFileSync(' || true)"
grep -n '^cd \|1d dispozitiv\|5c card' $C2/lant.sh
cd $C2 && T0=$(date +%s) && sh lant.sh && echo "lant.sh: $(( $(date +%s) - T0 )) s"
node $S/compara-ideal.mjs $W/drax/date/schelet-ideal.json $D2 > $D2/ce-s-a-schimbat.md
{ echo; echo "## Cardul = etalonul GPS completat (etalon-gps.mjs + filtru-rupte.mjs, ION-95 v4.1)"; echo; sed 's/^/- /' $D2/card-gps-raport.txt; } >> $D2/ce-s-a-schimbat.md
node $S/arata-v2.mjs $D2
man > $S/manifest-e1c-dupa.txt
diff $S/manifest-e1c-inainte.txt $S/manifest-e1c-dupa.txt && echo "MANIFEST IDENTIC (idealul vechi neatins)"
( cd $D2 && for f in *.json; do sha256sum "$f"; done ) > $D2/GATA.tmp
cp $D2/GATA.tmp $D2/GATA.sha256.tmp && mv $D2/GATA.sha256.tmp $D2/GATA.sha256 && mv $D2/GATA.tmp $D2/GATA
for f in schelet-ideal obs-ideal etalon-ideal curse-ideal regulate-ideal schimburi-ideal care-schimb-ideal dubluri-ideal nomenclator; do
  grep -q "^$(sha256sum < $D2/$f.json | cut -c1-64)  $f.json$" $D2/GATA.sha256 && echo "GATA ok $f" || { echo "GATA LIPSĂ $f"; exit 1; }; done
echo "GATA $(date -Is)"
