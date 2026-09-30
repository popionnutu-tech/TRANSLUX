"""R3.2 — fereastra (3 luni / 6 luni / cumulat din 01.2025) și iarna, pe km m2m (singura sursă cu istoric), fără camioane.
Fiecare lună T din 2025-04 … 2026-09 e prezisă din luni închise anterioare. Aceeași țintă ca producția (fereastra lunii)."""
from r3core import *
pd.set_option('display.width', 250)
KM = m2m().rename(columns={'km': 'km'}); KM['km_gps'] = KM.km   # doar m2m
KM = KM[['placa', 'zi', 'km', 'km_gps']]


def luna_m(d0, d1):
    return luna_prod(d0, d1, a=A, k=KM)


def raport_m(C0, C1):
    luni = pd.period_range(pd.Timestamp(C0), pd.Timestamp(C1), freq='M'); rows = []
    for p in luni:
        rows.append(luna_m(max(p.start_time, pd.Timestamp(C0)), min(p.end_time.normalize(), pd.Timestamp(C1)))[['L', 'km']])
    t = pd.concat(rows).groupby(level=0).sum(); t = t[t.km > 0]
    return pd.DataFrame({'norma': 100 * t.L / t.km, 'km': t.km, 'l': t.L})


rows = []
luni = pd.period_range('2025-04', '2026-09', freq='M')
for p in luni:
    T0 = p.start_time; T1 = min(p.end_time.normalize(), pd.Timestamp('2026-09-27'))
    tgt = luna_m(T0, T1); tgt = tgt[(tgt.km >= 1000) & (tgt.L > 0) & (~tgt.index.isin(CAM))]
    fb = old_asof(T0)
    for w in ['3', '6', 'cum']:
        C1 = T0 - pd.Timedelta(days=1)
        C0 = pd.Timestamp('2025-01-01') if w == 'cum' else max(pd.Timestamp('2025-01-01'), (p - int(w)).start_time)
        if w != 'cum' and (p - int(w)).start_time < pd.Timestamp('2025-01-01'):
            continue
        kc = cut(KM, C0, C1).groupby('placa').km.sum()
        s = tgt[tgt.index.map(kc).fillna(0) >= 3000]
        iv = intervale(C0, C1, 'zi', a=A, k=KM)
        rl = raport_m(C0, C1)
        N = {'zi trim10': norma_iv(iv, stat='trim').norma, 'Codex zi≥3.000': norma_iv(iv, minkm=3000).norma,
             'EB K5k': shrink(rl, 5000)}
        for nm, n in N.items():
            nn = n.reindex(s.index).combine_first(fb.reindex(s.index))
            pred = nn * s.km / 100
            for i in s.index:
                if pd.notna(pred[i]):
                    rows.append(dict(luna=str(p), w=w, metoda=nm, placa=i, L=s.L[i], pred=pred[i]))
    print(p, 'gata', flush=True)
R = pd.DataFrame(rows); R.to_csv('out_fereastra_m2m.csv', index=False)
R['ae'] = (R.pred - R.L).abs(); R['er'] = R.pred - R.L


def agg(d):
    return pd.Series({'N': len(d), 'WAPE': round(100 * d.ae.sum() / d.L.sum(), 2), 'bias': round(100 * d.er.sum() / d.L.sum(), 2)})


# comparăm doar lunile unde există toate ferestrele (de la 2025-07)
C = R[R.luna >= '2025-07']
print('\n=== 2025-07 … 2026-09, WAPE / bias, fără camioane, km m2m')
print(C.groupby(['metoda', 'w']).apply(agg).unstack('w').to_string())
C = C.assign(sezon=np.where(C.luna.str[5:].isin(['11', '12', '01', '02', '03']), 'iarna(nov-mar)', 'vara(apr-oct)'))
print('\n=== pe sezon')
print(C.groupby(['metoda', 'w', 'sezon']).apply(agg).unstack('sezon').to_string())
print('\n=== pe lună, WAPE (bias) zi trim10')
t = C[C.metoda == 'zi trim10'].groupby(['luna', 'w']).apply(agg)
print(t.unstack('w').to_string())
