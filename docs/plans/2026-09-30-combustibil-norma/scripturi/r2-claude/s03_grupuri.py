"""Pe grupurile flotei (sep+aug cumulat): WAPE și bias pentru metodele principale — dezacordul 2 (bias interurban)."""
from r2core import *
pd.set_option('display.width', 250)
TESTS = {'T1_sep': ('2026-06-10', '2026-08-31', '2026-09-01', '2026-09-27'),
         'T2_aug': ('2026-06-10', '2026-07-31', '2026-08-01', '2026-08-31')}
M = ['plin SQL (445)', 'plin zi ≥3.000 km (Codex r1)', 'plin zi ora-prop', 'plin zi ora-bin', 'plin SQL ora-prop', 'eb_tip_K5k (Claude r1)', 'veche']
rows = []
for tn, (C0, C1, T0, T1) in TESTS.items():
    s = esantion(C0, C1, T0, T1)
    N = metode(C0, C1)
    for m in M:
        x = scor(N[m], s).join(V[['grup']])
        x['test'] = tn; x['metoda'] = m
        rows.append(x)
X = pd.concat(rows)
t = X.groupby(['metoda', 'grup']).apply(lambda d: pd.Series(metr(d))).round(2)
print(t.unstack('grup')[['N', 'WAPE', 'bias']].to_string())
# intervalele: câte intervale scurte (<300 km) se pierd și bias-ul normei plin față de raportul lunar, pe grup (calibrare 10.06–31.08)
C0, C1 = '2026-06-10', '2026-08-31'
for sp in [None, 'prop']:
    iv = intervale(C0, C1, 'zi', split=sp, minkm=0).join(V[['grup']], on='placa')
    iv = iv[iv.km > 0]
    a = iv.groupby('grup').apply(lambda d: 100 * d.l.sum() / d.km.sum())
    b = iv[iv.km >= 300].groupby('grup').apply(lambda d: 100 * d.l.sum() / d.km.sum())
    print('split', sp, 'norma grup toate intervalele / doar >=300 km:', (a / b).round(3).to_dict(), ' intervale <300 km:', int((iv.km < 300).sum()))
