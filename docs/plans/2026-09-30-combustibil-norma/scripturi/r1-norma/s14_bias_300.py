"""Cât scade norma plin-la-plin din cauza filtrului <300 km: granița producției vs ora benzol; 2025-01..2026-09 km m2m și 2026 km prod.
+ comparație cu raportul simplu Σ litri / Σ km pe aceeași perioadă (referința fără filtru)."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim()
for src, de in [('m2m', '2025-01-01'), ('prod', '2026-06-10')]:
    k = kmzi(src); aa = a[a.placa.isin(v[v.grup != 'camioane'].index)] if src == 'm2m' else a
    for lab, kw in [('granița producției', {}), ('ora benzol', {'ora': True})]:
        iv = plin_intervale(aa, k, de, '2026-09-27', minkm=0, **kw).join(v[['grup']], on='placa')
        allr = iv.groupby('grup').apply(lambda d: d.l.sum() / d.km.sum())
        kp = iv[iv.km >= 300].groupby('grup').apply(lambda d: d.l.sum() / d.km.sum())
        print(f'{src} {lab}: normă toate intervalele / doar >=300 km:', (allr / kp).round(3).to_dict())
