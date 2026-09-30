from load import *
v = veh(); b = benzol(); f = foi(); g = gps(); m = m2m()
b = b.merge(v[['placa', 'grup']], on='placa', how='left')
b['ora'] = b.ts.dt.hour
print('ora locală alimentării benzol, pe grup (%)')
print((pd.crosstab(b.grup, pd.cut(b.ora, [-1, 5, 8, 11, 14, 17, 20, 23]), normalize='index') * 100).round(0))
print('alimentări 0 litri:', (b.litri <= 0).sum())
print('top alimentări benzol >400 l pe placă/grup')
big = b[b.litri > 400]
print(big.groupby(['grup', 'placa']).litri.agg(['count', 'max']).sort_values('count', ascending=False).head(20))
print(v[v.placa.isin(['270QXK', '589BRAY', '614WYW'])][['placa', 'active', 'tip_nume', 'norma_tip']])
a = alim()
print(a[a.placa.isin(['270QXK', '589BRAY', '614WYW'])].groupby(['placa', 'src']).litri.agg(['count', 'sum']))
# câte mașini au doar foaie, doar benzol, ambele, iun-sep 2026
a2 = a[a.zi >= '2026-06-10'].merge(v[['placa', 'grup']], on='placa')
t = a2.groupby(['placa', 'grup', 'src']).litri.sum().unstack(fill_value=0)
t['tip'] = np.select([(t.benzol > 0) & (t.foaie > 0), t.benzol > 0], ['ambele', 'benzol'], 'foaie')
t['frac_foaie'] = t.foaie / (t.benzol + t.foaie)
print(t.reset_index().groupby(['grup', 'tip']).size().unstack(fill_value=0))
# zile benzol + foaie în aceeași zi (posibilă dublare)
bz = b.groupby(['placa', 'zi']).litri.sum().rename('lb')
fz = f.groupby(['placa', 'zi']).litri.sum().rename('lf')
j = pd.concat([bz, fz], axis=1).dropna()
print('zile cu benzol ȘI foaie:', len(j), 'din care foaie≈benzol (±2%):', ((j.lf - j.lb).abs() <= 0.02 * j.lb).sum())
# gps vs m2m pe zile comune iul-sep 2026 pe grup
x = g[['placa', 'zi', 'km_total', 'km_prod', 'km_patched', 'parcare']].merge(m, on=['placa', 'zi'], how='outer').merge(v[['placa', 'grup']], on='placa')
x = x[(x.zi >= '2026-06-10') & (x.zi <= '2026-09-27')]
both = x.dropna(subset=['km_prod', 'km'])
both = both[(both.km_prod > 0) | (both.km > 0)]
print('zile comune', len(both))
print(both.groupby('grup').agg(gps=('km_prod', 'sum'), m2m=('km', 'sum'), n=('zi', 'size')).assign(r=lambda d: d.m2m / d.gps))
print('zile doar gps (km):', x[x.km.isna() & (x.km_prod > 0)].groupby('grup').km_prod.agg(['size', 'sum']))
print('zile doar m2m (km):', x[x.km_prod.isna() & (x.km > 0)].groupby('grup').km.agg(['size', 'sum']))
