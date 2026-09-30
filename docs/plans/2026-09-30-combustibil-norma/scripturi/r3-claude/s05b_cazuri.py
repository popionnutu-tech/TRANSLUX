"""R3.5 — pe protocolul GPS: metoda finală (EB K5k 3 luni) ± corecția comună a lunii; pragul în litri; cazurile cunoscute;
camioane cumulat aug+sep (verificarea cifrei Codex 8,54 % trim10)."""
from r3core import *
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 40)
rows = []
for tn, (C0, C1, T0, T1) in TESTS.items():
    s = esantion(C0, C1, T0, T1)
    N = metode3(C0, C1); fb = old_asof(T0)
    q = cut(A, C0, C1).groupby(['placa', 'zi']).litri.sum().groupby('placa').quantile(.9)      # P90 pe totalul zilei
    for nm in ['EB K5k (Claude)', 'zi trim10', 'Codex: plin zi ≥3.000', 'SQL trim10']:
        x = scor(N[nm], s, fallback=fb)[['L', 'pred', 'km', 'cam']].copy()
        x['metoda'] = nm; x['test'] = tn; x['q'] = q.reindex(x.index); x['grup'] = V.grup.reindex(x.index)
        rows.append(x)
X = pd.concat(rows); X['placa'] = X.index
nc = X[~X.cam].copy()
nc['f'] = nc.assign(r=nc.L / nc.pred).groupby(['metoda', 'test', 'grup']).r.transform('median')
nc['pred_c'] = nc.pred * nc.f
def w(d, c): return round(100 * (d[c] - d.L).abs().sum() / d.L.sum(), 2)
def b(d, c): return round(100 * (d[c] - d.L).sum() / d.L.sum(), 2)
print('=== GPS, fără camioane, sep+aug: WAPE/bias fără și cu corecția comună a lunii (mediana grupului)')
for m, d in nc.groupby('metoda'):
    print(f'{m:24s} {w(d,"pred"):5.2f} / {b(d,"pred"):+5.2f}   corectat {w(d,"pred_c"):5.2f} / {b(d,"pred_c"):+5.2f}   factori', d.groupby(['test', 'grup']).f.first().round(3).to_dict())
# prag
d = nc[nc.metoda == 'EB K5k (Claude)'].copy()
d['kmb'] = pd.cut(d.km, [0, 2000, 3500, 6000, 1e9], labels=['1-2k', '2-3.5k', '3.5-6k', '>6k'])
out = {}
for c in ['pred', 'pred_c']:
    D = d.L - d[c]
    rules = {'dev>+15%': d.L / d[c] - 1 > .15,
             'D>max(10%,2q) Codex': D > np.maximum(.10 * d[c], 2 * d.q),
             'D>max(15%,2q)': D > np.maximum(.15 * d[c], 2 * d.q),
             'D>max(20%,2q)': D > np.maximum(.20 * d[c], 2 * d.q),
             'D<-max(15%,2q)': D < -np.maximum(.15 * d[c], 2 * d.q)}
    for k, v in rules.items():
        r = (100 * v.groupby(d.kmb).mean()).round(1).to_dict(); r['TOTAL'] = round(100 * v.mean(), 1); r['n'] = int(v.sum())
        out[(c, k)] = r
print('\n=== rata semnalelor, EB K5k, fără camioane, N =', len(d)); print(pd.DataFrame(out).T.to_string())
print('q (P90 pe zi) median fără camioane:', round(d.q.median(), 1), 'l; 2q / pred median %:', round(100 * (2 * d.q / d.pred).median(), 1))

print('\n=== cazurile cunoscute, toată flota ≥1.000 km în luna lor, EB K5k fixat înainte, cu corecția grupului din eșantion')
CAZ = ['042BRAU', '145BRAZ', '396SWL', '330RQR', '284BRAT']
for tn, (C0, C1, T0, T1) in TESTS.items():
    lp = luna_prod(T0, T1); lp = lp[lp.km >= 1000]
    N = metode3(C0, C1); fb = old_asof(T0)
    n = N['EB K5k (Claude)'].reindex(lp.index).combine_first(fb.reindex(lp.index))
    q = cut(A, C0, C1).groupby(['placa', 'zi']).litri.sum().groupby('placa').quantile(.9).reindex(lp.index)
    f = d[d.test == tn].groupby('grup').f.first()
    fc = V.grup.reindex(lp.index).map(f).fillna(1.0)
    pred = n * lp.km / 100 * fc; D = lp.L - pred
    t = pd.DataFrame({'km': lp.km.round(0), 'L': lp.L.round(0), 'norma': n.round(2), 'f': fc.round(3), 'dev%': (100 * (lp.L / pred - 1)).round(1),
                      'D': D.round(0), '2q': (2 * q).round(0), 'suprav': D > np.maximum(.15 * pred, 2 * q), 'invest': D > np.maximum(.20 * pred, 2 * q)})
    print('---', tn); print(t.reindex([c for c in CAZ if c in t.index]).to_string())
    tt = t[~t.index.isin(CAM)]
    print(f'  flota fără camioane ≥1.000 km: {len(tt)}; supraveghere {int(tt.suprav.sum())}, investigație {int(tt.invest.sum())}:', list(tt.index[tt.invest]))

