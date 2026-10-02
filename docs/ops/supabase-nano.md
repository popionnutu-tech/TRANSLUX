# Baza TRANSLUX pe instanța Supabase NANO: ce are voie să ruleze ziua

Proiect `zqkzqpfdymddsywxjxow` (eu-west-1), instanța **NANO**: shared_buffers 224 MB, work_mem ~2 MB,
maintenance_work_mem 32 MB, max_connections 60, baza ~1,9 GB. Planul Pro include gratuit Micro; ridicarea la
Small (~15 $/lună) sau Medium (~50 $/lună) e decizia lui Ion. Dacă instanța crește, regulile de mai jos rămân bune,
doar marja se mărește.

## Regula

**Nimic greu între 05:00 și 23:00 (ora Chișinăului).** Pe NANO o funcție grea (refaceri de luni întregi, sortări peste
work_mem → fișiere temporare, checkpoint-uri de mii de pagini) pune jos tot ce stă pe aceeași mașină: site-ul
translux.md, botul, panoul, agentul vocal. Așa s-a întâmplat pe 01.10.2026 (vezi `2026-10-01-supabase-incident.md`).

| Ce | Când | Unde e regula |
|---|---|---|
| Importul Mobilet (8 zile, upsert) | 03:30 / 04:30 Chișinău vara | `.github/workflows/tiki-mobilet.yml` |
| Refacerea Bilete aparat (`tiki_refacere_pas`) | doar 23:00–05:00, pași ≤ 10 s, pauză 2 s | `apps/admin/src/app/api/cron/tiki-refacere/route.ts`, `src/lib/fereastra-noapte.ts`, migr. 463–465 |
| Refacerea de mână, ziua | doar cu `?force=1`, și doar dacă e neapărat | aceeași rută |
| Reimport istoric, recalcule pe luni, moneyball, refaceri de vederi | doar noaptea | — |
| Joburile VPS (bus-live, trip-live, tomberon-sync) | după programul lor; se pun în pauză cu `#PAUZA-DB` în crontab | `/root/crontab.backup.*` pe VPS |

## Starea refacerii

- Pagina Numărare → Bilete aparat arată «Recalcul în așteptare pentru …» cât cozile nu sunt goale.
- `get_tiki_refacere_stare()`: lunile în așteptare, zilele Numărării în coadă, ultimul pas și durata lui, pasul maxim pe 24 h.
- `tiki_refacere_jurnal`: fiecare pas cu durata (30 de zile).

## Diagnostic fără conexiune grea la bază

- Supabase MCP `get_logs` / `query_logs` pe `postgres_logs`: `57014` = statement timeout, `08006` = conexiune picată.
- `edge_logs`: `origin_time`, răspunsurile 5xx.
- Dacă baza a încremenit: Dashboard → Restart project (repornirea golește statisticile `pg_stat_*`).
