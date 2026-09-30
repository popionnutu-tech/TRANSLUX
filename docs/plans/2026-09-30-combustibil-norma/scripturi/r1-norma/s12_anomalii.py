"""Anomalii care ies din metoda normei: (1) două pliniri fără drum între ele; (2) luni cu km și fără litri; (3) mașini cu norma proprie departe de tip."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('prod')
pt = a[a.zi >= '2025-01-01'].groupby('placa').litri.quantile(.9)
iv = plin_intervale(a, k, '2025-01-01', '2026-09-27', minkm=0).join(v[['grup']], on='placa')
iv['plin'] = iv.placa.map(pt)
# a doua plinire: litrii intervalului >= 50% din plin, dar km < 10% din autonomia unui plin (plin / norma*100) -> imposibil fizic
iv['km_plin'] = iv.plin / (iv.placa.map(v.norma_tip.fillna(15)) / 100)
sus = iv[(iv.l >= 0.5 * iv.plin) & (iv.km < 0.15 * iv.km_plin)].copy()
sus['exces_l'] = sus.l - sus.km * iv.placa.map(v.norma_tip.fillna(15)).loc[sus.index] / 100
print('intervale plin→plin cu >=50% plin turnat și <15% din autonomie parcursă:', len(sus), 'litri', round(sus.l.sum()), 'exces', round(sus.exces_l.sum()))
print(sus.groupby('grup').agg(n=('l', 'size'), l=('l', 'sum'), exces=('exces_l', 'sum')).round(0))
print(sus.groupby('placa').agg(n=('l', 'size'), exces=('exces_l', 'sum')).sort_values('exces', ascending=False).head(10).round(0))
# detaliu: primele exemple cu alimentările din z1..z2
b = alim()
for _, r in sus.sort_values('exces_l', ascending=False).head(8).iterrows():
    f = b[(b.placa == r.placa) & (b.zi >= r.z1) & (b.zi <= r.z2)][['zi', 'litri', 'src', 'ts']]
    print(r.placa, r.z1.date(), '→', r.z2.date(), 'km', round(r.km, 1), 'l', round(r.l, 1), '|', '; '.join(f'{x.zi.date()} {x.litri:.0f}L {x.src} {"" if pd.isna(x.ts) else pd.Timestamp(x.ts).strftime("%H:%M")}' for x in f.itertuples()))
sus.to_csv('out_anom_plin_dublu.csv', index=False)
# (2) luni cu km >= 1000 și litri 0 (2026, km prod)
rows = []
for m0, m1 in [('2026-06-10', '2026-06-30'), ('2026-07-01', '2026-07-31'), ('2026-08-01', '2026-08-31'), ('2026-09-01', '2026-09-27')]:
    lp = luna_prod(a, k, m0, m1); lp['luna'] = m0[:7]; rows.append(lp)
M = pd.concat(rows).join(v[['grup']])
z = M[(M.km >= 1000) & (M.L_tot == 0)]
print('\nmașină-luni cu >=1000 km și 0 litri (iun-sep 2026):', len(z)); print(z[['luna', 'grup', 'km']].round(0).to_string())
# (3) norma proprie (3 luni iul-sep, raport) vs tip
lp = luna_prod(a, k, '2026-07-01', '2026-09-27'); lp = lp[lp.km >= 3000].join(v[['tip_nume', 'grup', 'norma_tip']])
lp['c'] = 100 * lp.L / lp.km
lp['tipk'] = lp.tip_nume.fillna(lp.grup)
lp['med_tip'] = lp.groupby('tipk').c.transform('median'); lp['n_tip'] = lp.groupby('tipk').c.transform('size')
lp['dev'] = lp.c / lp.med_tip - 1
x = lp[(lp.n_tip >= 4)]
print('\nmașini cu norma proprie iul-sep > +15% față de mediana tipului lor (tipuri cu >=4 mașini):', int((x.dev > .15).sum()), 'din', len(x))
print(x[x.dev > .15].sort_values('dev', ascending=False)[['tipk', 'km', 'c', 'med_tip', 'dev']].round(2).head(15).to_string())
print('exces față de mediana tipului (litri iul-sep):', round(((x.c - x.med_tip).clip(lower=0) * x.km / 100)[x.dev > .15].sum()))
