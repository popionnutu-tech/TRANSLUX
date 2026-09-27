D=/root/lde-worker/drax/date/ideal-v3
bash /tmp/v3-manifest.sh > $D/proba/manifest-dupa.txt
if diff $D/proba/manifest-inainte.txt $D/proba/manifest-dupa.txt > $D/proba/manifest-diff.txt; then echo "MANIFEST IDENTIC ($(wc -l < $D/proba/manifest-dupa.txt) intrări: ideal-v2, *-ideal.json vechi, cod/ideal-v2, cod/ideal, ideal-activ)"; else echo "MANIFEST DIFERIT"; cat $D/proba/manifest-diff.txt; fi
grep -c "" $D/proba/manifest-dupa.txt; grep ideal-activ $D/proba/manifest-dupa.txt
ls -la /root/lde-worker/drax/date/ideal-v3 | head -40; ls /root/lde-worker/drax/cod/ideal-v3
cd /root/lde-worker/drax/cod/ideal-v3 && sha256sum *.mjs lant.sh > $D/proba/cod-v3.sha256 && cat $D/proba/cod-v3.sha256
