set -euo pipefail
# ION-99: marcajul GATA al producătorului pe ideal-v3.1, în formatul ideal-v3 («<sha256>  <fișier>.json», toate .json din dosar + timp.mjs).
D=/root/lde-worker/drax/date/ideal-v3.1
cd $D
test ! -e GATA || { echo "GATA există — oprire"; exit 2; }
{ sha256sum *.json; ( cd /root/lde-worker/drax/cod/ideal-v3.1 && sha256sum timp.mjs ); } | sort -k2 > GATA.tmp
cp GATA.tmp GATA.sha256.tmp; mv GATA.sha256.tmp GATA.sha256; mv GATA.tmp GATA
cat GATA
for f in schelet-ideal obs-ideal etalon-ideal curse-ideal regulate-ideal schimburi-ideal care-schimb-ideal dubluri-ideal nomenclator decizii-v3; do
  grep -q "^$(sha256sum < "$f.json" | cut -c1-64)  $f.json$" GATA && echo "ok $f" || echo "LIPSĂ $f"; done
grep -q "^$(sha256sum < /home/verif/verificator/cod/timp.mjs | cut -c1-64)  timp.mjs$" GATA && echo "ok timp.mjs = verificator" || echo "timp.mjs ≠ verificator"
( cd /root/lde-worker/drax/cod/ideal-v3.1 && sha256sum * ) > proba/cod-v3.1.sha256
bash /tmp/ion99/manifest.sh > proba/manifest-dupa.txt
diff <(grep -v "date/ideal-v3.1" /tmp/ion99/manifest-inainte.txt) <(grep -v "date/ideal-v3.1" proba/manifest-dupa.txt) && echo "MANIFEST IDENTIC (ideal-v3, ideal-v2, idealul vechi, ideal-activ)"
