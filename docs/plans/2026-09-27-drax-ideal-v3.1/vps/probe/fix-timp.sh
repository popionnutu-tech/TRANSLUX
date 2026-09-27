set -e
cd /root/lde-worker/drax
cp cod/ideal-v3/timp.mjs cod/ideal-v3.1/timp.mjs
cmp cod/ideal-v3.1/timp.mjs /home/verif/verificator/cod/timp.mjs && echo "timp.mjs = verificator (doar comentariul din linia 1 fusese schimbat de sed)"
mv date/ideal-v3.1/GATA date/ideal-v3.1/proba/GATA-prima-timp-gresit
mv date/ideal-v3.1/GATA.sha256 date/ideal-v3.1/proba/GATA.sha256-prima-timp-gresit
bash /tmp/ion99/gata.sh | tail -4
sha256sum date/ideal-v3.1/schelet-ideal.json date/ideal-v3.1/GATA date/ideal-v3.1/GATA.sha256
