"""(1) de ce plin la plin iese mai mic decât raportul lunar: litrii din intervalele scoase (<300 km) și din afara intervalelor;
(2) există consum fix (ralanti/staționare)? abaterea pe luni cu km puțini față de km obișnuiți ai mașinii + regresie lunară L = a + b·km."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('m2m')
a = a[a.placa.isin(v[v.grup != 'camioane'].index)]
de, pana = '2025-01-01', '2026-09-27'
iv_all = plin_intervale(a, k, de, pana, minkm=0)
iv_all = iv_all.join(v[['grup']], on='placa')
iv_all['kept'] = iv_all.km >= 300
s = iv_all.groupby(['grup', 'kept'])[['l', 'km']].sum()
s['l100'] = 100 * s.l / s.km
print('intervale plin-la-plin 2025-01..2026-09 (m2m): păstrate vs scoase (<300 km)'); print(s.round(1))
tot = iv_all.groupby('grup')[['l', 'km']].sum()
kept = iv_all[iv_all.kept].groupby('grup')[['l', 'km']].sum()
print('norma grupului cu toate intervalele / doar >=300 km:', ((tot.l / tot.km) / (kept.l / kept.km)).round(3).to_dict())
print('cote intervale cu km=0 (plin repetat fără drum):', round(100 * (iv_all.km == 0).mean(), 1), '%, litri în ele:', round(iv_all[iv_all.km == 0].l.sum()))

# (2) bias pe km relativi: e în backtest vs km lunii / km median al mașinii
R = pd.read_csv('out_rolling_m2m.csv'); R = R[(R.W == 3) & (R.metoda == 'eb_tip_K5k')]
L = pd.read_csv('out_luni_m2m.csv')
R = R.merge(L[['luna', 'placa', 'km']], on=['luna', 'placa'])
R['kmrel'] = R.km / R.groupby('placa').km.transform('median')
R['b'] = pd.cut(R.kmrel, [0, .6, .8, .95, 1.05, 1.2, 10])
print('\nabaterea mediană (e) după km lunii relativ la km obișnuiți ai mașinii (W=3 eb_tip_K5k):')
print(R.groupby('b').e.agg(n='size', med=lambda x: round(100 * x.median(), 1), p90abs=lambda x: round(100 * x.abs().quantile(.9), 1)))
# regresie lunară pe mașină: L = a + b km (luni cu >=500 km), 2025-01..2026-09
L = L[(L.km >= 500) & (L.L > 0)].join(v[['grup']], on='placa')
out = []
for p, d in L.groupby('placa'):
    if len(d) < 12:
        continue
    X = np.c_[np.ones(len(d)), d.km]
    (a0, b0), res, *_ = np.linalg.lstsq(X, d.L.values, rcond=None)
    ratio = d.L.sum() / d.km.sum()
    # eroare standard a interceptului
    resid = d.L.values - X @ np.array([a0, b0]); s2 = (resid ** 2).sum() / (len(d) - 2)
    cov = s2 * np.linalg.inv(X.T @ X)
    out.append(dict(placa=p, grup=d.grup.iloc[0], n=len(d), a=a0, se_a=np.sqrt(cov[0, 0]), panta=100 * b0, raport=100 * ratio,
                    km_med=d.km.median(), a_pct=a0 / d.L.mean()))
O = pd.DataFrame(out)
print('\nregresie lunară L = a + b·km pe mașină (>=12 luni):')
print(O.groupby('grup').agg(n=('placa', 'size'), a_med=('a', 'median'), a_pct_med=('a_pct', 'median'), panta_med=('panta', 'median'), raport_med=('raport', 'median'),
                            a_semnif=('a', lambda x: int(((O.loc[x.index, 'a'] / O.loc[x.index, 'se_a']) > 2).sum()))).round(2))
print('interceptul pozitiv semnificativ (t>2) la', int((O.a / O.se_a > 2).sum()), 'din', len(O), '; negativ semnificativ la', int((O.a / O.se_a < -2).sum()))
O.to_csv('out_regresie_lunara.csv', index=False)
