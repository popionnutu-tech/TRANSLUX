set -u
D=/root/lde-worker/drax/date/ideal-v3
cd /root/lde-worker/drax/cod/ideal-v3
T0=$(date +%s); sh lant.sh > $D/proba/lant-p2.log 2>&1; echo "rc=$? sec=$(( $(date +%s) - T0 ))" > $D/proba/STARE-p2
bash /tmp/v3-cmp.sh p2
echo ---; grep -E "salturi|ambigue|km/zi total|linii cu ideal|card GPS|rotație|linii:" $D/proba/lant-p2.log $D/etalon-ideal.log $D/alege-ideal.log
echo ---; node $D/proba/cod/proba-ora.mjs; echo ---; node $D/proba/cod/proba-faza.mjs
echo ---; cd $D/proba/cod && node compara-v2-v3.mjs $D/proba/v2 $D > $D/proba/compara-v2-v3.md; cat $D/proba/compara-v2-v3.md
