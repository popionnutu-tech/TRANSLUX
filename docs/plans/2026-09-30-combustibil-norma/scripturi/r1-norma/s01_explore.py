from load import *
v = veh(); b = benzol(); f = foi(); g = gps(); m = m2m()
print(v.grup.value_counts())
print(v[v.grup == 'altele'][['placa', 'directii', 'categorie', 'tip']])
print('benzol', b.zi.min(), b.zi.max(), len(b), b.litri.sum())
print('foi', f.zi.min(), f.zi.max(), len(f), f.litri.sum())
print('gps', g.zi.min(), g.zi.max(), len(g), g.placa.nunique())
print('m2m', m.zi.min(), m.zi.max(), len(m), m.placa.nunique())
# litri pe lună, pe sursă
a = alim(); a['luna'] = a.zi.dt.to_period('M')
print(a.pivot_table(index='luna', columns='src', values='litri', aggfunc='sum').round(0))
# plăci necunoscute
for n, d in [('benzol', b), ('foi', f), ('gps', g), ('m2m', m)]:
    unk = set(d.placa) - set(v.placa)
    print(n, 'placi necunoscute', len(unk), list(unk)[:10], d[d.placa.isin(unk)].shape[0])
m['luna'] = m.zi.dt.to_period('M')
print(m.groupby('luna').agg(km=('km', 'sum'), n=('placa', 'nunique')))
g['luna'] = g.zi.dt.to_period('M')
print(g.groupby('luna').agg(km=('km_total', 'sum'), kmp=('km_prod', 'sum'), n=('placa', 'nunique'), parc=('parcare', 'sum')))
# pe grup: litri iun-sep 2026
a = a.merge(v[['placa', 'grup']], on='placa', how='left')
print(a[a.zi >= '2026-06-10'].pivot_table(index='grup', columns='src', values='litri', aggfunc='sum').round(0))
print(f.groupby('foaie').litri.describe())
print(b.groupby('src').litri.describe())
