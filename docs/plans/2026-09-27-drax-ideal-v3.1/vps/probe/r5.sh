set -e
D=/root/lde-worker/drax/date/ideal-v3.1
cd /root/lde-worker/drax/cod/ideal-v3.1
node decizii-v31.mjs R6=54.9:1:109.8 "--asteapta=R24|Catranic:29.3:1:58.6:0" > /dev/null
node decizii-v31.mjs R6=54.9:1:109.8 "--asteapta=R24|Catranic:29.3:1:58.6:0"
grep -o '"sursa": "[^"]*"' $D/decizii-v3.json; grep -c "Catranic.*v3.1\|refăcută în v3.1" $D/decizii-v3.json || true
sh lant.sh > /tmp/ion99/lant-r5.log 2>&1; echo "lant exit $?"; grep -E "^card GPS|^decizii|km/zi total" /tmp/ion99/lant-r5.log | tail -3
cd $D && sha256sum *.json > /tmp/ion99/sha-a.txt
cd /root/lde-worker/drax/cod/ideal-v3.1 && sh lant.sh > /tmp/ion99/lant-r6.log 2>&1
cd $D && sha256sum *.json > /tmp/ion99/sha-b.txt && diff /tmp/ion99/sha-a.txt /tmp/ion99/sha-b.txt && echo "REPRODUCERE IDENTICĂ ($(wc -l < /tmp/ion99/sha-b.txt) .json)"
cp /tmp/ion99/lant-r6.log $D/proba/lant-v3.1.log
cd /root/lde-worker/drax/cod/ideal-v3.1 && node mutari.mjs > $D/proba/mutari.md
node $D/proba/cod/r19.mjs > $D/proba/r19-perechi.txt
node $D/proba/cod/stat-c.mjs > $D/proba/carpire-statistica.md
cd $D/proba/cod && node compara-v2-v3.mjs /root/lde-worker/drax/date/ideal-v3 $D > ../compara-v3-v31.md
node $D/proba/cod/diag-r6.mjs > $D/proba/diag-r6.txt
tail -9 $D/proba/compara-v3-v31.md
