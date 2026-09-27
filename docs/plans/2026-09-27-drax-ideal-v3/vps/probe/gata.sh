set -euo pipefail
# ION-97: marcajul GATA al producătorului pe ideal-v3 (după P3), în formatul ideal-v2 («<sha256>  <fișier>.json», toate .json din dosar)
# + rândul «timp.mjs» (copia lanțului; ruleaza.sh v5 cere cod/timp.mjs al verificatorului identic). GATA.sha256 = același conținut (ca v2).
D=/root/lde-worker/drax/date/ideal-v3
cd $D
test ! -e GATA || { echo "GATA există — oprire"; exit 2; }
{ sha256sum *.json; ( cd /root/lde-worker/drax/cod/ideal-v3 && sha256sum timp.mjs ); } | sort -k2 > GATA.tmp
cp GATA.tmp GATA.sha256.tmp; mv GATA.sha256.tmp GATA.sha256; mv GATA.tmp GATA
cat GATA
# verificarea cu aceleași comenzi ca ruleaza.sh candidat_complet
for f in schelet-ideal obs-ideal etalon-ideal curse-ideal regulate-ideal schimburi-ideal care-schimb-ideal dubluri-ideal nomenclator decizii-v3; do
  grep -q "^$(sha256sum < "$f.json" | cut -c1-64)  $f.json$" GATA && echo "ok $f" || echo "LIPSĂ $f"; done
grep -q "^$(sha256sum < /home/verif/verificator/cod/timp.mjs | cut -c1-64)  timp.mjs$" GATA && echo "ok timp.mjs = verificator"
