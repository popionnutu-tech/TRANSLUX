#!/bin/bash
# F3 A.5 (execuție ION-94): prima scriere reală — poarta write → saptamanal.sh --write 2026-09-14 → rândul DRAXELMAIER, apoi
# proba de reproducere pe BAZA reală (referințe schimbate, tracker și Supabase indisponibile, fără --write).
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; O=$S/a5w.out; SA=$W/drax/cod/saptamanal; B=$W/drax/date/saptamanal
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
SRC="$(readlink -f $W/drax/date/ideal-activ)"; echo "ideal-activ → $SRC"
bash /home/verif/verificator/cod/poarta.sh write "$SRC" > $S/poarta-write.txt; echo "poarta write: 0 ($(wc -l < $S/poarta-write.txt) intrări)"
mkdir -p $B; [ -f $B/.pastreaza-pana ] || echo 2026-12-05 > $B/.pastreaza-pana; echo "păstrează până la $(cat $B/.pastreaza-pana)"
T0=$(date +%s); /usr/bin/time -f "timp %e s · RSS %M KB" bash $SA/saptamanal.sh --write 2026-09-14; echo "durata: $(( $(date +%s) - T0 )) s"
# referințele din instantaneu = cele verificate de poartă (sha256)
for f in $B/2026-09-14/{curse-ideal,dubluri-ideal,nomenclator,obs-ideal,schelet-ideal}.json; do h=$(sha256sum < "$f" | cut -c1-64); grep -q "^$h " $S/poarta-write.txt && echo "instantaneu = verificat: $(basename $f)" || echo "instantaneu ≠ verificat: $(basename $f)"; done
cp $B/2026-09-14/analiza.json $S/analiza-w1.json
REF=$S/ref-modificat-2; mkdir -p $REF; cp $SRC/{curse-ideal,dubluri-ideal,nomenclator,obs-ideal,schelet-ideal}.json $REF/
node $W/drax/cod/saptamanal-proto-2026-09-26/refmod.mjs $REF
( cd $B/_ref && sha256sum * ) > $S/ref-w-inainte.txt
DRAX_REF_SRC=$REF TRACKER_HOST=127.0.0.1:9 SUPABASE_URL=http://127.0.0.1:9 bash $SA/saptamanal.sh 2026-09-14 > $S/repro-w.log 2>&1 || { echo "reproducerea a picat"; tail -20 $S/repro-w.log; }
echo "reproducere: $(grep -c 'din instantaneu' $S/repro-w.log) × «din instantaneu»"
cmp $S/analiza-w1.json $B/2026-09-14/analiza.json && echo "analiza.json IDENTIC octet cu octet"
( cd $B/_ref && sha256sum * ) | diff $S/ref-w-inainte.txt - && echo "_ref neatins"
echo "GATA $(date -Is)"
