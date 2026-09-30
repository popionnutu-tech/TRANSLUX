"""Protocolul comun pe toate metodele, Test 1 (sep) și Test 2 (aug)."""
from r2core import *
pd.set_option('display.width', 250); pd.set_option('display.max_rows', 200)
TESTS = {'T1_sep': ('2026-06-10', '2026-08-31', '2026-09-01', '2026-09-27'),
         'T2_aug': ('2026-06-10', '2026-07-31', '2026-08-01', '2026-08-31')}
rows = []
for tn, (C0, C1, T0, T1) in TESTS.items():
    s = esantion(C0, C1, T0, T1)
    N = metode(C0, C1)
    # lookahead (ca posterul): plin SQL calibrat pe 10.06 → sfârșitul lunii testate — NU e backtest
    N['[lookahead] plin SQL 10.06→luna inclusă'] = norma_iv(intervale(C0, T1, 'fill')).norma
    print(tn, 'eșantion N =', len(s), 'camioane', s.cam.sum(), 'litri', round(s.L.sum(), 1))
    for nm, norm in N.items():
        x = scor(norm, s)
        own = norm.reindex(s.index).notna().sum()
        for g, d in [('total', x), ('fara_cam', x[~x.cam]), ('camioane', x[x.cam])]:
            rows.append(dict(test=tn, metoda=nm, grup=g, proprie=own, **metr(d)))
R = pd.DataFrame(rows)
R.to_csv('out_protocol.csv', index=False)
for tn in TESTS:
    t = R[R.test == tn].pivot_table(index='metoda', columns='grup', values=['WAPE', 'bias', 'med', 'P90']).round(2)
    t.columns = [f'{a}_{b}' for a, b in t.columns]
    t['proprie'] = R[(R.test == tn) & (R.grup == 'total')].set_index('metoda').proprie
    t['N'] = R[(R.test == tn) & (R.grup == 'total')].set_index('metoda').N
    cols = ['N', 'proprie', 'WAPE_total', 'bias_total', 'med_total', 'P90_total', 'WAPE_fara_cam', 'bias_fara_cam', 'med_fara_cam', 'P90_fara_cam', 'WAPE_camioane', 'bias_camioane', 'med_camioane', 'P90_camioane']
    print('=====', tn); print(t[cols].sort_values('WAPE_total').to_string())
