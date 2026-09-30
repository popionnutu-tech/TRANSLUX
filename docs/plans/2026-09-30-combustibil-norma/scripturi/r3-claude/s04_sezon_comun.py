"""R3.4 — iarna: corecția comună a lunii (mediana L/pred a grupului în luna judecată) pe testul lung m2m, EB 3 luni.
Plus pragul în litri: rata semnalelor cu și fără corecție."""
import sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r3-claude')
from r3core import *
R = pd.read_csv('out_fereastra_m2m.csv'); R = R[(R.luna >= '2025-07') & (R.w.astype(str) == '3') & (R.metoda == 'EB K5k')].copy()
R['grup'] = V.grup.reindex(R.placa).values
R['r'] = R.L / R.pred
R['f'] = R.groupby(['luna', 'grup']).r.transform('median')
R['pred_c'] = R.pred * R.f
def st(d, col):
    return pd.Series({'N': len(d), 'WAPE': round(100 * (d[col] - d.L).abs().sum() / d.L.sum(), 2), 'bias': round(100 * (d[col] - d.L).sum() / d.L.sum(), 2),
                      '>+15%': round(100 * (d.L / d[col] - 1 > .15).mean(), 1), '>+20%': round(100 * (d.L / d[col] - 1 > .20).mean(), 1)})
o = pd.concat({'fără': R.groupby('luna').apply(lambda d: st(d, 'pred')), 'cu corecția lunii': R.groupby('luna').apply(lambda d: st(d, 'pred_c'))}, axis=1)
print(o.to_string())
print('total fără:', st(R, 'pred').to_dict()); print('total cu corecție:', st(R, 'pred_c').to_dict())
print('factorul lunii pe grup (mediana L/pred):'); print(R.groupby(['luna', 'grup']).f.first().unstack().round(3).to_string())
