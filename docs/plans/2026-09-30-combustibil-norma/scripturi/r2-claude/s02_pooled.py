"""Scor comun pe ambele teste (Σ|err| / ΣL pe sep+aug) + bootstrap pereche pe vehicule față de metoda Codex r1.
Adaugă combinațiile: fallback eb în loc de veche; media Codex+eb."""
from r2core import *
pd.set_option('display.width', 250)
TESTS = {'T1_sep': ('2026-06-10', '2026-08-31', '2026-09-01', '2026-09-27'),
         'T2_aug': ('2026-06-10', '2026-07-31', '2026-08-01', '2026-08-31')}
REF = 'plin zi ≥3.000 km (Codex r1)'
X = {}
for tn, (C0, C1, T0, T1) in TESTS.items():
    s = esantion(C0, C1, T0, T1)
    N = metode(C0, C1)
    eb = N['eb_tip_K5k (Claude r1)']
    N['Codex, fallback eb (nu veche)'] = N[REF].combine_first(eb)
    N['media(Codex, eb)'] = (N[REF].combine_first(OLD).reindex(eb.index) + eb) / 2
    N['plin zi ora-prop ≥3.000, fallback eb'] = N['plin zi ora-prop'].combine_first(eb)
    N['plin zi ≥3.000 trim10, fallback eb'] = N['plin zi ≥3.000 trim10'].combine_first(eb)
    N['[lookahead] plin SQL 10.06→luna inclusă'] = norma_iv(intervale(C0, T1, 'fill')).norma
    for nm, norm in N.items():
        X[(tn, nm)] = scor(norm, s)[['L', 'pred', 'e', 'cam']].assign(test=tn)
metods = sorted({m for _, m in X})
rows = []
for m in metods:
    x = pd.concat([X[(t, m)] for t in TESTS])
    for g, d in [('total', x), ('fara_cam', x[~x.cam]), ('camioane', x[x.cam])]:
        rows.append(dict(metoda=m, grup=g, **metr(d)))
R = pd.DataFrame(rows)
t = R.pivot_table(index='metoda', columns='grup', values=['WAPE', 'bias', 'med', 'P90']).round(2)
t.columns = [f'{a}_{b}' for a, b in t.columns]
print('=== sep+aug cumulat (N = 146 + 140 vehicul-luni)')
print(t[['WAPE_total', 'bias_total', 'med_total', 'P90_total', 'WAPE_fara_cam', 'med_fara_cam', 'P90_fara_cam', 'WAPE_camioane', 'med_camioane']].sort_values('WAPE_fara_cam').to_string())
R.to_csv('out_pooled.csv', index=False)

# bootstrap pereche: ΔWAPE (metoda − REF), reeșantionare vehicule în fiecare test
rng = np.random.default_rng(151)
def wape(d): return (d.pred - d.L).abs().sum() / d.L.sum()
out = []
for m in metods:
    if m == REF: continue
    for g in ['total', 'fara_cam']:
        diffs = []
        base = {t: X[(t, REF)] for t in TESTS}; oth = {t: X[(t, m)] for t in TESTS}
        if g == 'fara_cam':
            base = {t: d[~d.cam] for t, d in base.items()}; oth = {t: d[~d.cam] for t, d in oth.items()}
        for _ in range(2000):
            bb = []; oo = []
            for t in TESTS:
                ix = rng.choice(base[t].index.values, len(base[t]), replace=True)
                bb.append(base[t].loc[ix]); oo.append(oth[t].loc[ix])
            diffs.append(wape(pd.concat(oo)) - wape(pd.concat(bb)))
        d0 = wape(pd.concat(oth.values())) - wape(pd.concat(base.values()))
        out.append(dict(metoda=m, grup=g, dWAPE_pp=round(100 * d0, 2), lo=round(100 * np.percentile(diffs, 2.5), 2), hi=round(100 * np.percentile(diffs, 97.5), 2)))
B = pd.DataFrame(out)
print('\n=== ΔWAPE față de', REF, '(pp; negativ = mai bună), IC95 bootstrap 2.000, seed 151')
print(B.pivot_table(index='metoda', columns='grup', values=['dWAPE_pp', 'lo', 'hi']).round(2).sort_values(('dWAPE_pp', 'fara_cam')).to_string())
