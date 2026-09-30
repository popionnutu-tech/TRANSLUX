from core import *
v = veh(); a = alim(); k = kmzi('prod')
iv = plin_intervale(a, k, '2026-06-10', '2026-09-30')
pn = plin_norma(iv, minint=1)
pn = pn.join(v.set_index('placa')[['grup', 'tip_nume', 'norma_tip', 'norma_masurata']])
pn['folosita'] = pn.n >= 3
print('mașini cu plin la plin (≥1 interval):', len(pn), ' cu ≥3:', pn.folosita.sum(), ' flota:', len(v))
print(pn.groupby('grup').agg(n=('norma', 'size'), cu3=('folosita', 'sum'), med=('norma', 'median'), mednint=('n', 'median')))
print(pn[pn.grup == 'camioane'].sort_values('norma')[['n', 'km', 'l', 'norma', 'norma_tip']].round(1).to_string())
# mașinile flotei cu litri dar fără normă plin
lit = cut(a, '2026-06-10', '2026-09-30').groupby('placa').litri.sum()
fara = v.set_index('placa').loc[lambda d: d.index.isin(lit.index) & ~d.index.isin(pn[pn.folosita].index)]
print('cu litri, fără plin ≥3:', len(fara)); print(fara.grup.value_counts())
pn.to_csv('out_prod_plin.csv')
