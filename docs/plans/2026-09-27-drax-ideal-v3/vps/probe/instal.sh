set -euo pipefail
# ION-97: verificatorul v4.1 → v5 (verdictul ideal-v3, alinierile a–d). Copia v4.1 în arhiva-v4.1-root/cod (+ SHA256); rulările vechi neatinse.
B=/home/verif/verificator
test ! -e $B/arhiva-v4.1-root || { echo "arhiva există — oprire"; exit 2; }
mkdir -p $B/arhiva-v4.1-root/cod
cp -a $B/cod/. $B/arhiva-v4.1-root/cod/
( cd $B/arhiva-v4.1-root/cod && sha256sum * > SHA256 )
for f in drax.mjs etalon-gps.mjs ruleaza.sh poarta.mjs timp.mjs; do install -o root -g root -m 644 /tmp/v3-verif-5/$f $B/cod/$f; done
cd $B/cod && sha256sum drax.mjs etalon-gps.mjs ruleaza.sh poarta.mjs timp.mjs filtru-rupte.mjs c4.mjs poarta.sh
cmp $B/cod/timp.mjs /root/lde-worker/drax/cod/ideal-v3/timp.mjs && echo "timp.mjs verificator = lanț"
ls -la $B/cod
