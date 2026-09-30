"""Marja: cât zgomot are abaterea lunară când norma e bună (predicție în afara eșantionului).
1) din backtestul lung (out_rolling_m2m.csv, W=3): |e| P50/P80/P90/P95 pe grup și pe km ai lunii;
2) comparație pereche (bootstrap pe mașini) între metode;
3) cât de mult ascunde norma calculată CU luna judecată (cum face producția: plin 10.06 → sfârșitul lunii)."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa')
R = pd.read_csv('out_rolling_m2m.csv')
R['km'] = R.pred  # placeholder
L = pd.read_csv('out_luni_m2m.csv')
R = R.merge(L.rename(columns={'L': 'Lm'}), on=['luna', 'placa'], how='left')
R['kmb'] = pd.cut(R.km_y if 'km_y' in R else R.km, [0, 2000, 3500, 6000, 1e9], labels=['1-2k', '2-3.5k', '3.5-6k', '>6k'])
d = R[(R.W == 3) & (R.metoda == 'eb_tip_K5k')]
q = lambda s, p: 100 * s.abs().quantile(p)
t = d.groupby('grup').e.agg(n='size', p50=lambda s: q(s, .5), p80=lambda s: q(s, .8), p90=lambda s: q(s, .9), p95=lambda s: q(s, .95))
t.loc['TOTAL'] = [len(d), q(d.e, .5), q(d.e, .8), q(d.e, .9), q(d.e, .95)]
print('|abaterea| lunară, backtest lung W=3 eb_tip_K5k (m2m):'); print(t.round(1))
t2 = d.groupby('kmb').e.agg(n='size', p50=lambda s: q(s, .5), p80=lambda s: q(s, .8), p90=lambda s: q(s, .9), p95=lambda s: q(s, .95))
print('pe km ai lunii:'); print(t2.round(1))
# abaterea pe 3 luni (Σ) — aceeași normă fixă, trei luni consecutive după fereastră: aproximăm cu media ponderată a lunilor vecine
d3 = d.copy(); d3['luna'] = pd.PeriodIndex(d3.luna, freq='M')
d3 = d3.sort_values(['placa', 'luna'])
g = d3.groupby('placa')
d3['L3'] = g.L.rolling(3).sum().reset_index(level=0, drop=True)
d3['P3'] = g.pred.rolling(3).sum().reset_index(level=0, drop=True)
d3['e3'] = d3.L3 / d3.P3 - 1
print('abaterea cumulată pe 3 luni consecutive (norme lunare glisante): p50/p80/p90 =',
      [round(q(d3.e3.dropna(), p), 1) for p in (.5, .8, .9)])

# 2) bootstrap pereche: diferența de |e| median între metode, pe mașini
def boot(m1, m2, W=3, B=2000, seed=1):
    x = R[(R.W == W) & (R.metoda == m1)].set_index(['luna', 'placa']).e.abs()
    y = R[(R.W == W) & (R.metoda == m2)].set_index(['luna', 'placa']).e.abs()
    j = pd.concat([x.rename('a'), y.rename('b')], axis=1).dropna().reset_index()
    per = j.groupby('placa')[['a', 'b']].mean()
    rng = np.random.default_rng(seed); idx = np.arange(len(per)); diffs = []
    for _ in range(B):
        s = per.iloc[rng.choice(idx, len(idx))]
        diffs.append(100 * (s.a.mean() - s.b.mean()))
    return round(100 * (per.a.mean() - per.b.mean()), 2), np.round(np.percentile(diffs, [2.5, 97.5]), 2)
for m1, m2 in [('plin_prod', 'eb_tip_K5k'), ('raport', 'eb_tip_K5k'), ('veche', 'eb_tip_K5k'), ('plin_trim10', 'plin_prod'), ('plin_prod', 'raport')]:
    print(f'MAE({m1}) − MAE({m2}) [pp], W=3, IC95 bootstrap pe mașini:', boot(m1, m2))
for W in [1, 2, 6]:
    print(f'W={W} vs W=3, eb_tip_K5k:', end=' ')
    x = R[(R.W == W) & (R.metoda == 'eb_tip_K5k')].set_index(['luna', 'placa']).e.abs()
    y = R[(R.W == 3) & (R.metoda == 'eb_tip_K5k')].set_index(['luna', 'placa']).e.abs()
    j = pd.concat([x.rename('a'), y.rename('b')], axis=1).dropna()
    print(round(100 * (j.a.mean() - j.b.mean()), 2), 'pp pe', len(j), 'mașină-luni')

# 3) în eșantion vs în afara eșantionului, sept 2026, km prod
a = alim(); k = kmzi('prod')
T = luna_prod(a, k, '2026-09-01', '2026-09-27'); T = T[(T.km >= 1000) & (T.L > 0)].join(v[['grup']])
nin = plin_norma(plin_intervale(a, k, '2026-06-10', '2026-09-30')).norma  # ca producția la raportul de septembrie
nout = plin_norma(plin_intervale(a, k, '2026-06-10', '2026-08-31')).norma
for lab, n in [('în eșantion (producția)', nin), ('în afara eșantionului', nout)]:
    x = T.join(n.rename('n')).dropna(subset=['n'])
    e = x.L / (x.n * x.km / 100) - 1
    print(lab, 'n=', len(x), 'med|e|=', round(100 * e.abs().median(), 1), 'p90|e|=', round(100 * e.abs().quantile(.9), 1),
          'peste +10%:', int((e > .10).sum()), 'sub −10%:', int((e < -.10).sum()))
