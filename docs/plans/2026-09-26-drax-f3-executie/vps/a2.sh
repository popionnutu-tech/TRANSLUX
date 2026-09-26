#!/bin/bash
# F3 pasul A.2 (reluat): câmpurile aditive (garda pe «curseDePranz»: «nelamuritLista» exista deja o dată în fișier) + proba (b).
set -euo pipefail
W=/root/lde-worker; EC=$W/drax/cod/economie; S=/tmp/f3x; O=$S/a2.out; Z=2026-09-26; C1=$W/drax/f2-copie-$Z-b
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
cmp -s $EC/alternative.mjs $EC/alternative.mjs.bak-$Z && echo "alternative.mjs = .bak (nepatch-uit)"
grep -q curseDePranz $EC/alternative.mjs || node $S/patch-alt.mjs $EC/alternative.mjs
node --check $EC/alternative.mjs
cmp $EC/alternative.mjs $W/drax/cod/saptamanal/econ/alternative.mjs && echo "alternative.mjs = prototipul econ/"
T0=$(date +%s); env -u ECON_D bash $EC/lant.sh --fara-urme > $S/lant-b2.log 2>&1; echo "lant (b): $(( $(date +%s) - T0 )) s"
node $S/cmp-econ.mjs $C1 $W/drax/date --fara-chei
echo "GATA $(date -Is)"
