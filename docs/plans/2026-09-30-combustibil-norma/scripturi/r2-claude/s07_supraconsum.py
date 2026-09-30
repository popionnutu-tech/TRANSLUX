"""8. Lista unită de supraconsum: ce rămâne după verificarea km-ilor. + verificarea 602BRAS / 863MXL 2025→2026."""
from r2core import *
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 40)
CAZ = ['603BRAS', '034BRAT', '279BRAT', '783MUM', 'RWN193', 'HMK135', 'LJN080', '710CWN', 'KWX620', '602BRAS', '863MXL']
mm_raw = pd.read_csv(D + 'km_lde_m2m.csv'); mm_raw['zi'] = pd.to_datetime(mm_raw.zi)
m = m2m()
km_m = m.rename(columns={'km': 'km'})
# litri lunari (regula lunii) cu km m2m, 2025-01 → 2026-09
def lunar(k):
    rows = []
    for p in pd.period_range('2025-01', '2026-09', freq='M'):
        lp = luna_prod(p.start_time, min(p.end_time.normalize(), pd.Timestamp('2026-09-27')), k=k)
        lp['luna'] = str(p); rows.append(lp[['L', 'km', 'luna']])
    return pd.concat(rows)
Mm = lunar(km_m.assign(km_gps=0)).reset_index().rename(columns={'index': 'placa'})
print('### Codex: ian–aug 2025 vs ian–aug 2026, doar m2m (Σ litrii lunilor / Σ km)')
def per(x, y0, luni):
    d = x[x.luna.isin([f'{y0}-{i:02d}' for i in luni])]
    return d.groupby('placa')[['L', 'km']].sum()
a25 = per(Mm, 2025, range(1, 9)); a26 = per(Mm, 2026, range(1, 9))
j = a25.join(a26, lsuffix='25', rsuffix='26')
j['r25'] = 100 * j.L25 / j.km25; j['r26'] = 100 * j.L26 / j.km26; j['ch'] = j.r26 / j.r25 - 1
print(j.reindex(CAZ).round(2).to_string())
# km: m2m vs GPS pe iun–sep 2026 pentru cazuri
g = gps()[['placa', 'zi', 'km_total', 'km_prod']]
jj = g.merge(m, on=['placa', 'zi'], how='outer')
jj = jj[(jj.zi >= '2026-06-10') & (jj.zi <= '2026-09-27')]
kmc = jj.groupby('placa').agg(gps=('km_prod', 'sum'), m2m=('km', 'sum'))
kmc['m2m/gps'] = kmc.m2m / kmc.gps
# peer: raport iul–sep pe km prod vs mediana tipului (≥3.000 km)
lp = luna_prod('2026-07-01', '2026-09-27')
r = (100 * lp.L / lp.km)[lp.km >= 3000].rename('r').to_frame().join(V[['tip_nume', 'grup', 'norma_masurata', 'data_masurare', 'norma_tip']])
r['med_tip'] = r.groupby('tip_nume').r.transform('median'); r['n_tip'] = r.groupby('tip_nume').r.transform('size')
r['vs_tip'] = r.r / r.med_tip - 1
r['exces_l'] = (r.r - r.med_tip) * lp.km.reindex(r.index) / 100
out = r.reindex(CAZ).join(kmc.round(0)).join(j[['r25', 'r26', 'ch']].round(3))
# direcția m2m dominantă 2025 vs 2026
dirm = mm_raw.assign(y=mm_raw.zi.dt.year).groupby(['placa', 'y']).directia.agg(lambda s: s.mode().iat[0] if len(s.dropna()) else None).unstack()
out = out.join(dirm.rename(columns={2025: 'dir25', 2026: 'dir26'}))
print('\n### lista unită (iul–27.09.2026, km prod)'); print(out[['grup', 'tip_nume', 'r', 'med_tip', 'n_tip', 'vs_tip', 'exces_l', 'norma_masurata', 'gps', 'm2m', 'm2m/gps', 'r25', 'r26', 'ch', 'dir25', 'dir26']].round(3).to_string())
print('\n### seria lunară m2m (l/100) + km m2m, 602BRAS și 863MXL (și 603BRAS, 279BRAT)')
for p in ['602BRAS', '863MXL', '603BRAS', '279BRAT']:
    d = Mm[Mm.placa == p].set_index('luna'); d['c'] = (100 * d.L / d.km).round(1)
    print(p, d[['km', 'c']].round(0).T.to_string())
# 2026 lunar GPS pentru comparație
Mg = []
for p in ['2026-07', '2026-08', '2026-09']:
    per_ = pd.Period(p)
    lpp = luna_prod(per_.start_time, min(per_.end_time.normalize(), pd.Timestamp('2026-09-27')))
    Mg.append((100 * lpp.L / lpp.km).rename(p))
Mg = pd.concat(Mg, axis=1)
print('\nGPS prod l/100 iul/aug/sep:'); print(Mg.reindex(CAZ).round(1).to_string())
# 2025 vs 2026 pe aceleași luni iun–sep (sezon egal), m2m
b25 = per(Mm, 2025, range(6, 10)); b26 = per(Mm, 2026, range(6, 10))
k2 = b25.join(b26, lsuffix='25', rsuffix='26'); k2['ch'] = (k2.L26 / k2.km26) / (k2.L25 / k2.km25) - 1
print('\niun–sep 2025 → 2026 pe m2m:', k2.reindex(['602BRAS', '863MXL', '603BRAS', '279BRAT']).ch.round(3).to_dict())
# toată flota: câte mașini > +20 % pe ian–aug m2m; câte rămân > +20 % pe iun–sep
jf = j[(j.km25 >= 10000) & (j.km26 >= 10000) & ~j.index.isin(CAM)]
print('flotă fără camioane ≥10.000 km ambele perioade:', len(jf), '| >+20 %:', list(jf[jf.ch > .2].index), '| mediana', round(100 * jf.ch.median(), 2), '%')
