#!/bin/bash
# Idealul v2 — sursa identității dispozitivului (execuție ION-94, E.1b). DOAR CITIRE din tracker; scrie numai în drax/cod/ideal-v2-extr (sub /root/lde-worker ca să găsească node_modules/pg) și
# dispozitive-sursa.json în drax/date/ideal-v2. Aceeași extracție ca lanțul (curse.mjs din ideal-v2, aceeași fereastră), cu `dev` pe
# fiecare cursă, doar pentru plăcile cu 2 dispozitive din flota-ideal.json (880RNK + 0357544371228442, 350KAJ#2284, 034BRAT#2293).
set -euo pipefail
W=/root/lde-worker; X=$W/drax/cod/ideal-v2-extr; D2=$W/drax/date/ideal-v2
test ! -e $X
mkdir -p $X/cod/x $X/date/ideal-v2
cp $W/drax/date/flota-ideal.json $W/drax/date/ideal-v2/nomenclator.json $X/date/ideal-v2/
sed 's|curse.push({ m: d.placa, t0: a.t|curse.push({ m: d.placa, dev: d.id, t0: a.t|' $W/drax/cod/ideal-v2/curse.mjs > $X/cod/x/curse.mjs
grep -q 'dev: d.id' $X/cod/x/curse.mjs
DUBLE=$(node /tmp/f3x/duble.mjs $X/date/ideal-v2/flota-ideal.json)
echo "plăci duble: $DUBLE"
cd $X/cod/x && T0=$(date +%s) && node --env-file=$W/.env curse.mjs --doar=$DUBLE 2>&1 | tail -8; echo "extracție: $(( $(date +%s) - T0 )) s"
node /tmp/f3x/duble.mjs $X/date/ideal-v2/flota-ideal.json $X/date/ideal-v2/curse-ideal.json $D2/dispozitive-sursa.json
cp $W/drax/date/flota-ideal.json $D2/flota-ideal.json
