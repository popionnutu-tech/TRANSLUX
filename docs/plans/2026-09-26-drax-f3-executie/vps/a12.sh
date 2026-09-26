#!/bin/bash
# F3 pașii A.1–A.2 (execuție ION-94): ECON_D în comun.mjs + proba (a); câmpurile aditive în alternative.mjs + proba (b).
set -euo pipefail
W=/root/lde-worker; EC=$W/drax/cod/economie; S=/tmp/f3x; O=$S/a12.out; Z=2026-09-26
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
# econ/ din prototip = economie/ + cele două schimbări? (restul fișierelor trebuie să fie identice)
for f in $EC/*.mjs; do b=$(basename $f); cmp -s $f $W/drax/cod/saptamanal/econ/$b && echo "econ/$b = economie/$b" || echo "econ/$b DIFERĂ"; done
C0=$W/drax/f2-copie-$Z-a; C1=$W/drax/f2-copie-$Z-b
test ! -e $C0 && mkdir -p $C0 && cp -p $W/drax/date/economie*.json $W/drax/economie.html $C0/
# A.1
test -e $EC/comun.mjs.bak-$Z || cp -p $EC/comun.mjs $EC/comun.mjs.bak-$Z
grep -q "process.env.ECON_D" $EC/comun.mjs || sed -i "s|^export const D = '/root/lde-worker/drax/date';|export const D = process.env.ECON_D \|\| '/root/lde-worker/drax/date';|" $EC/comun.mjs
grep -q "process.env.ECON_D" $EC/comun.mjs; sed -n 7p $EC/comun.mjs; node --check $EC/comun.mjs
T0=$(date +%s); env -u ECON_D bash $EC/lant.sh --fara-urme > $S/lant-a.log 2>&1; echo "lant (a): $(( $(date +%s) - T0 )) s"
node $S/cmp-econ.mjs $C0 $W/drax/date
# A.2
mkdir -p $C1 && cp -p $W/drax/date/economie*.json $W/drax/economie.html $C1/
test -e $EC/alternative.mjs.bak-$Z || cp -p $EC/alternative.mjs $EC/alternative.mjs.bak-$Z
grep -q nelamuritLista $EC/alternative.mjs || node $S/patch-alt.mjs $EC/alternative.mjs
cmp $EC/alternative.mjs $W/drax/cod/saptamanal/econ/alternative.mjs && echo "alternative.mjs = prototipul econ/"
T0=$(date +%s); env -u ECON_D bash $EC/lant.sh --fara-urme > $S/lant-b.log 2>&1; echo "lant (b): $(( $(date +%s) - T0 )) s"
node $S/cmp-econ.mjs $C1 $W/drax/date --fara-chei
echo "GATA $(date -Is)"
