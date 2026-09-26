#!/bin/bash
# F3 pașii A.3–A.5 (execuție ION-94), FĂRĂ --write (verdictul ION-95 lipsește): worker-ul livrat, testul argumentelor,
# nereculul modulului ÎNAINTE de copiere, copierea modulului (.bak + md5 = repo + node --test), rularea de probă într-o BAZA
# separată (drax/date/saptamanal-proba, ca instantaneul real al săptămânii să nu înghețe idealul vechi) + proba de reproducere.
set -euo pipefail
W=/root/lde-worker; S=/tmp/f3x; O=$S/a345.out; Z=2026-09-26
exec > >(tee -a $O) 2>&1
echo "START $(date -Is)"
SA=$W/drax/cod/saptamanal; AR=$W/drax/cod/saptamanal-proto-$Z
# A.5 (arhivarea, făcută ÎNAINTE de instalare: dosarul prototipului se mută întreg)
if [ ! -e $AR ]; then mv $SA $AR; echo "prototipul mutat în $AR"; fi
mkdir -p $SA
cp $S/final/{saptamanal.sh,saptamanal.test.sh,liber.mjs,scrie-analiza.mjs,de-lamurit.json,nerecul2.sh} $SA/
chmod +x $SA/saptamanal.sh $SA/saptamanal.test.sh $SA/nerecul2.sh
echo "grep proto/|DRAX_MODUL_TL în saptamanal/: $(grep -rn 'proto/\|DRAX_MODUL_TL' $SA/ | wc -l)"
echo "== saptamanal.test.sh"; bash $SA/saptamanal.test.sh | tee $S/test.out | tail -14; echo "trec: $(grep -c '^✓' $S/test.out)/$(grep -c '^[✓✗]' $S/test.out)"
# A.4 (i) nereculul ÎNAINTE de copiere: modulul vechi (livrat) față de cel din repo
echo "== nerecul2"; md5sum $S/lear-timp-liber.mjs
T0=$(date +%s); bash $SA/nerecul2.sh $W/lear-timp-liber.mjs $S/lear-timp-liber.mjs 2026-09-07 2026-09-14; echo "nerecul: $(( $(date +%s) - T0 )) s"
# A.4 (ii–iii)
test -e $W/lear-timp-liber.mjs.bak-$Z || cp -p $W/lear-timp-liber.mjs $W/lear-timp-liber.mjs.bak-$Z
cp $S/lear-timp-liber.mjs $W/lear-timp-liber.mjs
echo "md5 VPS: $(md5sum < $W/lear-timp-liber.mjs | cut -c1-32) (repo 2e2f0b64fcd0dfae844ba66c06b8f8b1)"
mkdir -p $S/modtest && cp $W/lear-timp-liber.mjs $S/lear-timp-liber.test.mjs $S/modtest/
( cd $S/modtest && node --test lear-timp-liber.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)' )
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
