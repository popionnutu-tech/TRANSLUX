"""Granița zilei: producția (plinul = dimineața) vs ora reală din benzol (după 12:00 = după munca zilei).
Măsura: dispersia l/100 pe intervale (MAD relativ) pe mașină și norma rezultată, 10.06–27.09.2026, km prod."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('prod')
res = {}
for lab, kw in [('prod', {}), ('ora', {'ora': True})]:
    iv = plin_intervale(a, k, '2026-06-10', '2026-09-27', **kw)
    iv['c'] = 100 * iv.l / iv.km
    g = iv.groupby('placa')
    res[lab] = pd.DataFrame({'n': g.size(), 'mad': g.c.apply(lambda c: 100 * (c - c.median()).abs().median() / c.median()),
                             'norma': g.apply(lambda d: 100 * d.l.sum() / d.km.sum())})
J = res['prod'].join(res['ora'], lsuffix='_p', rsuffix='_o').join(v[['grup']])
J = J[(J.n_p >= 5) & (J.n_o >= 5)]
print('mașini:', len(J))
print(J.groupby('grup')[['mad_p', 'mad_o', 'n_p', 'n_o']].median().round(2))
print('normă ora / normă prod (median):', (J.norma_o / J.norma_p).groupby(J.grup).median().round(3).to_dict())
print('|normă ora/prod − 1| > 3%:', int(((J.norma_o / J.norma_p - 1).abs() > .03).sum()), 'mașini')
