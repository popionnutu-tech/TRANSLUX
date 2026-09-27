cd /root/lde-worker/drax
echo "--- consumers of impare/pare / care-schimb / schimburi-ideal"
grep -rln "impare\|care-schimb-ideal\|schimburi-ideal" --include=*.mjs --include=*.sh cod/ 2>/dev/null
grep -rn "impare\|isoSapt\|% 2" --include=*.mjs cod/saptamanal cod/ideal/export-lde.mjs cod/economie 2>/dev/null | cut -c1-220 | head -30
echo "--- time in saptamanal / economie"
grep -rn "3 \* 3600\|+ 3\b\|getUTCHours" --include=*.mjs cod/saptamanal cod/economie 2>/dev/null | cut -c1-200 | head
ls cod/saptamanal cod/economie
