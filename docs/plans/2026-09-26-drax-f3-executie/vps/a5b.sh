#!/bin/bash
# F3 pașii A.3–A.5 (execuție ION-94), FĂRĂ --write (verdictul ION-95 lipsește): worker-ul livrat, testul argumentelor,
# nereculul modulului ÎNAINTE de copiere, copierea modulului (.bak + md5 = repo + node --test), rularea de probă într-o BAZA
# separată (drax/date/saptamanal-proba, ca instantaneul real al săptămânii să nu înghețe idealul vechi) + proba de reproducere.
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; O=$S/a5b.out; Z=2026-09-26
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
SA=$W/drax/cod/saptamanal
cp $W/ora-locala.mjs $S/modtest/
( cd $S/modtest && node --test lear-timp-liber.test.mjs > $S/modtest.out 2>&1 || true; grep -E "^# (tests|pass|fail)" $S/modtest.out )
# probă fără --write, BAZA separată
PB=$W/drax/date/saptamanal-proba
echo "== probă 2026-09-14 (fără --write, BAZA=$PB)"
T0=$(date +%s); DRAX_BAZA=$PB /usr/bin/time -f "timp %e s · RSS %M KB" bash $SA/saptamanal.sh 2026-09-14; echo "durata: $(( $(date +%s) - T0 )) s"
cp $PB/2026-09-14/analiza.json $S/analiza-1.json
# proba de reproducere (Codex C3): referințe globale schimbate + tracker și Supabase indisponibile → analiza identică, _ref neatins
REF=$S/ref-modificat; mkdir -p $REF; cp $W/drax/date/{curse-ideal,dubluri-ideal,nomenclator,obs-ideal,schelet-ideal}.json $REF/
node $SA/../saptamanal-proto-$Z/refmod.mjs $REF
( cd $PB/_ref && md5sum * ) > $S/ref-inainte.txt
T0=$(date +%s)
DRAX_BAZA=$PB DRAX_REF_SRC=$REF TRACKER_HOST=127.0.0.1:9 SUPABASE_URL=http://127.0.0.1:9 bash $SA/saptamanal.sh 2026-09-14 > $S/repro.log 2>&1 || { echo "reproducerea a picat"; tail -20 $S/repro.log; }
echo "reproducere: $(( $(date +%s) - T0 )) s · $(grep -c 'din instantaneu' $S/repro.log) × «din instantaneu»"
cmp $S/analiza-1.json $PB/2026-09-14/analiza.json && echo "analiza.json IDENTIC octet cu octet"
( cd $PB/_ref && md5sum * ) | diff $S/ref-inainte.txt - && echo "_ref neatins"
echo "GATA $(date -Is)"
