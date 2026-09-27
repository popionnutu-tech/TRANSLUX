set -e
D=/root/lde-worker/drax/date/ideal-v3.1
mkdir -p $D/proba/r1
for f in mutari-v31.json schelet-ideal.json obs-ideal.json card-gps-raport.txt decizii-v3.json GATA GATA.sha256; do mv $D/$f $D/proba/r1/ 2>/dev/null || cp $D/$f $D/proba/r1/; done
cp $D/proba/r1/schelet-ideal.json $D/proba/r1/obs-ideal.json $D/proba/r1/decizii-v3.json $D/
cp $D/proba/r1/mutari-v31.json $D/proba/mutari-v31-r1.json
mv $D/proba/compara-v3-v31.md $D/proba/r1/ ; mv $D/proba/mutari.md $D/proba/r1/; mv $D/proba/carpire-statistica.md $D/proba/r1/
ls /tmp/dezb-claude-v31 >/dev/null 2>&1 && rm -r /tmp/dezb-claude-v31 && echo "șters /tmp/dezb-claude-v31"; ls -d /tmp/dezb-claude-v31 2>/dev/null || echo "/tmp/dezb-claude-v31 absent"
cd /root/lde-worker/drax/cod/ideal-v3.1 && sh lant.sh 2>&1 | grep -E "scoase din etalon|picioare mutate|^card GPS|R[0-9]+\|.*rezultat|decizia|km/zi total|nimic scris" || true
