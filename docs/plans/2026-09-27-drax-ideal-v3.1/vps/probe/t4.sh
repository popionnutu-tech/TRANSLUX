P=/root/lde-worker/drax/date/ideal-v3.1/proba/cod
cd $P && node mk-test.mjs && node --env-file=/root/lde-worker/.env urme-gol-test.mjs && node carpire-test.mjs; cat /tmp/ion99/test/carpire-raport.json | head -40
