// F3 pasul D (execuție ION-94): blocul Drăxlmaier în lear-saptamanal.sh (+ test) și paznicul de luni. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs';
const R = process.argv[2];
const ed = (f, pasi) => { let s = readFileSync(`${R}/${f}`, 'utf8'); for (const [a, b, gata] of pasi) { if (gata && s.includes(gata)) continue; if (!s.includes(a)) throw new Error(`${f}: ${a.slice(0, 60)}`); s = s.replace(a, b); } writeFileSync(`${R}/${f}`, s); console.log(f, 'ok'); };
ed('lde-geo-worker/lear-saptamanal.sh', [
  [`  echo "briceni saptamanal: rularea a picat, a depășit 90 min sau lock-ul e ocupat" >&2; picat=1
fi
`, `  echo "briceni saptamanal: rularea a picat, a depășit 90 min sau lock-ul e ocupat" >&2; picat=1
fi

# Drăxlmaier Bălți (ION-86, F3 / ION-94): analiza săptămânii → lde_analiza_reguli «DRAXELMAIER». 78–93 s (proba 26.09), timeout ≈ 3 × durata.
# Scrie doar o săptămână încheiată și doar cu proba P10 trecută (altfel analiza-respinsa.json și cod 1; paznicul vede rândul lipsă).
# Fără flock exterior: workerul are lock-ul lui (/tmp/drax-sapt.lock, flock -w 30).
DRAX_SAPT="\${DRAX_SAPT:-$LDE_DIR/drax/cod/saptamanal/saptamanal.sh}"
LIMITA_D=(); command -v timeout >/dev/null && LIMITA_D=(timeout 280)
if ! nice -n 10 \${LIMITA_D[@]+"\${LIMITA_D[@]}"} bash "$DRAX_SAPT" --write; then
  echo "drax saptamanal: rularea a picat (P10? vezi scrie.log), a depășit 280 s sau lock-ul e ocupat" >&2; picat=1
fi
`, 'DRAX_SAPT='],
  [`cheama "lde-timp-liber?uz=floresti"
`, `cheama "lde-timp-liber?uz=floresti"
# Drăxlmaier (ION-94): doar proba mesajului de timp liber (dry) — posterul, indicațiile și mesajul ADMIN NU pleacă până la «da»-ul lui Ion.
cheama "drax-optimizari?liber=1&dry=1"
`, 'drax-optimizari?liber=1&dry=1'],
]);
ed('lde-geo-worker/lear-saptamanal.test.sh', [
  ['#   workeri OK             → cinci apeluri curl (SEBN, Briceni, Ungheni, Florești, paznic)',
   '#   workeri OK             → șase apeluri curl (SEBN, Briceni, Ungheni, Florești, Drăxlmaier dry, paznic)', 'șase apeluri curl'],
  ['#   Briceni picat (ION-73) → tot cinci apeluri (ruta posterului Briceni vede analiza lipsă, nu trimite), cod ≠ 0',
   '#   Briceni picat (ION-73) → tot șase apeluri (ruta posterului Briceni vede analiza lipsă, nu trimite), cod ≠ 0\n#   Drăxlmaier picat (ION-94) → tot șase apeluri (ruta Drăxlmaier în dry fără rând întoarce 200), cod ≠ 0', 'Drăxlmaier picat (ION-94)'],
  ['mkdir -p "$T/bin" "$T/lde/briceni/cod"', 'mkdir -p "$T/bin" "$T/lde/briceni/cod" "$T/lde/drax/cod/saptamanal"', 'drax/cod/saptamanal"'],
  [`printf '#!/usr/bin/env bash\\nexit "\${FAKE_BRICENI_EXIT:-0}"\\n' > "$T/lde/briceni/cod/saptamanal.sh"
`, `printf '#!/usr/bin/env bash\\nexit "\${FAKE_BRICENI_EXIT:-0}"\\n' > "$T/lde/briceni/cod/saptamanal.sh"
# ION-94: analiza Drăxlmaier, falsă; pică doar cu FAKE_DRAX_EXIT; primește --write (forma blocului de luni)
printf '#!/usr/bin/env bash\\n[ "$1" = --write ] || exit 9\\nexit "\${FAKE_DRAX_EXIT:-0}"\\n' > "$T/lde/drax/cod/saptamanal/saptamanal.sh"
`, 'FAKE_DRAX_EXIT:-0'],
  ['FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "workeri OK → cinci apeluri (4 uzine + paznic)" 5 0', 'FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "workeri OK → șase apeluri (5 uzine + paznic)" 6 0', '(5 uzine + paznic)'],
  [`grep -q "uz=floresti" "$FAKE_CURL_LOG" && tail`, `grep -q "uz=floresti" "$FAKE_CURL_LOG" && grep -q "drax-optimizari?liber=1&dry=1" "$FAKE_CURL_LOG" && ! grep -q "drax-optimizari?poster\\|drax-optimizari?indicatii" "$FAKE_CURL_LOG" && tail`, 'drax-optimizari?liber=1&dry=1" "$FAKE_CURL_LOG"'],
  ['caz "worker picat → tot cinci apeluri, cod ≠ 0"   5 1', 'caz "worker picat → tot șase apeluri, cod ≠ 0"   6 1', 'tot șase apeluri, cod ≠ 0"   6'],
  ['caz "lock ocupat → tot cinci apeluri, cod ≠ 0"    5 1', 'caz "lock ocupat → tot șase apeluri, cod ≠ 0"    6 1', 'lock ocupat → tot șase'],
  ['caz "Briceni picat → tot cinci apeluri, cod ≠ 0" 5 1', 'caz "Briceni picat → tot șase apeluri, cod ≠ 0" 6 1\nFAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 FAKE_DRAX_EXIT=1 caz "Drăxlmaier picat → tot șase apeluri, cod ≠ 0" 6 1', 'Drăxlmaier picat → tot'],
]);
ed('apps/admin/src/lib/lde/luni-paznic.ts', [
  [`  { nume: 'Trox + suburban Briceni', rind: 'BRICENI', poster: BRICENI_POSTER_LAST_KEY as string | null, indicatii: null },
`, `  { nume: 'Trox + suburban Briceni', rind: 'BRICENI', poster: BRICENI_POSTER_LAST_KEY as string | null, indicatii: null },
  // ION-94 (F3): analiza Drăxlmaier se scrie lunea (drax/cod/saptamanal); posterul și indicațiile NU pleacă până la «da»-ul lui Ion,
  // deci aici se cere doar rândul. La «da»: poster = DRAX_POSTER_LAST_KEY, indicatii = cheiaIndicatiilor('drax').
  { nume: 'Drăxlmaier Bălți', rind: 'DRAXELMAIER', poster: null, indicatii: null },
`, "rind: 'DRAXELMAIER'"],
  [`Briceni: bash /root/lde-worker/briceni/cod/saptamanal.sh, apoi /api/cron/briceni-optimizari?send=1&force=1.\`;`,
   `Briceni: bash /root/lde-worker/briceni/cod/saptamanal.sh, apoi /api/cron/briceni-optimizari?send=1&force=1. \` +
    \`Drăxlmaier: dacă drax/date/saptamanal/<luni>/scrie.log arată „P10 picat”, rerularea NU ajută (instantaneul e același) — diagnosticul e în analiza-respinsa.json; altfel bash /root/lde-worker/drax/cod/saptamanal/saptamanal.sh --write <luni>.\`;`, 'Drăxlmaier: dacă'],
]);
ed('apps/admin/src/lib/lde/luni-paznic.test.ts', [
  ["const rapoarte = new Set(['LEAR Ungheni', 'LEAR Florești', 'SEBN', 'BRICENI']);", "const rapoarte = new Set(['LEAR Ungheni', 'LEAR Florești', 'SEBN', 'BRICENI', 'DRAXELMAIER']);", "'BRICENI', 'DRAXELMAIER'"],
  [`      { uzina: 'Trox + suburban Briceni', ce: 'raport' },
    ]);`, `      { uzina: 'Trox + suburban Briceni', ce: 'raport' },
      { uzina: 'Drăxlmaier Bălți', ce: 'raport' },
    ]);`, "{ uzina: 'Drăxlmaier Bălți', ce: 'raport' },\n    ]);"],
]);
let t = readFileSync(`${R}/apps/admin/src/lib/lde/luni-paznic.test.ts`, 'utf8');
if (!t.includes('Drăxlmaier: se cere doar rândul')) {
  t = t.replace(/\n\}\);\s*$/, `
  it('Drăxlmaier: se cere doar rândul (posterul și indicațiile nu pleacă până la «da», ION-94)', () => {
    const fara = new Set(rapoarte); fara.delete('DRAXELMAIER');
    expect(lipsurileLunii(S, fara, toate)).toEqual([{ uzina: 'Drăxlmaier Bălți', ce: 'raport' }]);
    expect(lipsurileLunii(S, rapoarte, new Map(toate)).some((x) => x.uzina.startsWith('Drăxlmaier'))).toBe(false);
    expect(textLuniPaznic(S, [{ uzina: 'Drăxlmaier Bălți', ce: 'raport' }])).toContain('analiza-respinsa.json');
  });
});
`);
  writeFileSync(`${R}/apps/admin/src/lib/lde/luni-paznic.test.ts`, t); console.log('test drax ok');
}
