"""Sezonul pe panel fix: indicele lunii = l/100 al mașinii în lună / l/100 al aceleiași mașini pe 12 luni (oct 2025–sep 2026 și ian–dec 2025).
Folosește out_luni_m2m.csv (din s05; regula producției, km m2m)."""
from load import *
v = veh().set_index('placa')
L = pd.read_csv('out_luni_m2m.csv'); L['luna'] = pd.PeriodIndex(L.luna, freq='M')
L = L.join(v[['grup']], on='placa')
L = L[(L.km >= 1500) & (L.L > 0)]
# folosim trimestre (3 luni) ca să tăiem zgomotul rezervorului
L['c'] = 100 * L.L / L.km
def indice(an0, an1):
    d = L[(L.luna >= pd.Period(an0, 'M')) & (L.luna <= pd.Period(an1, 'M'))]
    base = d.groupby('placa').apply(lambda x: 100 * x.L.sum() / x.km.sum()).rename('b')
    nl = d.groupby('placa').size()
    d = d.join(base, on='placa')[lambda x: x.placa.map(nl) >= 10]
    d['i'] = d.c / d.b
    return d
for a0, a1 in [('2025-01', '2025-12'), ('2025-10', '2026-09')]:
    d = indice(a0, a1)
    t = d.groupby(['luna', 'grup']).i.median().unstack().round(3)
    t['n_masini'] = d.groupby('luna').placa.nunique()
    print(f'indice lunar median pe mașină (bază {a0}..{a1}):'); print(t.to_string())
# iarna vs vara pe mașină: (dec-feb) / (iun-aug), pentru 2024/25 n-avem dec 2024 -> ian-feb 2025 vs iun-aug 2025 și dec25-feb26 vs iun-aug 2026
def ratio(p1, p2, lab):
    def agg(ps):
        d = L[L.luna.isin([pd.Period(p, 'M') for p in ps])].groupby('placa')[['L', 'km']].sum()
        return 100 * d.L / d.km
    r = (agg(p1) / agg(p2)).dropna().rename('r').to_frame().join(v[['grup']])
    print(lab); print(r.groupby('grup').r.describe(percentiles=[.25, .5, .75]).round(3))
ratio(['2025-01', '2025-02'], ['2025-06', '2025-07', '2025-08'], 'ian-feb 2025 / iun-aug 2025')
ratio(['2025-12', '2026-01', '2026-02'], ['2026-06', '2026-07', '2026-08'], 'dec25-feb26 / iun-aug 2026')
ratio(['2025-12', '2026-01', '2026-02'], ['2025-06', '2025-07', '2025-08'], 'dec25-feb26 / iun-aug 2025')
ratio(['2026-06', '2026-07', '2026-08', '2026-09'], ['2025-06', '2025-07', '2025-08', '2025-09'], 'iun-sep 2026 / iun-sep 2025 (aceeași mașină)')
# interurban: de unde creșterea 2026? pe mașină
ratio(['2026-03', '2026-04', '2026-05'], ['2025-03', '2025-04', '2025-05'], 'mar-mai 2026 / mar-mai 2025')
