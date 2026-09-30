"""R3.3 — bootstrap pe vehicule pentru testul lung m2m (out_fereastra_m2m.csv) + EB pe lună (iarna)."""
import pandas as pd, numpy as np
R = pd.read_csv('out_fereastra_m2m.csv'); R = R[R.luna >= '2025-07']
R['k'] = R.metoda + ' | ' + R.w.astype(str)
P = R.pivot_table(index=['luna', 'placa'], columns='k', values='pred')
L = R.groupby(['luna', 'placa']).L.first().reindex(P.index)
ok = P.notna().all(axis=1); P = P[ok]; L = L[ok]
print('vehicul-luni comune', len(P))
def wape(c, ix): return (P.loc[ix, c] - L[ix]).abs().sum() / L[ix].sum()
pl = P.index.get_level_values('placa'); up = pl.unique()
grp = {p: np.where(pl == p)[0] for p in up}
rng = np.random.default_rng(151)
for c in P.columns:
    print(f'{c:22s} WAPE {100*wape(c, P.index):.2f}  bias {100*(P[c]-L).sum()/L.sum():+.2f}')
pairs = [('EB K5k | 3', 'zi trim10 | 6'), ('EB K5k | 3', 'zi trim10 | 3'), ('EB K5k | 3', 'EB K5k | 6'), ('zi trim10 | 6', 'zi trim10 | 3'),
         ('EB K5k | 3', 'Codex zi≥3.000 | 3'), ('zi trim10 | 3', 'Codex zi≥3.000 | 3'), ('EB K5k | 3', 'EB K5k | cum')]
for a, b in pairs:
    d = []
    for _ in range(2000):
        s = rng.choice(up, len(up), replace=True)
        ix = np.concatenate([grp[p] for p in s])
        la = L.values[ix]
        d.append((np.abs(P[a].values[ix] - la).sum() - np.abs(P[b].values[ix] - la).sum()) / la.sum())
    d0 = (np.abs(P[a].values - L.values).sum() - np.abs(P[b].values - L.values).sum()) / L.values.sum()
    print(f'{a} − {b}: {100*d0:+.2f} pp  IC95 [{100*np.percentile(d,2.5):+.2f}; {100*np.percentile(d,97.5):+.2f}]')
print('\nEB K5k 3 luni, pe lună: WAPE / bias')
e = R[(R.metoda == 'EB K5k') & (R.w.astype(str) == '3')]
print(e.groupby('luna').apply(lambda d: pd.Series({'N': len(d), 'WAPE': round(100*(d.pred-d.L).abs().sum()/d.L.sum(), 2), 'bias': round(100*(d.pred-d.L).sum()/d.L.sum(), 2),
      'dev>+15%': round(100*((d.L/d.pred-1) > .15).mean(), 1)})).to_string())
