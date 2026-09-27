D=/root/lde-worker/drax/date/ideal-v3.1
cd $D && sha256sum *.json > /tmp/ion99/sha-r2.txt
cd /root/lde-worker/drax/cod/ideal-v3.1 && sh lant.sh > /tmp/ion99/lant-r3.log 2>&1; echo "lant exit $?"
cd $D && sha256sum *.json > /tmp/ion99/sha-r3.txt
diff /tmp/ion99/sha-r2.txt /tmp/ion99/sha-r3.txt && echo "REPRODUCERE IDENTICĂ ($(wc -l < /tmp/ion99/sha-r3.txt) fișiere .json)"
cp /tmp/ion99/lant-r3.log $D/proba/lant-v3.1.log
