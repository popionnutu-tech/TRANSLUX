#!/bin/bash
# F3 pasul E.1 — idealul v2 (execuție ION-94). Idealul vechi (drax/cod/ideal, drax/date/*.json) NEATINS.
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; O=$S/e1.out
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
man() { ( cd $W/drax/date && for f in *.json; do printf '%s %s %s\n' "$(sha256sum "$f" | cut -c1-64)" "$(stat -c '%i %h' "$f")" "$f"; done; cd $W/drax/cod/ideal && md5sum *.mjs *.sh ) ; }
man > $S/manifest-inainte.txt
test ! -e $W/drax/cod/ideal-v2 && test ! -e $W/drax/date/ideal-v2
SRC=/tmp/f3x/ideal-src
test ! -e $SRC
cp -r $W/drax/cod/ideal $SRC && cp $S/ideal-dubluri-placa.mjs $SRC/dubluri-placa.mjs
node $S/ideal-v2-transforma.mjs $SRC $W/drax/cod/ideal-v2
for f in $W/drax/cod/ideal-v2/*.mjs; do node --check "$f"; done
echo "writeFileSync( ramase: $(grep -c 'writeFileSync(' $W/drax/cod/ideal-v2/*.mjs | awk -F: '{s+=$2} END{print s}')"
grep -n '^cd ' $W/drax/cod/ideal-v2/lant.sh
mkdir $W/drax/date/ideal-v2
cp $W/drax/date/{curse-ideal,dubluri-ideal,nomenclator}.json $W/drax/date/ideal-v2/
cd $W/drax/cod/ideal-v2
T0=$(date +%s); sh lant.sh; echo "lant.sh: $(( $(date +%s) - T0 )) s"
D2=$W/drax/date/ideal-v2
cp $D2/dubluri-placa-raport.json $D2/dubluri-placa-raport-1.json
m1=$(md5sum < $D2/curse-ideal.json); node dubluri-placa.mjs; m2=$(md5sum < $D2/curse-ideal.json)
echo "idempotent curse-ideal: $([ "$m1" = "$m2" ] && echo DA || echo NU)"
cp $D2/dubluri-placa-raport-1.json $D2/dubluri-placa-raport.json
man > $S/manifest-dupa.txt
if diff $S/manifest-inainte.txt $S/manifest-dupa.txt; then echo "MANIFEST IDENTIC"; else echo "MANIFEST DIFERIT"; fi
node $S/compara-ideal.mjs $W/drax/date/schelet-ideal.json $D2 > $D2/ce-s-a-schimbat.md
head -5 $D2/ce-s-a-schimbat.md
( cd $D2 && sha256sum *.json > $S/sha-ideal-v2.txt )
echo "GATA $(date -Is)"
