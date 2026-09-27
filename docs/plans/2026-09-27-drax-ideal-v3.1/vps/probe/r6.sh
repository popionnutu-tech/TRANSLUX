D=/root/lde-worker/drax/date/ideal-v3.1
awk -F' \\| ' 'NR>2 && NF>5 { split($2,a," → "); split($3,b," → "); split($4,c," → "); if (a[1]!=a[2] || b[1]!=b[2] || c[1]!=c[2]) print $1" | "$2" | "$3" | "$4 }' $D/proba/compara-v3-v31.md
grep -o "scoase din etalon[^·]*" $D/etalon-ideal.log
grep -E "^picioare|^observații|^picioare cu steag" $D/proba/carpire-statistica.md
mv $D/proba/r1/GATA $D/proba/r1/GATA-r1 2>/dev/null; mv $D/proba/r1/GATA.sha256 $D/proba/r1/GATA.sha256-r1 2>/dev/null
bash /tmp/ion99/gata.sh | tail -3
sha256sum $D/schelet-ideal.json $D/GATA $D/decizii-v3.json; readlink /root/lde-worker/drax/date/ideal-activ; ls -d /tmp/dezb-claude-v31 2>/dev/null || echo "dezb absent"
