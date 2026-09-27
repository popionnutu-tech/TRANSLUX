#!/bin/sh
# Lanțul idealului v3.1 (ION-99), copie a ideal-v3/lant.sh (cache-ul urmelor candidatelor schelet-cand.json refolosit, ca în v3). Diferențe:
#  · pasul 0: intrarea = curse-ideal-intrare.json (copia octet cu octet a curse-ideal.json din ideal-v3), recopiată la fiecare rulare,
#    ca 1b–1d (care cheie pe km) să vadă cursele NECÂRPITE și rularea să fie reproductibilă;
#  · pasul 1e: goluri-prag.mjs (pragul golului, măsurat pe flotă din proba/goluri-brute.json) + carpire.mjs (golurile cu drumul Valhalla,
#    urmele brute din urme-gol.json, drumurile din cache-ul carpire-valhalla.json);
#  · etalon.mjs: regula satelor în ordine (picioarele pe linia ale cărei sate le ating în ordine) + câmpurile cârpirii pe observații;
#  · alege.mjs: candidatele din cache se iau doar dacă turul și returul lor sunt încă pe aceeași rută|linie.
# Rulare: cd /root/lde-worker/drax/cod/ideal-v3.1 && sh lant.sh
set -e
cd /root/lde-worker/drax/cod/ideal-v3.1
ENV=/root/lde-worker/.env
D=../../date/ideal-v3.1
echo "== 0 intrare"; cp $D/curse-ideal-intrare.json $D/curse-ideal.json.tmp && mv $D/curse-ideal.json.tmp $D/curse-ideal.json
echo "== 1b fix-350"; node fix-350.mjs
echo "== 1b fix-dubluri"; node fix-dubluri.mjs
echo "== 1c dubluri-placa"; node dubluri-placa.mjs
echo "== 1d dispozitiv"; node dispozitiv.mjs
echo "== 1e SĂRIT (proba fără cârpire)"

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
  echo "== 5 alege"; node alege.mjs > $D/alege-ideal.log 2>&1; tail -4 $D/alege-ideal.log
done
echo "== 5b schimburi"; node schimburi.mjs > $D/schimburi-ideal.log 2>&1; tail -2 $D/schimburi-ideal.log; node care-schimb.mjs > $D/care-schimb-ideal.log 2>&1
echo "== 5c card GPS"; node card-gps.mjs $D


