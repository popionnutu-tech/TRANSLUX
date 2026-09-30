"""R3.1 — alinierea cifrelor Claude/Codex: fallback cu/fără viitor, pe lună și cumulat, cu/fără camioane; bootstrap."""
from r3core import *
pd.set_option('display.width', 250); pd.set_option('display.max_rows', 200)
X = {}
NI = {}
for tn, (C0, C1, T0, T1) in TESTS.items():
    s = esantion(C0, C1, T0, T1)
    N = metode3(C0, C1)
    eb = N.pop('_eb'); nsql = N.pop('_n_sql'); nzi = N.pop('_n_zi')
    fb = old_asof(T0)
    N['media(Codex, EB)'] = (N['Codex: plin zi ≥3.000'].combine_first(fb).reindex(eb.index) + eb) / 2
    N['media(zi trim10, EB)'] = (N['zi trim10'].combine_first(fb).reindex(eb.index) + eb) / 2
    N['norma veche (fără viitor)'] = fb
    for nm, norm in N.items():
        X[(tn, nm, 'asof')] = scor(norm, s, fallback=fb)[['L', 'pred', 'e', 'cam']]
        X[(tn, nm, 'viitor')] = scor(norm, s, fallback=OLD)[['L', 'pred', 'e', 'cam']]
    NI[tn] = nzi.reindex(s.index)
    diff = (fb != OLD) & fb.notna()
    print(tn, 'N', len(s), 'cam', int(s.cam.sum()), 'L', round(s.L.sum(), 1), '| fallback cu viitor diferit la', list(fb.index[diff & fb.index.isin(s.index)]))
metods = sorted({m for _, m, _ in X})
rows = []
for m in metods:
    for fbk in ['asof', 'viitor']:
        for tn in list(TESTS) + ['sep+aug']:
            x = pd.concat([X[(t, m, fbk)] for t in TESTS]) if tn == 'sep+aug' else X[(tn, m, fbk)]
            for g, d in [('total', x), ('fara_cam', x[~x.cam]), ('cam', x[x.cam])]:
                rows.append(dict(metoda=m, fb=fbk, test=tn, grup=g, **metr(d)))
R = pd.DataFrame(rows)
R.to_csv('out_aliniere.csv', index=False)
for fbk in ['asof', 'viitor']:
    t = R[R.fb == fbk].pivot_table(index='metoda', columns=['test', 'grup'], values='WAPE').round(2)
    t = t[[('sep', 'total'), ('sep', 'fara_cam'), ('sep', 'cam'), ('aug', 'total'), ('aug', 'fara_cam'), ('aug', 'cam'),
           ('sep+aug', 'total'), ('sep+aug', 'fara_cam'), ('sep+aug', 'cam')]]
    b = R[(R.fb == fbk) & (R.test == 'sep+aug')].pivot_table(index='metoda', columns='grup', values=['bias', 'med', 'P90']).round(2)
    t[('bias', 'total')] = b[('bias', 'total')]; t[('bias', 'fara_cam')] = b[('bias', 'fara_cam')]
    t[('med', 'fara_cam')] = b[('med', 'fara_cam')]; t[('P90', 'fara_cam')] = b[('P90', 'fara_cam')]
    print(f'\n===== WAPE %, fallback = {fbk}'); print(t.sort_values(('sep+aug', 'total')).to_string())
    # media aritmetică a celor două luni (cum ar compara cineva pe lună)
    mm = R[(R.fb == fbk) & (R.test.isin(['sep', 'aug']))].groupby(['metoda', 'grup']).WAPE.mean().unstack().round(2)
    print('  media simplă a WAPE lunare:'); print(mm.sort_values('total').to_string())

rng = np.random.default_rng(151)
def wape(d): return (d.pred - d.L).abs().sum() / d.L.sum()
def boot(a, b, g, B=2000):
    base = {t: X[(t, b, 'asof')] for t in TESTS}; oth = {t: X[(t, a, 'asof')] for t in TESTS}
    if g == 'fara_cam':
        base = {t: d[~d.cam] for t, d in base.items()}; oth = {t: d[~d.cam] for t, d in oth.items()}
    diffs = []
    for _ in range(B):
        bb = []; oo = []
        for t in TESTS:
            ix = rng.choice(base[t].index.values, len(base[t]), replace=True)
            bb.append(base[t].loc[ix]); oo.append(oth[t].loc[ix])
        diffs.append(wape(pd.concat(oo)) - wape(pd.concat(bb)))
    d0 = wape(pd.concat(oth.values())) - wape(pd.concat(base.values()))
    return round(100 * d0, 2), round(100 * np.percentile(diffs, 2.5), 2), round(100 * np.percentile(diffs, 97.5), 2)
print('\n===== bootstrap pe vehicule (fallback fără viitor), ΔWAPE pp = A − B, IC95')
pairs = [('SQL trim10', 'Codex: plin zi ≥3.000'), ('zi trim10', 'Codex: plin zi ≥3.000'), ('EB K5k (Claude)', 'Codex: plin zi ≥3.000'),
         ('media(Codex, EB)', 'Codex: plin zi ≥3.000'), ('Codex: plin zi ≥3.000', 'plin SQL 445'), ('SQL trim10', 'plin SQL 445'),
         ('zi trim10', 'plin SQL 445'), ('SQL trim10', 'EB K5k (Claude)'), ('zi trim10', 'SQL trim10'), ('raport fereastra', 'EB K5k (Claude)'),
         ('Codex: plin zi ≥3.000', 'norma veche (fără viitor)'), ('SQL trim10', 'norma veche (fără viitor)'), ('media(zi trim10, EB)', 'zi trim10')]
for a, b in pairs:
    print(f'{a:28s} − {b:28s}  total {boot(a, b, "total")}   fără cam {boot(a, b, "fara_cam")}')

print('\n===== robustețe: WAPE fără camioane pe numărul de intervale plin-zi din calibrare (fallback fără viitor)')
for m in ['Codex: plin zi ≥3.000', 'SQL trim10', 'zi trim10', 'EB K5k (Claude)', 'plin SQL 445', 'media(Codex, EB)']:
    x = pd.concat([X[(t, m, 'asof')].assign(n=NI[t]) for t in TESTS]); x = x[~x.cam]
    x['nb'] = pd.cut(x.n.fillna(0), [-1, 2, 5, 10, 1000], labels=['0-2', '3-5', '6-10', '>10'])
    o = x.groupby('nb').apply(lambda d: pd.Series({'N': len(d), 'WAPE': round(100 * (d.pred - d.L).abs().sum() / d.L.sum(), 2),
                                                  'bias': round(100 * (d.pred - d.L).sum() / d.L.sum(), 2)}))
    print(m); print(o.T.to_string())
