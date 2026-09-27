set -u
D=/root/lde-worker/drax/date/ideal-v3
cd /root/lde-worker/drax/cod/ideal-v3
T0=$(date +%s); sh lant.sh > $D/proba/lant-p1.log 2>&1; echo "rc=$? sec=$(( $(date +%s) - T0 ))" > $D/proba/STARE-p1
bash /tmp/v3-cmp.sh p1
echo ---; tail -12 $D/proba/lant-p1.log
echo ---; node $D/proba/cod/proba-ora.mjs; echo ---; node $D/proba/cod/proba-faza.mjs
