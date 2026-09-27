true
P=/root/lde-worker/drax/date/ideal-v3.1/proba
rm -f $P/goluri-scan.stare
cd $P/cod && setsid nohup node --env-file=/root/lde-worker/.env goluri-scan.mjs > ../goluri-scan.log 2>&1 < /dev/null &
sleep 2; pgrep -fa goluri-scan | head -3
