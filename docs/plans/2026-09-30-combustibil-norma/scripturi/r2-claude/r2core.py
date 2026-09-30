"""Runda 2 — protocolul comun (DISPUTE.md). Refolosește load.py din r1-norma."""
import sys, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, '/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r1-norma')
from load import *  # veh, benzol, foi, gps, m2m, alim, kmzi, D

V = veh().set_index('placa')
OLD = V.norma_masurata_incarcat.combine_first(V.norma_masurata).combine_first(V.norma_tip)
TIPN = V.norma_tip
CAM = set(V.index[V.grup == 'camioane'])

A = alim()                       # placa, zi, litri, src, ts
A['ts'] = pd.to_datetime(A.ts, utc=True).dt.tz_convert('Europe/Chisinau')
A['h'] = A.ts.dt.hour + A.ts.dt.minute / 60.0          # NaN pe foaie


def km_prod():
    """km pe zi ca în 445: GPS cu regula parcării (km_total>0), altfel m2m; + marcaj sursă"""
    g = gps()[['placa', 'zi', 'km_prod']].rename(columns={'km_prod': 'kg'})
    m = m2m().rename(columns={'km': 'km_m'})
    x = g.merge(m, on=['placa', 'zi'], how='outer')
    x['km'] = x.kg.combine_first(x.km_m)
    x['km_gps'] = x.kg.fillna(0)
    return x[['placa', 'zi', 'km', 'km_gps']]


K = km_prod()


def cut(df, de, pana):
    return df[(df.zi >= pd.Timestamp(de)) & (df.zi <= pd.Timestamp(pana))]


def luna_prod(de, pana, a=A, k=K):
    a = cut(a, de, pana); k = cut(k, de, pana)
    kk = k.groupby('placa').agg(km=('km', 'sum'), km_gps=('km_gps', 'sum'))
    kk['prima'] = k[k.km > 0].groupby('placa').zi.min()
    kk['ultima'] = k[k.km >= 20].groupby('placa').zi.max()
    x = a.merge(kk[['prima', 'ultima']].reset_index(), on='placa')
    x = x[(x.zi >= x.prima) & (x.zi <= x.ultima)]
    kk['L'] = x.groupby('placa').litri.sum()
    kk['L'] = kk.L.fillna(0)
    return kk


def intervale(de, pana, prag='fill', frac=0.85, q=0.9, minkm=300, split=None, a=A, k=K):
    """Plin estimat la plin estimat.
    prag='fill': P90 și testul pe înregistrări individuale (exact SQL 445); prag='zi': pe totalul zilei (Codex).
    split=None: km z1<=zi<z2 (SQL). split='bin': plin benzol după 12:00 => km zilei plinului merg la intervalul vechi.
    split='prop': fracția f=(h-5)/17 (0..1) din km-ii zilei plinului e ÎNAINTE de plin (benzol cu oră; foaia f=0)."""
    a = cut(a, de, pana); k = cut(k, de, pana)
    kd = {p: g.set_index('zi').km for p, g in k.groupby('placa')}
    out = []
    for placa, g in a.groupby('placa'):
        gl = g.groupby('zi').litri.sum()
        if prag == 'zi':
            thr = frac * np.percentile(gl.values, q * 100)
            plin = sorted(gl[gl >= thr].index)
        else:
            thr = frac * np.percentile(g.litri.values, q * 100)
            plin = sorted(g[g.litri >= thr].zi.unique())
        if len(plin) < 2:
            continue
        # fracția zilnică (ora celei mai mari alimentări a zilei)
        fr = {}
        if split:
            big = g.sort_values('litri').groupby('zi').tail(1).set_index('zi').h
            for z in plin:
                h = big.get(z, np.nan)
                if pd.isna(h):
                    fr[z] = 0.0
                elif split == 'bin':
                    fr[z] = 1.0 if h >= 12 else 0.0
                else:
                    fr[z] = float(np.clip((h - 5) / 17, 0, 1))
        km = kd.get(placa)
        if km is None:
            continue
        for z1, z2 in zip(plin[:-1], plin[1:]):
            l = gl[(gl.index > z1) & (gl.index <= z2)].sum()
            kmv = km[(km.index >= z1) & (km.index < z2)].sum()
            if split:
                kmv += -fr[z1] * km.get(z1, 0) + fr[z2] * km.get(z2, 0)
            out.append((placa, z1, z2, l, kmv))
    iv = pd.DataFrame(out, columns=['placa', 'z1', 'z2', 'l', 'km'])
    return iv[iv.km >= minkm]


def norma_iv(iv, minint=3, minkm=0, stat='ratio'):
    g = iv.groupby('placa')
    df = pd.DataFrame({'l': g.l.sum(), 'km': g.km.sum(), 'n': g.size()})
    if stat == 'trim':
        def tm(d):
            c = 100 * d.l / d.km
            lo, hi = c.quantile(.1), c.quantile(.9)
            dd = d[(c >= lo) & (c <= hi)]
            return 100 * dd.l.sum() / dd.km.sum()
        df['norma'] = g.apply(tm)
    else:
        df['norma'] = 100 * df.l / df.km
    return df[(df.n >= minint) & (df.km >= minkm)]


def raport_lunar(de, pana):
    luni = pd.period_range(pd.Timestamp(de), pd.Timestamp(pana), freq='M')
    rows = []
    for p in luni:
        d0 = max(p.start_time, pd.Timestamp(de)); d1 = min(p.end_time.normalize(), pd.Timestamp(pana))
        rows.append(luna_prod(d0, d1)[['L', 'km']])
    t = pd.concat(rows).groupby(level=0).sum()
    t = t[t.km > 0]
    return pd.DataFrame({'norma': 100 * t.L / t.km, 'km': t.km, 'l': t.L})


def tipk(idx):
    """cheia tipului: tip_nume dacă are ≥4 mașini în flotă, altfel grupul"""
    cnt = V.tip_nume.value_counts()
    t = V.tip_nume.reindex(idx)
    ok = t.map(cnt).fillna(0) >= 4
    return t.where(ok, 'G:' + V.grup.reindex(idx))


def shrink(r, K_):
    """r: DataFrame norma, km, l. N = (km·r + K·r_tip)/(km+K); r_tip = Σl/Σkm pe tip."""
    r = r[r.km > 0].copy()
    r['tk'] = tipk(r.index)
    rt = r.groupby('tk').apply(lambda d: 100 * d.l.sum() / d.km.sum())
    r['rt'] = r.tk.map(rt)
    return (r.km * r.norma + K_ * r.rt) / (r.km + K_)


def metode(C0, C1):
    N = {}
    N['veche'] = OLD
    N['tip'] = TIPN
    rl = raport_lunar(C0, C1)
    N['raport_fereastra'] = rl.norma
    N['eb_tip_K5k (Claude r1)'] = shrink(rl, 5000)
    N['eb_tip_K10k'] = shrink(rl, 10000)
    N['50/50 veche+raport'] = (0.5 * OLD.reindex(rl.index) + 0.5 * rl.norma)
    iv_sql = intervale(C0, C1, 'fill')
    iv_zi = intervale(C0, C1, 'zi')
    N['plin SQL (445)'] = norma_iv(iv_sql).norma
    N['plin zi'] = norma_iv(iv_zi).norma
    N['plin zi ≥3.000 km (Codex r1)'] = norma_iv(iv_zi, minkm=3000).norma
    N['plin zi ≥3.000 trim10'] = norma_iv(iv_zi, minkm=3000, stat='trim').norma
    N['plin zi ora-bin'] = norma_iv(intervale(C0, C1, 'zi', split='bin'), minkm=3000).norma
    N['plin zi ora-prop'] = norma_iv(intervale(C0, C1, 'zi', split='prop'), minkm=3000).norma
    N['plin SQL ora-prop'] = norma_iv(intervale(C0, C1, 'fill', split='prop')).norma
    # combinații: plin zi (orice nr. intervale) tras spre tipul plin, completat cu eb
    pz = norma_iv(iv_zi, minint=1)
    for K_ in (3000, 5000, 10000):
        N[f'plin zi + shrink tip K{K_//1000}k'] = shrink(pz, K_).combine_first(N['eb_tip_K5k (Claude r1)'])
    pzo = norma_iv(intervale(C0, C1, 'zi', split='prop'), minint=1)
    N['plin zi ora-prop + shrink K5k'] = shrink(pzo, 5000).combine_first(N['eb_tip_K5k (Claude r1)'])
    return N


def esantion(C0, C1, T0, T1):
    kc = cut(K, C0, C1).groupby('placa').km.sum()
    T = luna_prod(T0, T1)
    T['kc'] = kc
    T['gps_pct'] = T.km_gps / T.km
    s = T[(T.kc >= 3000) & (T.km >= 1000) & (T.gps_pct >= 0.95) & (T.L > 0)].copy()
    s['cam'] = s.index.isin(CAM)
    return s


def scor(norm, s, fallback=OLD):
    n = norm.reindex(s.index).combine_first(fallback.reindex(s.index))
    x = s.assign(n=n).dropna(subset=['n'])
    x['pred'] = x.n * x.km / 100
    x['e'] = (x.pred - x.L) / x.L          # pozitiv = supraestimare (convenția Codex)
    return x


def metr(x):
    if len(x) == 0:
        return dict(N=0)
    return dict(N=len(x), WAPE=100 * (x.pred - x.L).abs().sum() / x.L.sum(),
                bias=100 * (x.pred - x.L).sum() / x.L.sum(),
                med=100 * x.e.abs().median(), P90=100 * x.e.abs().quantile(.9))
