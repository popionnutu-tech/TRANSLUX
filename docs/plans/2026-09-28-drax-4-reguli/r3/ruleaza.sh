mkdir -p /tmp/ion120r3/d
[ -f /tmp/ion120r3/d/economie-valhalla-cache.json ] || cp /tmp/ion120r2/d/economie-valhalla-cache.json /tmp/ion120r3/d/
cd /tmp/ion120r3 && time ECON_D=/tmp/ion120r3/d node patru-reguli-v3.mjs > out.txt 2> err.txt; echo rc=$?
tail -5 err.txt; wc -c out.txt
