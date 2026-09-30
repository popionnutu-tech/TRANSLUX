"""Plinire dublă fără drum — doar intervale în care FIECARE zi are km (GPS sau m2m) și intervalul ține <=7 zile."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim(); k = kmzi('prod')
pt = a[a.zi >= '2025-01-01'].groupby('placa').litri.quantile(.9)
iv = plin_intervale(a, k, '2025-01-01', '2026-09-27', minkm=0).join(v[['grup']], on='placa')
kset = set(zip(k.placa, k.zi))
iv['zile'] = (iv.z2 - iv.z1).dt.days
iv['acop'] = [all((p, z1 + pd.Timedelta(days=i)) in kset for i in range((z2 - z1).days)) for p, z1, z2 in zip(iv.placa, iv.z1, iv.z2)]
iv['plin'] = iv.placa.map(pt); nt = iv.placa.map(v.norma_tip.fillna(15))
iv['exces'] = iv.l - iv.km * nt / 100
sus = iv[iv.acop & (iv.zile <= 7) & (iv.l >= 0.5 * iv.plin) & (iv.km < 0.15 * iv.plin / (nt / 100))]
print('intervale cu acoperire km completă, <=7 zile, >=50% plin, <15% autonomie:', len(sus), 'litri', round(sus.l.sum()), 'exces', round(sus.exces.sum()))
sus = sus.assign(an=sus.z1.dt.year)
print(sus.groupby(['grup', 'an']).agg(n=('l', 'size'), exces=('exces', 'sum')).round(0))
print(sus.groupby('placa').agg(n=('l', 'size'), exces=('exces', 'sum')).sort_values('exces', ascending=False).head(8).round(0))
for _, r in sus.sort_values('exces', ascending=False).head(10).iterrows():
    f = a[(a.placa == r.placa) & (a.zi >= r.z1) & (a.zi <= r.z2)]
    print(r.placa, r.grup, r.z1.date(), '→', r.z2.date(), 'km', round(r.km, 1), '|', '; '.join(f'{x.zi.date()} {x.litri:.0f}L {x.src} {"" if pd.isna(x.ts) else pd.Timestamp(x.ts).strftime("%H:%M")}' for x in f.itertuples()))
sus.to_csv('out_anom_plin_dublu.csv', index=False)
