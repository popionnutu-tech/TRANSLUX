set -e
cd /root/lde-worker/drax
test ! -e date/ideal-v3.1 && test ! -e cod/ideal-v3.1 || { echo "ideal-v3.1 există deja — oprire"; exit 2; }
mkdir -p /tmp/ion99
bash /tmp/ion99/manifest.sh > /tmp/ion99/manifest-inainte.txt
mkdir -p date/ideal-v3.1/proba/v3 cod/ideal-v3.1
cp --preserve=timestamps cod/ideal-v3/* cod/ideal-v3.1/
for f in date/ideal-v3/*; do [ -f "$f" ] && cp --preserve=timestamps "$f" date/ideal-v3.1/; done
rm -f date/ideal-v3.1/GATA date/ideal-v3.1/GATA.sha256
sed -i 's#ideal-v3#ideal-v3.1#g' cod/ideal-v3.1/*.mjs cod/ideal-v3.1/lant.sh
for f in date/ideal-v3/*.json date/ideal-v3/*.log date/ideal-v3/*.txt; do [ -f "$f" ] && cp --preserve=timestamps "$f" date/ideal-v3.1/proba/v3/; done
cp /tmp/ion99/manifest-inainte.txt date/ideal-v3.1/proba/
grep -n "ideal-v3\.1\.1\|ideal-v3[^.]" cod/ideal-v3.1/* || echo "nicio referință ideal-v3 rămasă"
stat -c '%i %h %n' date/ideal-v3.1/curse-ideal.json date/ideal-v3/curse-ideal.json
ls date/ideal-v3.1 | wc -l; wc -l /tmp/ion99/manifest-inainte.txt; tail -3 /tmp/ion99/manifest-inainte.txt
