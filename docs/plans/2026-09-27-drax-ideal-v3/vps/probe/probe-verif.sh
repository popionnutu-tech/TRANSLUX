#!/bin/bash
# ION-97: probele verificatorului v5 după schimbare, pe sursa deja verificată ideal-v2 (NU pe ideal-v3: verificarea 3 o face sesiunea).
# Scrie totul în /root/lde-worker/drax/date/ideal-v3/proba/verif-v5/ (al lanțului, root); rulările noi în rulari/ (cele vechi neatinse).
set -u
O=/root/lde-worker/drax/date/ideal-v3/proba/verif-v5b; mkdir -p $O; exec > $O/probe.log 2>&1
B=/home/verif/verificator; RUL=$B/rulari
echo "== start $(date -Is)"
ls $RUL > $O/rulari-inainte.txt
echo "== 1 rulare v5 pe ideal-v2"; VERIF_SRC=/root/lde-worker/drax/date/ideal-v2 bash $B/cod/ruleaza.sh v5-proba > $O/rulare.out 2>&1; echo "cod $?"; tail -4 $O/rulare.out
R=$(grep -o 'RUN=[^ ]*' $O/rulare.out | head -1 | cut -d= -f2); echo "RUN=$R"
echo "== 2 inchide"; bash $B/cod/ruleaza.sh inchide "$R"; echo "cod $?"
echo "== 3 proba R1"; bash $B/cod/ruleaza.sh proba-r1 "$R"; echo "cod $?"
echo "== 4 proba registru"; bash $B/cod/ruleaza.sh proba-registru "$R"; echo "cod $?"
echo "== 5 proba C4 pe dispozitiv (sintetică)"; ( cd /tmp && runuser -u verif -- node $B/cod/proba.mjs c4 ); echo "cod $?"
echo "== 6 poarta"
bash $B/cod/poarta.sh export; echo "fără sursă: cod $? (aștept 2)"
POARTA_VERDICT=/tmp bash $B/cod/poarta.sh export /root/lde-worker/drax/date/ideal-v2 > /dev/null; echo "POARTA_VERDICT în /tmp: cod $? (aștept 2)"
bash $B/cod/poarta.sh export /root/lde-worker/drax/date/ideal-v3 > /dev/null; echo "export ideal-v3 fără verdict v5: cod $? (aștept 3)"
bash $B/cod/poarta.sh export /root/lde-worker/drax/date/ideal-v2 > /dev/null; echo "export ideal-v2 (verdictul probei v5): cod $?"
bash $B/cod/poarta.sh export /root/lde-worker/drax/date > /dev/null; echo "export drax/date: cod $? (aștept 3)"
T=$RUL/test-alterat-v5-$(date +%s); cp -a "$R" "$T"; printf ' ' >> "$T/out/verdict.json"
POARTA_VERDICT="$T/out/verdict.json" bash $B/cod/poarta.sh export /root/lde-worker/drax/date/ideal-v2 > /dev/null; echo "verdict alterat: cod $? (aștept 3)"
echo "== 7 link simbolic în work/ (ia_din_work din ruleaza.sh, extrasă textual)"
L=$RUL/test-link-v5-$(date +%s); mkdir -p "$L/work" "$L/out"; chown verif "$L/work"
runuser -u verif -- ln -s /etc/hostname "$L/work/verdict.json.tmp"
sed -n '/^ia_din_work() {/,/^  mv "\$2.cp" "\$2"; chmod 644 "\$2"; }/p' $B/cod/ruleaza.sh > $O/ia_din_work.sh
( source $O/ia_din_work.sh; ia_din_work "$L/work/verdict.json.tmp" "$L/out/verdict.json" ); echo "cod $? (aștept 1 = refuz)"; ls -la "$L/out"
echo "== 8 fișierele de verdict ale probei"; grep -m1 '"tz"' "$R/out/verdict.json"
grep -E "valid_pentru_export|blocante" "$R/out/drax.log" | head -3; cat "$R/out/SIGILIU"
ls $RUL > $O/rulari-dupa.txt; echo "rulări noi:"; comm -13 $O/rulari-inainte.txt $O/rulari-dupa.txt
echo "== gata $(date -Is)"; echo gata > $O/STARE
