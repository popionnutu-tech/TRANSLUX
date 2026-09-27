# rulează lanțul v3 în fundal; pas = eticheta rulării; scrie lant-<pas>.log și STARE-<pas>
set -u
PAS=$1
D=/root/lde-worker/drax/date/ideal-v3
cd /root/lde-worker/drax/cod/ideal-v3
( T0=$(date +%s); sh lant.sh > $D/proba/lant-$PAS.log 2>&1; RC=$?; echo "rc=$RC sec=$(( $(date +%s) - T0 ))" > $D/proba/STARE-$PAS ) &
echo pornit $PAS
