D=/root/lde-worker/drax/date/ideal-v3.1
cd /root/lde-worker/drax/cod/ideal-v3.1
sh lant.sh > /tmp/ion99/lant-r4.log 2>&1; echo "lant exit $?"
grep -E "scoase din etalon|^card GPS|rezultat|decizia|km/zi total|nimic scris|^decizii|candidate din cache" /tmp/ion99/lant-r4.log
grep -E "^R24|^R36|^R6\||^R19|^R32\|Trif|^R27\|Danu" $D/card-gps-raport.txt
node mutari.mjs > $D/proba/mutari.md; grep -E "^picioare mutate|față de rularea 1|pierdută|nouă:" $D/proba/mutari.md | head -40
node $D/proba/cod/r19.mjs
