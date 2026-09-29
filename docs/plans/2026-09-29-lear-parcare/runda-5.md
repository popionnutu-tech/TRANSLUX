# ION-143 — runda 5 = Codex runda 2 (după Codex r1: 0/10, 4 observații)

Bază: runda-4.md (metoda v4, trimisă la Codex r1) + runda-1..3.md. Cod actualizat: vps/lear-parcare.mjs, vps/lear-parcare-alege.mjs (NOU, alegerea
locurilor ca funcție pură) + vps/lear-parcare-alege.test.mjs, vps/lear-parcare-valid.mjs (+ valideazaHartaLear), vps/lear-harta.mjs (scrie doar
fișier), vps/publica-lear-parcare.mjs (NOU, înlocuiește scrie-lear-parcare.mjs), vps/lant.sh, vps/patch-sapt.mjs (legarea în lear-saptamanal.sh,
neaplicată încă). Migrații: packages/db/migrations/441_lde_publica_lear_parcare.sql (APLICATĂ, doar funcția), 440_lde_lear_parcare_propusa.sql
(textul regulilor, după verdict). Panoul: apps/admin/src/lib/lde/drax-parcare.ts (DrumProgram, textDrum), harta/HartaClient.tsx, reguli/ParcareDrax.tsx.

## Triaj Codex r1
C1 critical — publicarea neatomică: ACCEPTAT. Funcția lde_publica_lear_parcare (migr. 441) face într-o tranzacție: UPDATE date.parcare (exact
un rând, altfel excepție) + DELETE + INSERT lde_harta_zi; verifică uzina / săptămâna fiecărui rând; doar service_role (REVOKE PUBLIC/anon/
authenticated). Lanțul: lear-parcare → lear-harta (fișier) → publica-lear-parcare (probele parcării ȘI ale hărții înaintea apelului, apoi RPC).
Proba cu eșec injectat (vps/proba-atomic.txt): rândul 41 din 71 cu dată invalidă → HTTP 400, starea publicată identică înainte / după (71 rânduri,
aceeași oră de scriere, același date.parcare.rulat).
C2 high — programul mixt: ACCEPTAT. Harta păstrează toate drumurile zilei, cu loc 0 = «rămâne cum e» și locul unde stă acum; caseta «Parcare
propusă» din hartă listează fiecare drum (ora, de la → P1 X / «rămâne cum e (acum: Y)» → spre, km acum → propus); în raport (ParcareDrax,
LEAR) detaliul mașinii are programul pe drum (date.parcare.masini[].drumuri). Textele spun «unde scrie rămâne cum e, face ca acum». Caz real:
217RST 22.09 — 06:45–12:16 P1 Sărata Nouă 61,8 → 2,4; 16:08–22:34 și 00:28–03:53 rămâne cum e (acum Călinești).
C3 high — munca recuperată arătată ca gol: ACCEPTAT. Tăierea golului lungește bucățile de muncă (a.t1 = tE, b.t0 = tS), iar bucățile exportate
(și harta) se fac după aceea — o singură segmentare. Verificat: 189OMM 22.09 pe hartă «04:22–05:28 cursa Călugăr → poarta» (golul se termină la
Călugăr, nu la Gherman); km pe intervale = km zilei (0 abateri).
C4 high — alegerea înaintea regulii de 4 km: ACCEPTAT. Pe fiecare drum, dintre locurile alese, doar cele eligibile (> 4 km de unde stă, câștig ≥
max(2 km, 5 %)), apoi cel mai ieftin; niciunul = rămâne cum e. Contraexemplul Codex e probă (lear-parcare-alege.test.mjs): perechea A + B =
120 km, grupul 1 prin B, grupul 2 prin A; plus probe pentru pragul de câștig și «locul mai scump rămâne cum e». 4/4 trec.

## Rezultat 21–27.09 (publicat în bază, pagina încă nelivrată)
LEAR Ungheni −3.424,9 km/săpt. · LEAR Florești −812 km/săpt. (aceleași cifre ca r4: C3 schimbă doar categoria pe hartă, C4 nu schimbă alegerea
pe datele reale). vitest src/lib/lde 395/395, tsc curat.

## Întrebări
1. Mai rămâne ceva critical / high?
2. Tranzacția prin RPC cu ~1,5 MB JSON — limite (PostgREST, statement_timeout) pentru rularea de luni?
