#!/bin/sh
# Lanțul idealului v3 (ION-97), copie a ideal-v2/lant.sh. Diferența de lanț: schelet-cand.json (urmele candidatelor, desenate de v2
# din tracker + Valhalla) se REFOLOSEȘTE ca intrare — aceleași date de intrare ca v2; lotul 0 nu mai desenează când cache-ul există,
# se desenează doar liniile rămase «de completat» (loturile 1–2, --doar). Rulare: cd /root/lde-worker/drax/cod/ideal-v3 && sh lant.sh
set -e
cd /root/lde-worker/drax/cod/ideal-v3
ENV=/root/lde-worker/.env
D=../../date/ideal-v3
echo "== 1b fix-350"; node fix-350.mjs
echo "== 1b fix-dubluri"; node fix-dubluri.mjs
echo "== 1c dubluri-placa"; node dubluri-placa.mjs
echo "== 1d dispozitiv"; node dispozitiv.mjs
echo "== 2 etalon"; node etalon.mjs > $D/etalon-ideal.log 2>&1; tail -8 $D/etalon-ideal.log
echo "== 2a ore"; node ore.mjs > $D/ore-ideal.log 2>&1; grep -E "^\(a\)|^\(b\)|DECIZIE|^afara" $D/ore-ideal.log
echo "== 3 verif"; node verif.mjs > $D/verif-ideal.log 2>&1; tail -2 $D/verif-ideal.log
for LOT in 0 1 2; do
  if [ "$LOT" = 0 ]; then DOAR="";
    if [ -f $D/schelet-cand.json ]; then echo "== 4 schelet lot 0: cache-ul v2 refolosit (nimic desenat)"; else
      echo "== 4 schelet lot 0"; node --env-file=$ENV schelet.mjs --lot=0 2>&1 | tail -3; fi
  else
    DOAR=$(node dc.mjs)
    if [ -z "$DOAR" ]; then echo "== lot $LOT: nimic de completat"; break; fi
    DOAR="--doar=$DOAR"
    echo "== 4 schelet lot $LOT $DOAR"; node --env-file=$ENV schelet.mjs --lot=$LOT "$DOAR" 2>&1 | tail -3
  fi
  echo "== 5 alege"; node alege.mjs > $D/alege-ideal.log 2>&1; tail -3 $D/alege-ideal.log
done
echo "== 5b schimburi"; node schimburi.mjs > $D/schimburi-ideal.log 2>&1; tail -2 $D/schimburi-ideal.log; node care-schimb.mjs > $D/care-schimb-ideal.log 2>&1
echo "== 5c card GPS"; node card-gps.mjs $D
echo "== 6 control"; node control.mjs | head -5
echo "== 7 pagina"; node pagina.mjs
