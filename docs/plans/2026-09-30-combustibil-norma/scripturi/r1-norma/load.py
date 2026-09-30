"""Încărcarea comună a datelor ION-151 (runda 1, NORMA)."""
import pandas as pd, numpy as np
D = '/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-151-translux-combustibil-analiza-c/docs/plans/2026-09-30-combustibil-norma/date/'

def veh():
    v = pd.read_csv(D + 'vehicule.csv')
    def grup(r):
        d = str(r.directii) if pd.notna(r.directii) else ''
        c = str(r.categorie) if pd.notna(r.categorie) else ''
        if 'camioane' in d or c == 'camion_marfa':
            return 'camioane'
        if 'interurban' in d:
            return 'interurban'
        if c == 'microbuz':
            return 'microbuze'
        if d == '' and c == '':
            return 'altele'
        return 'autobuze_uzina'
    v['grup'] = v.apply(grup, axis=1)
    return v

def benzol():
    b = pd.read_csv(D + 'alimentari_benzol.csv')
    b['ts'] = pd.to_datetime(b.alimentat_at, utc=True).dt.tz_convert('Europe/Chisinau')
    b['zi'] = b.ts.dt.tz_localize(None).dt.normalize()
    b['src'] = 'benzol'
    return b

def foi():
    f = pd.read_csv(D + 'foi_parcurs.csv')
    f['zi'] = pd.to_datetime(f.zi)
    f['src'] = 'foaie'
    return f

def gps():
    g = pd.read_csv(D + 'km_gps_zi.csv')
    g['zi'] = pd.to_datetime(g.date)
    g['km_patched'] = g.km_patched.fillna(0)
    parc = (g.km_patched > 0) & (g.km_total - g.km_patched < 5)
    g['km_prod'] = np.where(parc, (g.km_total - g.km_patched).clip(lower=0), g.km_total)  # ca în 444/445
    g['parcare'] = parc
    g = g[g.km_total > 0]
    return g

def m2m():
    m = pd.read_csv(D + 'km_lde_m2m.csv')
    m['zi'] = pd.to_datetime(m.zi)
    return m.groupby(['placa', 'zi'], as_index=False).km.sum()

def alim():
    """toate alimentările (benzol + foaie) cu zi locală"""
    b = benzol(); f = foi()
    a = pd.concat([b[['placa', 'zi', 'litri', 'src', 'ts']], f[['placa', 'zi', 'litri', 'src']].assign(ts=pd.NaT)], ignore_index=True)
    return a

def kmzi(sursa='prod', de=None, pana=None):
    """km pe zi: prod = GPS (cu fix-ul de parcare), altfel m2m; gps = doar GPS; m2m = doar m2m; raw = GPS km_total fără fix"""
    g = gps(); m = m2m()
    if de is not None:
        g = g[(g.zi >= de) & (g.zi <= pana)]; m = m[(m.zi >= de) & (m.zi <= pana)]
    if sursa == 'm2m':
        return m.rename(columns={'km': 'km'})[['placa', 'zi', 'km']]
    col = 'km_total' if sursa == 'raw' else 'km_prod'
    gg = g[['placa', 'zi', col]].rename(columns={col: 'km'})
    if sursa in ('gps', 'gpsraw'):
        return gg
    x = gg.merge(m, on=['placa', 'zi'], how='outer', suffixes=('_g', '_m'))
    x['km'] = x.km_g.combine_first(x.km_m)
    return x[['placa', 'zi', 'km']]
