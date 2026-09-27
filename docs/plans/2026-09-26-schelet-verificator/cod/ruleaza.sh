#!/bin/bash
# schelet-verificator (ION-95) v5 (ION-97: decizii-v3.json opțional, timp.mjs sigilat în GATA) — rularea pe COPII, ca utilizatorul `verif` (fără acces la /root; /home/verif și verificator/ ale lui root).
#   bash /home/verif/verificator/cod/ruleaza.sh v4.1                     # sursa: VERIF_SRC, altfel drax/date/ideal-activ, altfel drax/date
#   VERIF_SRC=/root/lde-worker/drax/date/ideal-v2 bash …/ruleaza.sh v4.1 # candidatul: COMPLET, cu marcajul GATA al producătorului
#   bash …/ruleaza.sh proba-r1 <RUN> | proba-registru <RUN> | inchide <RUN>
# Regula de izolare (Codex r2 C2): root NU scrie și NU face chmod/cp/mv NICIODATĂ într-un dosar al lui `verif`. Structura rulării:
#   RUN/ (root) · in/ (root, copiile) · work/ (verif: ieșirea drax.mjs) · out/ (root: verdictul publicat, SIGILIU, log) · diag-out/ (verif)
# Root citește din work/ doar fișiere obișnuite, copiate cu `cp -P` (un link simbolic se copiază ca link și e refuzat, nu urmat).
# Coduri: 0 bine · 2 argumente/sursă/candidat incomplet · 3 copie ≠ sursă · 4 drax.mjs a picat / ieșire suspectă · 5 DATE ATINSE · 6 probă picată.
set -euo pipefail
BAZA=/home/verif/verificator; DRAX=/root/lde-worker/drax; NOD="$(command -v node)"
F3="curse-ideal dubluri-ideal nomenclator obs-ideal schelet-ideal"                  # ce îngheață saptamanal.sh (F3)
INTRARI="schelet-ideal obs-ideal etalon-ideal curse-ideal regulate-ideal schimburi-ideal care-schimb-ideal dubluri-ideal nomenclator"
OPT="decizii-v3"   # v5: intrare OPȚIONALĂ; dacă e în sursă, trebuie să fie în GATA și se copiază și se sigilează ca celelalte
sursa_dosar() { local s="${VERIF_SRC:-$(readlink -e $DRAX/date/ideal-activ 2>/dev/null || echo $DRAX/date)}"; readlink -e "$s"; }
fisier() { local f="$1.json"; if [ "$SRC" = "$(readlink -e $DRAX/date)" ] || [ -f "$SRC/$f" ]; then readlink -e "$SRC/$f"; elif [ "$1" = nomenclator ]; then readlink -e "$DRAX/date/$f"; else return 1; fi; }
candidat_complet() {
  [ "$SRC" = "$(readlink -e $DRAX/date)" ] && return 0
  [ -f "$SRC/GATA" ] || { echo "candidat $SRC fără marcajul GATA — producătorul n-a terminat"; return 1; }
  for f in $INTRARI; do [ "$f" = nomenclator ] && [ ! -f "$SRC/$f.json" ] && continue
    [ -f "$SRC/$f.json" ] || { echo "candidat incomplet: lipsește $f.json"; return 1; }
    grep -q "^$(sha256sum < "$SRC/$f.json" | cut -c1-64)  $f.json$" "$SRC/GATA" || { echo "$f.json ≠ sha-ul din GATA"; return 1; }; done
  for f in $OPT; do [ -f "$SRC/$f.json" ] || continue
    grep -q "^$(sha256sum < "$SRC/$f.json" | cut -c1-64)  $f.json$" "$SRC/GATA" || { echo "$f.json ≠ sha-ul din GATA"; return 1; }; done
  # timp.mjs: copia verificatorului = cea a producătorului (rândul «timp.mjs» din GATA), altfel ziua de lucru diferă
  if grep -q "  timp.mjs$" "$SRC/GATA"; then grep -q "^$(sha256sum < "$BAZA/cod/timp.mjs" | cut -c1-64)  timp.mjs$" "$SRC/GATA" || { echo "cod/timp.mjs ≠ timp.mjs din GATA"; return 1; }; fi; }
manifest() {   # sha256 pe intrări, fișierele F3 și CODUL + DATELE verificatorului (poarta.sh, poarta.mjs, drax.mjs…); stat pe lanțul ideal
  { for f in $OPT; do if [ -f "$SRC/$f.json" ]; then printf 'S %s %s %s\n' "$(sha256sum "$SRC/$f.json" | cut -c1-64)" "$(stat -c '%i %h %s %Y' "$SRC/$f.json")" "$SRC/$f.json"; fi; done
    for f in $INTRARI $F3; do p="$(fisier $f)"; printf 'S %s %s %s\n' "$(sha256sum "$p" | cut -c1-64)" "$(stat -c '%i %h %s %Y' "$p")" "$p"; done
    printf 'S %s %s\n' "$(sha256sum $DRAX/control-ideal.log | cut -c1-64)" "$DRAX/control-ideal.log"
    for p in "$BAZA"/cod/* "$BAZA"/date/*; do printf 'V %s %s %s\n' "$(sha256sum "$p" | cut -c1-64)" "$(stat -c '%U %a %i' "$p")" "$p"; done
    find "$DRAX/date" "$SRC" -maxdepth 1 -type f \( -name '*-ideal.json' -o -name 'nomenclator.json' -o -name GATA \) -printf 'T %i %n %s %T@ %p\n'
    find "$DRAX/cod/ideal" -type f -printf 'T %i %n %s %T@ %p\n'; } | sort -u; }
ruleaza_node() {   # $1 = dosarul rulării; restul = variabile de mediu suplimentare; ieșirea drax.mjs merge în $1/work (al lui verif)
  local R="$1"; shift
  runuser -u verif -- env -C "$R/work" "$@" VERIF_D="$R" VERIF_SRC="$SRC" VERIF_RULEAZA_SHA="$(sha256sum "$BAZA/cod/ruleaza.sh" | cut -c1-64)" TZ=Europe/Chisinau \
    nice -n 10 "$NOD" "$BAZA/cod/drax.mjs"; }
ia_din_work() {   # $1 = fișier din work/ (al lui verif), $2 = destinația în out/ (a lui root): doar fișier obișnuit, fără a urma legături
  cp -P --no-preserve=all "$1" "$2.cp" 2>/dev/null || { echo "lipsește $1"; return 1; }
  if [ -L "$2.cp" ] || [ ! -f "$2.cp" ]; then rm -f "$2.cp"; echo "$1 nu e fișier obișnuit (link?) — refuz"; return 1; fi
  mv "$2.cp" "$2"; chmod 644 "$2"; }
proba_dosar() { local P="$1/$2"; mkdir "$P" "$P/work" "$P/out"; ln -s "$1/in" "$P/in"; chown verif "$P/work"; echo "$P"; }
case "${1:-}" in
  inchide) R="${2:?RUN}"; SRC="$(cat "$R/sursa.txt")"
    manifest > "$R/manifest-final.txt"
    if cmp -s "$R/manifest-inainte.txt" "$R/manifest-final.txt"; then echo "ok $(date -Is)" > "$R/INCHIS"; echo "INCHIS ok: manifestul final = inițial"; exit 0; fi
    echo "DATE ATINSE (inițial ≠ final)"; diff "$R/manifest-inainte.txt" "$R/manifest-final.txt" | head -20 || true; echo "atins $(date -Is)" > "$R/INCHIS"; exit 5 ;;
  proba-r1) R="${2:?RUN}"; SRC="$(cat "$R/sursa.txt")"; P="$(proba_dosar "$R" proba-R1)"
    L="$("$NOD" "$BAZA/cod/prima-linie.mjs" "$R/in/schelet-ideal.json")"
    ruleaza_node "$P" VERIF_SCOATE="$L" > "$P/out/drax.log" 2>&1 || { tail -3 "$P/out/drax.log"; exit 4; }
    ia_din_work "$P/work/verdict.json.tmp" "$P/out/verdict-proba.json" || exit 4
    "$NOD" "$BAZA/cod/proba.mjs" "$P/out/verdict-proba.json" blocant R1 "${L%%|*}" "${L#*|}" && echo "PROBA R1 ok: $L scoasă → blocant R1" || { echo "PROBA R1 PICATĂ ($L)"; exit 6; } ;;
  proba-registru) R="${2:?RUN}"; SRC="$(cat "$R/sursa.txt")"; P="$(proba_dosar "$R" proba-registru)"
    ruleaza_node "$P" VERIF_FARA_REGISTRU=1 > "$P/out/drax.log" 2>&1 || { tail -3 "$P/out/drax.log"; exit 4; }
    ia_din_work "$P/work/verdict.json.tmp" "$P/out/verdict-proba.json" || exit 4
    "$NOD" "$BAZA/cod/proba.mjs" "$P/out/verdict-proba.json" blocant C31 && "$NOD" "$BAZA/cod/proba.mjs" "$R/out/verdict.json" explicat C31 \
      && echo "PROBA REGISTRU ok: fără registru C31 blocant; cu registru C31 explicat" || { echo "PROBA REGISTRU PICATĂ"; exit 6; } ;;
  v*) V="$1"; SRC="$(sursa_dosar)" || { echo "sursa ${VERIF_SRC:-} lipsește"; exit 2; }
    candidat_complet || exit 2
    R="$BAZA/rulari/drax-$V-$(date +%s)"; mkdir "$R"; mkdir "$R/in" "$R/work" "$R/out" "$R/diag-out"   # fără -p: două rulări nu scriu în același dosar
    echo "$SRC" > "$R/sursa.txt"; manifest > "$R/manifest-inainte.txt"
    echo '{' > "$R/in/surse.json"; sep=''
    for f in $INTRARI; do p="$(fisier $f)"; cp --no-preserve=links,mode "$p" "$R/in/$f.json"
      h="$(sha256sum < "$p" | cut -c1-64)"; [ "$h" = "$(sha256sum < "$R/in/$f.json" | cut -c1-64)" ] || { echo "copia $f ≠ sursa"; exit 3; }
      printf '%s "%s.json": { "sursa": "%s", "sha256": "%s" }\n' "$sep" "$f" "$p" "$h" >> "$R/in/surse.json"; sep=','; done
    for f in $OPT; do [ -f "$SRC/$f.json" ] || continue; p="$(readlink -e "$SRC/$f.json")"; cp --no-preserve=links,mode "$p" "$R/in/$f.json"
      h="$(sha256sum < "$p" | cut -c1-64)"; [ "$h" = "$(sha256sum < "$R/in/$f.json" | cut -c1-64)" ] || { echo "copia $f ≠ sursa"; exit 3; }
      printf '%s "%s.json": { "sursa": "%s", "sha256": "%s" }\n' "$sep" "$f" "$p" "$h" >> "$R/in/surse.json"; done
    echo '}' >> "$R/in/surse.json"
    cp "$BAZA/date/ferestre-drax.json" "$BAZA/date/porti-drax.json" "$BAZA/date/explicatii-drax.json" "$R/in/"
    for f in "$R"/in/*; do [ "$(stat -c %h "$f")" = 1 ] || { echo "copia $f are nlink ≠ 1"; exit 3; }; done
    chmod 755 "$R" "$R/in" "$R/out"; chmod 644 "$R"/in/*; chown verif "$R/work" "$R/diag-out"   # dosare noi, goale, create chiar acum de root
    ruleaza_node "$R" > "$R/out/drax.log" 2>&1 || { echo "drax.mjs a picat:"; tail -5 "$R/out/drax.log"; exit 4; }
    ia_din_work "$R/work/verdict.json.tmp" "$R/out/verdict.tmp" && ia_din_work "$R/work/controale.json" "$R/out/controale.json" || exit 4
    manifest > "$R/manifest-dupa.txt"
    if ! cmp -s "$R/manifest-inainte.txt" "$R/manifest-dupa.txt"; then
      mv "$R/out/verdict.tmp" "$R/out/verdict.RESPINS.json"; echo "DATE ATINSE — verdict nepublicat"; diff "$R/manifest-inainte.txt" "$R/manifest-dupa.txt" | head -20 || true; exit 5; fi
    { echo "verdict $(sha256sum < "$R/out/verdict.tmp" | cut -c1-64)"; echo "manifest $(sha256sum < "$R/manifest-inainte.txt" | cut -c1-64)"
      for f in drax.mjs etalon-gps.mjs filtru-rupte.mjs c4.mjs timp.mjs ruleaza.sh poarta.sh poarta.mjs; do echo "$f $(sha256sum < "$BAZA/cod/$f" | cut -c1-64)"; done; } > "$R/out/SIGILIU"
    mv "$R/out/verdict.tmp" "$R/out/verdict.json"                                        # publicat DOAR după manifestul identic, în out/ (root)
    echo "RUN=$R SRC=$SRC"; cat "$R/out/drax.log" ;;
  *) echo "folosire: ruleaza.sh v<N> | inchide <RUN> | proba-r1 <RUN> | proba-registru <RUN>"; exit 2 ;;
esac
