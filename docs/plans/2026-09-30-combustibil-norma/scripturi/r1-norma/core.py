"""Metodele de normă. Toate primesc: a = alimentări (placa, zi, litri, src, ts), k = km pe zi (placa, zi, km)."""
from load import *

def cut(df, de, pana):
    return df[(df.zi >= pd.Timestamp(de)) & (df.zi <= pd.Timestamp(pana))]

# ---------- luna ca în producție (lde_fuel_flota, migr. 445) ----------
def luna_prod(a, k, de, pana):
    """litri de la prima zi cu km>0 până la ultima zi cu km>=20 / toți km-ii perioadei"""
    a = cut(a, de, pana); k = cut(k, de, pana)
    kk = k.groupby('placa').agg(km=('km', 'sum'))
    kk['prima'] = k[k.km > 0].groupby('placa').zi.min()
    kk['ultima'] = k[k.km >= 20].groupby('placa').zi.max()
    x = a.merge(kk[['prima', 'ultima']].reset_index(), on='placa')
    x = x[(x.zi >= x.prima) & (x.zi <= x.ultima)]
    kk['L'] = x.groupby('placa').litri.sum()
    kk['L'] = kk.L.fillna(0)
    kk['L_tot'] = a.groupby('placa').litri.sum()
    kk['L_tot'] = kk.L_tot.fillna(0)
    return kk

# ---------- plin la plin ----------
def plin_intervale(a, k, de, pana, frac=0.85, q=0.9, prag='fill', ora=False, minkm=300, ref=None):
    """Reproduce lde_fuel_plin_la_plin (migr. 445) cu variante.
    prag='fill': plinul = o alimentare >= frac*Pq a alimentărilor individuale (producția);
    prag='zi': suma zilei >= frac*Pq a sumelor pe zi.
    ora=True: alimentarea benzol după ora 12 locală se consideră după munca zilei (granița = zi+1); foaia rămâne «dimineața».
    ref: dict placa->prag litri calculat în altă perioadă (opțional).
    Întoarce intervalele (placa, z1, z2, l, km)."""
    a = cut(a, de, pana).copy(); k = cut(k, de, pana)
    if ora:
        ts = pd.to_datetime(a.ts, utc=True).dt.tz_convert('Europe/Chisinau'); h = ts.dt.hour
        a['p'] = a.zi + pd.to_timedelta(np.where(ts.notna() & (h >= 12), 1, 0), unit='D')
    else:
        a['p'] = a.zi
    out = []
    kd = {p: g.set_index('zi').km for p, g in k.groupby('placa')}
    for placa, g in a.groupby('placa'):
        if prag == 'zi':
            vals = g.groupby('p').litri.sum()
        else:
            vals = g.litri
        thr = ref.get(placa) if ref is not None else None
        if thr is None:
            if len(vals) == 0:
                continue
            thr = frac * np.percentile(vals, q * 100)
        if prag == 'zi':
            dz = g.groupby('p').litri.sum()
            plin = sorted(dz[dz >= thr].index)
        else:
            plin = sorted(g[g.litri >= thr].p.unique())
        if len(plin) < 2:
            continue
        gl = g.groupby('p').litri.sum()
        km = kd.get(placa)
        cl = gl.cumsum()
        for z1, z2 in zip(plin[:-1], plin[1:]):
            l = gl[(gl.index > z1) & (gl.index <= z2)].sum()
            kmv = km[(km.index >= z1) & (km.index < z2)].sum() if km is not None else 0
            out.append((placa, z1, z2, l, kmv))
    iv = pd.DataFrame(out, columns=['placa', 'z1', 'z2', 'l', 'km'])
    return iv[iv.km >= minkm] if minkm else iv[iv.km > 0]

def plin_norma(iv, minint=3, stat='ratio', trim=0.1):
    g = iv.assign(c=100 * iv.l / iv.km).groupby('placa')
    if stat == 'ratio':
        r = g.apply(lambda d: 100 * d.l.sum() / d.km.sum())
    elif stat == 'median':
        r = g.c.median()
    elif stat == 'wmedian':
        def wm(d):
            d = d.sort_values('c'); cw = d.km.cumsum() / d.km.sum()
            return d.c[cw >= 0.5].iloc[0]
        r = g.apply(wm)
    elif stat == 'trim':
        def tm(d):
            lo, hi = d.c.quantile(trim), d.c.quantile(1 - trim)
            dd = d[(d.c >= lo) & (d.c <= hi)]
            return 100 * dd.l.sum() / dd.km.sum() if len(dd) else np.nan
        r = g.apply(tm)
    n = g.size()
    df = pd.DataFrame({'norma': r, 'n': n, 'km': g.km.sum(), 'l': g.l.sum()})
    return df[df.n >= minint]

# ---------- raport simplu pe fereastră ----------
def raport(a, k, de, pana, minkm=0):
    lp = luna_prod(a, k, de, pana)
    lp = lp[lp.km >= minkm]
    return (100 * lp.L / lp.km).rename('norma').to_frame().assign(km=lp.km, l=lp.L)

def raport_lunar(a, k, de, pana):
    """Σ peste luni a litrilor lunii (regula producției) / Σ km — fiecare lună cu regula ei"""
    luni = pd.period_range(pd.Timestamp(de), pd.Timestamp(pana), freq='M')
    rows = []
    for p in luni:
        d0 = max(p.start_time, pd.Timestamp(de)); d1 = min(p.end_time.normalize(), pd.Timestamp(pana))
        lp = luna_prod(a, k, d0, d1)
        rows.append(lp[['L', 'km']])
    t = pd.concat(rows).groupby(level=0).sum()
    return (100 * t.L / t.km).rename('norma').to_frame().assign(km=t.km, l=t.L)

# ---------- regresie săptămânală ----------
def regresie(a, k, de, pana, per='W'):
    """litri_săpt = alfa*zile_active + beta*km  (alfa = consum fix pe zi de lucru, beta = l/km). Întoarce beta*100, alfa."""
    a = cut(a, de, pana); k = cut(k, de, pana)
    a = a.assign(t=a.zi.dt.to_period(per)); k = k.assign(t=k.zi.dt.to_period(per))
    L = a.groupby(['placa', 't']).litri.sum()
    K = k.groupby(['placa', 't']).km.sum()
    Z = k[k.km >= 20].groupby(['placa', 't']).size()
    x = pd.concat([L.rename('L'), K.rename('km'), Z.rename('z')], axis=1).fillna(0)
    res = {}
    for placa, d in x.groupby(level=0):
        if len(d) < 6 or d.km.sum() < 1000:
            continue
        X1 = d.km.values
        # prin origine
        b0 = (X1 * d.L.values).sum() / (X1 ** 2).sum()
        X = np.c_[d.z.values, X1]
        try:
            coef, *_ = np.linalg.lstsq(X, d.L.values, rcond=None)
        except Exception:
            coef = [np.nan, np.nan]
        res[placa] = dict(norma_origine=100 * b0, norma_panta=100 * coef[1], alfa_zi=coef[0], nper=len(d))
    return pd.DataFrame(res).T
