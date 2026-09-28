#!/bin/bash
# ION-123 r3 — proba explicită a aliasului «0357544371228442» → 880RNK: aceeași săptămână, dar directorul urmei lui 880RNK
# redenumit după dispozitiv (legături simbolice într-un dosar nou din /tmp, originalele neatinse). Trebuie să iasă identic cu rularea principală.
set -e
S=/root/lde-worker/drax/date/saptamanal/2026-09-14; R=/tmp/ion123r3/proba-alias-$(date +%s); T=$R/2026-09-14
mkdir -p $T/economie-urme
for f in $S/*.json; do ln -s $f $T/; done
for d in $S/economie-urme/*; do n=$(basename "$d"); [ "$n" = 880RNK ] && n=0357544371228442; ln -s "$d" "$T/economie-urme/$n"; done
ls $T/economie-urme | grep -E '0357|880' || true
cd /tmp/ion123r3
ECON_D=/tmp/ion123r3 SAPT_D=$T OUT=$R/v3-alias880.json node /tmp/ion123r3/ziua-ideala-v3.mjs > $R/stdout.json 2> $R/stderr.log
cat $R/stderr.log
node /tmp/ion123r3/cmp-alias.mjs $R/v3-alias880.json
