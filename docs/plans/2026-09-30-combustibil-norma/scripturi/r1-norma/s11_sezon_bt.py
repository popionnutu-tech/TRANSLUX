"""Backtest cu corecție sezonieră (doar metode pe raport, rapide). Indicele sezonier al grupului se calculează DOAR din datele de dinainte:
factor(t) = l/100 grup în luna t−12 / l/100 grup în fereastra (t−12−W .. t−13). + stabilitatea lunară și intervalele scurte suspecte."""
import warnings; warnings.filterwarnings('ignore')
from load import *
v = veh().set_index('placa')
L = pd.read_csv('out_luni_m2m.csv'); L['luna'] = pd.PeriodIndex(L.luna, freq='M')
L = L.join(v[['grup', 'tip_nume']], on='placa'); L['tipk'] = L.tip_nume.fillna(L.grup)
old = v.norma_masurata_incarcat.combine_first(v.norma_masurata).combine_first(v.norma_tip)
def gratio(d):
    d = d[d.km >= 1000]
    return d.groupby('grup').apply(lambda x: x.L.sum() / x.km.sum())
def eb(win, K=5000):
    rl = win.groupby('placa')[['L', 'km']].sum(); rl = rl[rl.km >= 1000]
    rl = rl.join(v[['tip_nume', 'grup']]); rl['tipk'] = rl.tip_nume.fillna(rl.grup)
    rt = rl.tipk.map(rl.groupby('tipk').apply(lambda x: 100 * x.L.sum() / x.km.sum()))
    return (rl.km * 100 * rl.L / rl.km + K * rt) / (rl.km + K)
rows = []
for t in pd.period_range('2025-04', '2026-09', freq='M'):
    T = L[(L.luna == t) & (L.km >= 1000) & (L.L > 0)].set_index('placa')
    for W in [3, 6, 12]:
        if t - W < pd.Period('2025-01', 'M'):
            continue
        win = L[(L.luna >= t - W) & (L.luna <= t - 1)]
        n = eb(win)
        meths = {'eb': n}
        # sezon: raportul grupului luna t-12 / fereastra t-12-W..t-13 (dacă există)
        if t - 12 - W >= pd.Period('2025-01', 'M'):
            f = gratio(L[L.luna == t - 12]) / gratio(L[(L.luna >= t - 12 - W) & (L.luna <= t - 13)])
            meths['eb_sezon'] = n * v.loc[n.index, 'grup'].map(f)
        for nm, nn in meths.items():
            d = T.join(nn.rename('n'), how='inner').dropna(subset=['n'])
            d['e'] = d.L / (d.n * d.km / 100) - 1
            for p, r in d.iterrows():
                rows.append((W, str(t), nm, p, r.grup, r.e))
R = pd.DataFrame(rows, columns=['W', 'luna', 'metoda', 'placa', 'grup', 'e'])
# comparație doar pe luni-țintă unde există și varianta sezon
for W in [3, 6, 12]:
    d = R[R.W == W]; lun = set(d[d.metoda == 'eb_sezon'].luna)
    d = d[d.luna.isin(lun)]
    if not len(lun):
        continue
    t = d.groupby(['metoda', 'grup']).e.apply(lambda s: round(100 * s.abs().median(), 2)).unstack()
    t['TOTAL'] = d.groupby('metoda').e.apply(lambda s: round(100 * s.abs().median(), 2))
    t['MAE'] = d.groupby('metoda').e.apply(lambda s: round(100 * s.abs().mean(), 2))
    t['bias'] = d.groupby('metoda').e.apply(lambda s: round(100 * s.median(), 2))
    print(f'W={W}, luni-țintă cu sezon: {sorted(lun)}'); print(t)
# doar lunile de iarnă (ian-feb 2026): cu vs fără sezon
d = R[R.luna.isin(['2026-01', '2026-02'])]
print('ian-feb 2026:'); print(d.groupby(['W', 'metoda']).e.agg(med_abs=lambda s: round(100 * s.abs().median(), 1), bias=lambda s: round(100 * s.median(), 1), n='size'))

# stabilitatea: |Δ| între două luni consecutive ale l/100 calendaristic pe mașină (m2m, >=1500 km)
S = L[(L.km >= 1500) & (L.L > 0)].sort_values(['placa', 'luna']).copy()
S['c'] = 100 * S.L / S.km
S['prev'] = S.groupby('placa').c.shift(); S['pl'] = S.groupby('placa').luna.shift()
S = S[S.pl == S.luna - 1]
S['d'] = (S.c / S.prev - 1).abs()
print('stabilitate lună→lună a l/100 calendaristic (m2m): |Δ| median pe grup (%)', (100 * S.groupby('grup').d.median()).round(1).to_dict(),
      ' P90:', (100 * S.groupby('grup').d.quantile(.9)).round(1).to_dict())
# pe trimestre
L['q'] = L.luna.dt.qyear.astype(str) + 'Q' + L.luna.dt.quarter.astype(str)
Q = L.groupby(['placa', 'grup', 'q'])[['L', 'km']].sum().reset_index(); Q = Q[Q.km >= 4500]
Q['c'] = 100 * Q.L / Q.km; Q = Q.sort_values(['placa', 'q'])
Q['d'] = (Q.c / Q.groupby('placa').c.shift() - 1).abs()
print('stabilitate trimestru→trimestru: |Δ| median', (100 * Q.groupby('grup').d.median()).round(1).to_dict(), ' P90:', (100 * Q.groupby('grup').d.quantile(.9)).round(1).to_dict())
