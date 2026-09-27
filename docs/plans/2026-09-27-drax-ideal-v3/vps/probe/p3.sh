set -u
# P3 (ION-97): lanțul v3 cu decizii-v3.json + etalon-gps v5; apoi comparația v2 → v3 și manifestul
D=/root/lde-worker/drax/date/ideal-v3
cd /root/lde-worker/drax/cod/ideal-v3
T0=$(date +%s); sh lant.sh > $D/proba/lant-p3.log 2>&1; echo "rc=$? sec=$(( $(date +%s) - T0 ))" > $D/proba/STARE-p3; cat $D/proba/STARE-p3
grep -E "decizii|card GPS|DECIZIILE|km/zi total|salturi|ambigue|^  R" $D/proba/lant-p3.log $D/etalon-ideal.log | head -30
echo --- raport card; grep -E "DECIZIE|DIAGNOSTIC|R24\||R16\|Floresti" $D/card-gps-raport.txt
echo --- compara; cd $D/proba/cod && node compara-v2-v3.mjs $D/proba/v2 $D > $D/proba/compara-v2-v3-p3.md; cat $D/proba/compara-v2-v3-p3.md
bash /tmp/v3-manifest.sh > $D/proba/manifest-dupa-p3.txt; cmp $D/proba/manifest-inainte.txt $D/proba/manifest-dupa-p3.txt && echo "MANIFEST v2 + ideal vechi IDENTIC"
sha256sum $D/schelet-ideal.json
