"""Backtest lung pe autobuze/microbuze cu km m2m (LDE) din 2025: pentru fiecare lună t, norma din ferestrele de dinainte → litrii lunii t.
Țintă = litrii lunii după regula producției (prima zi cu km .. ultima zi cu >=20 km), km m2m, doar luni cu >=1000 km."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('m2m')
old = v.norma_masurata_incarcat.combine_first(v.norma_masurata).combine_first(v.norma_tip)
a = a[a.placa.isin(v[v.grup != 'camioane'].index)]
luni = pd.period_range('2025-01', '2026-09', freq='M')
END = {p: min(p.end_time.normalize(), pd.Timestamp('2026-09-27')) for p in luni}

# litrii și km pe lună (regula producției)
LM = {}
for p in luni:
    LM[p] = luna_prod(a, k, p.start_time, END[p])[['L', 'km']]
LMdf = pd.concat(LM, names=['luna', 'placa']).reset_index()
LMdf.to_csv('out_luni_m2m.csv', index=False)

# sezonul: l/100 pe grup, pe lună (flota, Σ L / Σ km)
x = LMdf.merge(v[['grup']], left_on='placa', right_index=True)
x = x[x.km >= 1000]
sez = x.groupby(['grup', 'luna']).apply(lambda d: 100 * d.L.sum() / d.km.sum()).unstack(0)
print('l/100 pe grup și lună (m2m, luni >=1000 km):'); print(sez.round(2).to_string())
# indicele sezonier: luna / media grupului pe 12 luni (oct 2025 - sep 2026)
sez.to_csv('out_sezon_grup.csv')

def norms_for(t, W):
    c0 = (t - W).start_time; c1 = (t - 1).end_time.normalize()
    N = {}
    rl = LMdf[(LMdf.luna >= t - W) & (LMdf.luna <= t - 1)].groupby('placa')[['L', 'km']].sum()
    rl = rl[rl.km >= 1000]
    N['raport'] = 100 * rl.L / rl.km
    iv = plin_intervale(a, k, c0, c1)
    N['plin_prod'] = plin_norma(iv).norma
    N['plin_trim10'] = plin_norma(iv, stat='trim').norma
    N['plin_f70'] = plin_norma(plin_intervale(a, k, c0, c1, frac=0.7)).norma
    N['plin_zi'] = plin_norma(plin_intervale(a, k, c0, c1, prag='zi')).norma
    rc = rl.join(v[['tip_nume', 'grup']]); rc['tipk'] = rc.tip_nume.fillna(rc.grup)
    rt = rc.tipk.map(rc.groupby('tipk').apply(lambda d: 100 * d.L.sum() / d.km.sum()))
    N['eb_tip_K5k'] = (rc.km * N['raport'] + 5000 * rt) / (rc.km + 5000)
    N['eb_tip_K15k'] = (rc.km * N['raport'] + 15000 * rt) / (rc.km + 15000)
    pn = plin_norma(iv, minint=1).join(v[['tip_nume', 'grup']]); pn['tipk'] = pn.tip_nume.fillna(pn.grup)
    pt = pn.tipk.map(pn.groupby('tipk').apply(lambda d: 100 * d.l.sum() / d.km.sum()))
    N['plin_eb_K10k'] = (pn.km * pn.norma + 10000 * pt) / (pn.km + 10000)
    N['veche'] = old
    return N

rows = []
targets = [p for p in luni if p >= pd.Period('2025-04', 'M')]
for W in [1, 2, 3, 6, 12]:
    for t in targets:
        if (t - W) < luni[0]:
            continue
        N = norms_for(t, W)
        T = LMdf[(LMdf.luna == t) & (LMdf.km >= 1000) & (LMdf.L > 0)].set_index('placa')
        # sezon: factorul grupului = l/100 luna t anul trecut / l/100 fereastra anul trecut (doar dacă există)
        for nm, n in N.items():
            n = n.combine_first(old)  # aceeași acoperire
            d = T.join(n.rename('n')).dropna(subset=['n']).join(v[['grup']])
            d['e'] = d.L / (d.n * d.km / 100) - 1
            for _, r in d.iterrows():
                rows.append((W, str(t), nm, r.name, r.grup, r.e, r.L, r.n * r.km / 100))
R = pd.DataFrame(rows, columns=['W', 'luna', 'metoda', 'placa', 'grup', 'e', 'L', 'pred'])
R.to_csv('out_rolling_m2m.csv', index=False)
pd.set_option('display.width', 250)
for W in [1, 2, 3, 6, 12]:
    d = R[R.W == W]
    t = d.groupby(['metoda', 'grup']).e.apply(lambda s: 100 * s.abs().median()).unstack()
    t['TOTAL'] = d.groupby('metoda').e.apply(lambda s: 100 * s.abs().median())
    t['p80'] = d.groupby('metoda').e.apply(lambda s: 100 * s.abs().quantile(.8))
    t['p90'] = d.groupby('metoda').e.apply(lambda s: 100 * s.abs().quantile(.9))
    t['bias_med'] = d.groupby('metoda').e.apply(lambda s: 100 * s.median())
    t['n'] = d.groupby('metoda').size()
    print(f'\n==== fereastra W={W} luni, luni-țintă {d.luna.nunique()}'); print(t.sort_values('TOTAL').round(1).to_string())
