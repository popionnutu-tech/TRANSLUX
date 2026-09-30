"""(1) camioanele lună cu lună: calendar vs plin la plin în lună; (2) pragul abaterii exprimat în litri (un rezervor) în loc de %."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('prod')
cam = v[v.grup == 'camioane'].index
ref = (0.85 * cut(a, '2026-06-10', '2026-09-27').groupby('placa').litri.quantile(.9)).to_dict()
rows = []
for m0, m1 in [('2026-06-10', '2026-06-30'), ('2026-07-01', '2026-07-31'), ('2026-08-01', '2026-08-31'), ('2026-09-01', '2026-09-27')]:
    lp = luna_prod(a, k, m0, m1)
    iv = plin_intervale(a, k, m0, m1, ref=ref).groupby('placa').agg(lp_l=('l', 'sum'), lp_km=('km', 'sum'), lp_n=('l', 'size'))
    nf = cut(a, m0, m1).groupby('placa').size().rename('n_alim')
    x = lp.join(iv).join(nf)
    x['luna'] = m0[:7]
    rows.append(x[x.index.isin(cam)])
X = pd.concat(rows)
X['cal'] = 100 * X.L / X.km; X['plin'] = 100 * X.lp_l / X.lp_km
X = X[X.km > 0]
pd.set_option('display.width', 250)
print(X[['luna', 'km', 'L', 'n_alim', 'cal', 'lp_n', 'lp_km', 'plin']].round(1).sort_index().to_string())
s = X[X.km >= 1000]
print('camioane, luni cu >=1000 km:', len(s), ' cal l/100: P10/P50/P90', s.cal.quantile([.1, .5, .9]).round(1).tolist(),
      ' plin l/100:', s.plin.dropna().quantile([.1, .5, .9]).round(1).tolist(), 'luni cu plin>=1 interval:', s.plin.notna().sum())
print('alimentări pe lună la camioane (median):', s.n_alim.median(), '; plin_tipic median (l):', round(np.median([ref[p] / .85 for p in cam if p in ref]), 0))
# pe trei luni iul-sep: calendar vs plin
lp = luna_prod(a, k, '2026-07-01', '2026-09-27'); iv = plin_intervale(a, k, '2026-07-01', '2026-09-27', ref=ref).groupby('placa')[['l', 'km']].sum()
z = lp.join(iv, rsuffix='_p'); z = z[z.index.isin(cam) & (z.km >= 3000)]
z['cal'] = 100 * z.L / z.km; z['plin'] = 100 * z.l / z.km_p
print('camioane iul-sep (>=3000 km): cal vs plin, abatere mediană |cal/plin-1| =', round(100 * (z.cal / z.plin - 1).abs().median(), 1), '% n=', z.plin.notna().sum())
print(z[['km', 'cal', 'plin']].round(1).sort_values('plin').to_string())

# (2) pragul în litri: |L - pred| comparat cu plinul tipic, backtest lung (W=3 eb_tip_K5k)
R = pd.read_csv('out_rolling_m2m.csv'); R = R[(R.W == 3) & (R.metoda == 'eb_tip_K5k')]
al = alim(); pt = (al[al.zi >= '2025-01-01'].groupby('placa').litri.quantile(.9)).rename('plin')
R = R.join(pt, on='placa')
R['dl'] = R.L - R.pred
R['z'] = R.dl.abs() / R.plin
print('\n|L − normă×km| în plinuri tipice (P90 alimentare): P50/P80/P90/P95 =', R.z.quantile([.5, .8, .9, .95]).round(2).tolist())
for c in [0.5, 1.0, 1.5]:
    for pc in [0.05, 0.08, 0.10]:
        thr = np.maximum(pc * R.pred, c * R.plin)
        print(f'prag max({int(pc*100)}%, {c}×plin): semnalate {100 * (R.dl.abs() > thr).mean():.1f}% din mașină-luni', end='; ')
    print()
for pc in [0.05, 0.10, 0.15, 0.20]:
    print(f'prag fix {int(pc*100)}%: semnalate {100 * (R.e.abs() > pc).mean():.1f}%', end='; ')
print()
# cât de mare e plinul față de litrii lunii
print('plin / litrii lunii (median, pe grup):'); print((R.plin / R.pred).groupby(R.grup).median().round(3))
