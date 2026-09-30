"""Acoperirea: câte mașini active primesc normă proprie cu fiecare metodă pe fereastra iul–sep 2026 (km prod); cât trage K=5000 spre tip."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('prod')
act = v[v.active == True]
lit = cut(a, '2026-07-01', '2026-09-27').groupby('placa').litri.sum()
pl = plin_norma(plin_intervale(a, k, '2026-07-01', '2026-09-27'), minint=1)
rp = raport(a, k, '2026-07-01', '2026-09-27')
t = pd.DataFrame({'activ_cu_litri': act.index.isin(lit.index), 'plin3': act.index.isin(pl[pl.n >= 3].index),
                  'raport_3000km': act.index.isin(rp[rp.km >= 3000].index), 'raport_1000km': act.index.isin(rp[rp.km >= 1000].index)}, index=act.index).join(act.grup)
print(t.groupby('grup').sum()); print('TOTAL', t.drop(columns='grup').sum().to_dict(), 'active:', len(act))
rp = rp[rp.km >= 1000].join(v[['tip_nume', 'grup']]); rp['tipk'] = rp.tip_nume.fillna(rp.grup)
rp['w_proprie'] = rp.km / (rp.km + 5000)
print('ponderea normei proprii la K=5000 (mediana pe grup):', rp.groupby('grup').w_proprie.median().round(2).to_dict())
print('fără km GPS în iul-sep (doar m2m sau nimic):', [p for p in act.index if p in lit.index and p not in set(gps().placa)])
