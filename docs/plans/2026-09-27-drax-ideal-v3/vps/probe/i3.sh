cd /root/lde-worker/drax/cod
sed -n 1,50p economie/comun.mjs | cut -c1-250
echo ----EXPORT
grep -n "schimb\|impare\|pare\|ideal-activ\|readFileSync" ideal/export-lde.mjs | cut -c1-250
echo ----SAPT
grep -rn "impare\|_iso\|isoW\|paritate\|faza" saptamanal/*.mjs saptamanal/*.sh economie/*.mjs | cut -c1-200 | head -20
