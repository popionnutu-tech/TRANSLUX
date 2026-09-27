set -e
cd /root/lde-worker/drax
test ! -e date/ideal-v3 && test ! -e cod/ideal-v3 || { echo "ideal-v3 există deja — oprire"; exit 2; }
mkdir -p date/ideal-v3/proba cod/ideal-v3
bash /tmp/v3-manifest.sh > date/ideal-v3/proba/manifest-inainte.txt
# copii (cp, nu link: inode nou, nlink 1)
cp --preserve=timestamps cod/ideal-v2/* cod/ideal-v3/
cp --preserve=timestamps date/ideal-v2/* date/ideal-v3/
rm -f date/ideal-v3/GATA date/ideal-v3/GATA.sha256
sed -i 's#ideal-v2#ideal-v3#g' cod/ideal-v3/*.mjs cod/ideal-v3/lant.sh
# referința v2 (ieșirile lanțului v2, pentru comparație), în proba/
mkdir -p date/ideal-v3/proba/v2
cp --preserve=timestamps date/ideal-v2/*.json date/ideal-v2/*.log date/ideal-v2/*.txt date/ideal-v3/proba/v2/
grep -c "ideal-v2" cod/ideal-v3/* | grep -v ":0" || echo "nicio referință ideal-v2 rămasă în cod/ideal-v3"
stat -c '%i %h %n' date/ideal-v3/curse-ideal.json date/ideal-v2/curse-ideal.json
ls date/ideal-v3 | wc -l
