# compară ieșirile v3 cu referința v2 (sha256), fișier cu fișier
D=/root/lde-worker/drax/date/ideal-v3
for f in curse-ideal.json etalon-ideal.json obs-ideal.json regulate-ideal.json schelet-ideal.json schimburi-ideal.json care-schimb-ideal.json dubluri-ideal.json de-completat.json card-gps-raport.txt control-ideal.log alege-ideal.log etalon-ideal.log; do
  a=$(sha256sum $D/proba/v2/$f 2>/dev/null | cut -c1-16); b=$(sha256sum $D/$f 2>/dev/null | cut -c1-16)
  [ "$a" = "$b" ] && s=IDENTIC || s=DIFERIT; echo "$s $f v2=$a v3=$b"
done
for p in "$@"; do cat $D/proba/STARE-$p 2>/dev/null; done
