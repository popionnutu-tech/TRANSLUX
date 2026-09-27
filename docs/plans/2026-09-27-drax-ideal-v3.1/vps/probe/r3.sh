set -e
D=/root/lde-worker/drax/date/ideal-v3.1
cd /root/lde-worker/drax/cod/ideal-v3.1
node decizii-v31.mjs R6=54.9:1:109.8 "--asteapta=R24|Catranic:29.3:1:58.6:0"
sh lant.sh > /tmp/ion99/lant-r4.log 2>&1 || true
grep -E "scoase din etalon|^card GPS|rezultat|decizia|km/zi total|nimic scris|^decizii" /tmp/ion99/lant-r4.log
grep -E "^R24|^R36|^R6\||^R19|^R32\|Trif" $D/card-gps-raport.txt
