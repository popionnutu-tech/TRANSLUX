#!/bin/bash
# F3 E.2–E.3 (execuție ION-94): poarta export → ideal-activ → ideal-v2; exportul scheletului pentru LDE.
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; D2=$W/drax/date/ideal-v2
bash /home/verif/verificator/cod/poarta.sh export $D2 > $S/poarta-export.txt
echo "poarta export: $? ($(wc -l < $S/poarta-export.txt) intrări)"
cd $W/drax/date && ln -sfn ideal-v2 ideal-activ && ls -la ideal-activ && readlink -f ideal-activ
cp $S/export-lde.mjs $W/drax/cod/ideal/export-lde.mjs
node $W/drax/cod/ideal/export-lde.mjs $S/schelet-drax.json
