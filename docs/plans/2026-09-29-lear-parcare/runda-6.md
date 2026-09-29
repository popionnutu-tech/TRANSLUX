# ION-143 — runda 6 = Codex runda 3 (după Codex r2: 6,0/6,5, C5 high + C6 medium)

Bază: runda-5.md (C1–C4 închise, necontestate în r2). Cod: vps/lear-parcare.mjs, vps/publica-lear-parcare.mjs. Probe: vps/proba-c5-c6.txt.

## Triaj Codex r2
C5 high — lista goală de candidați oprea uzina: ACCEPTAT. Fără niciun candidat cu drum Valhalla, mașina iese fără propunere cu motivul
«niciun loc cu drum pe șosea (Valhalla) spre capetele drumurilor ei», înainte de alegeLocuri; celelalte continuă. Proba (vps/proba-c5-c6.txt):
LEAR_PARCARE_FARA_DRUM=827MUM simulează Valhalla fără drum pentru 827MUM → 827MUM «niciun loc cu drum…», uzina se calculează (−2.762,1 fără ea),
809MUM și restul neschimbate; exit 0.
C6 medium — marja RPC: ACCEPTAT. Măsurat:
- limita efectivă: statement_timeout 8 s pe rolul authenticator (pg_roles: authenticator statement_timeout=8s, lock_timeout=8s; service_role fără
  setare proprie), deci 8 s pentru RPC;
- cererea întreagă, octeți UTF-8: Ungheni 1,55 MB, Florești 0,55 MB;
- durata cap la cap (urcare + tranzacție + răspuns), de pe VPS: Ungheni 4,1 / 2,9 / 1,5 / 2,2 s (4 publicări), Florești 2,4 s.
Marja: ≈ 2× față de cel mai rău caz măsurat. Cererea crește doar cu mașini × zile (71 rânduri Ungheni, 30 Florești); publica-lear-parcare.mjs
refuză înainte de apel peste 2,5 MB. Dacă totuși trece de 8 s, Postgres anulează tranzacția (57014 recunoscut în mesaj): nimic schimbat
(dovedit la C1), lanțul iese ≠ 0, rulează din nou de mână. AbortSignal 120 s pe fetch.

## Întrebare
Mai rămâne ceva critical / high?
