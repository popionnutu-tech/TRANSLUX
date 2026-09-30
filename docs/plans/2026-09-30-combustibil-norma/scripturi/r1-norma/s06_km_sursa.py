"""Care sursă de km e mai puțin zgomotoasă: aceleași intervale plin-la-plin (definite doar din litri), km din surse diferite.
Litrii sunt identici; sursa cu dispersia cea mai mică a l/100 pe intervale e cea mai bună. + km lunari GPS vs m2m."""
import warnings; warnings.filterwarnings('ignore')
from core import *
v = veh().set_index('placa'); a = alim()
de, pana = '2026-06-10', '2026-09-27'
src = {s: kmzi(s, pd.Timestamp(de), pd.Timestamp(pana)) for s in ['prod', 'raw', 'gps', 'm2m']}
# intervalele: definite din litri (prag producție), km prod doar pentru filtru >=300
iv = plin_intervale(a, src['prod'], de, pana, minkm=300)
for s, k in src.items():
    kd = {p: g.set_index('zi').km for p, g in k.groupby('placa')}
    iv['km_' + s] = [kd[p][(kd[p].index >= z1) & (kd[p].index < z2)].sum() if p in kd else np.nan for p, z1, z2 in zip(iv.placa, iv.z1, iv.z2)]
iv = iv.join(v[['grup']], on='placa')
# doar intervalele unde toate sursele au km (>=300) -> aceeași mulțime
ok = iv[[f'km_{s}' for s in src]].min(axis=1) >= 300
J = iv[ok].copy()
print('intervale comune:', len(J), 'mașini:', J.placa.nunique())
res = []
for s in src:
    J['c_' + s] = 100 * J.l / J['km_' + s]
for (placa, grp), d in J.groupby(['placa', 'grup']):
    if len(d) < 5:
        continue
    r = {'placa': placa, 'grup': grp, 'n': len(d)}
    for s in src:
        c = d['c_' + s]
        # dispersia robustă: MAD relativ + CV ponderat
        r['mad_' + s] = 100 * (c - c.median()).abs().median() / c.median()
        r['ratio_' + s] = 100 * d.l.sum() / d['km_' + s].sum()
    res.append(r)
R = pd.DataFrame(res)
print('mașini cu >=5 intervale comune:', len(R))
print('MAD relativ median al l/100 pe interval (%) — mai mic = km mai curați')
print(R.groupby('grup')[[f'mad_{s}' for s in src]].median().round(2))
print('TOTAL', R[[f'mad_{s}' for s in src]].median().round(2).to_dict())
print('pe câte mașini fiecare sursă are MAD minim:', R[[f'mad_{s}' for s in src]].idxmin(axis=1).value_counts().to_dict())
print('raportul normei m2m / prod (median, pe grup):')
print((R.ratio_m2m / R.ratio_prod).groupby(R.grup).median().round(3))
print((R.ratio_raw / R.ratio_prod).groupby(R.grup).median().round(3))
# km lunari: GPS vs m2m pe mașină-lună
g = src['prod'].assign(l=lambda d: d.zi.dt.to_period('M')).groupby(['placa', 'l']).km.sum()
m = src['m2m'].assign(l=lambda d: d.zi.dt.to_period('M')).groupby(['placa', 'l']).km.sum()
x = pd.concat([g.rename('gps'), m.rename('m2m')], axis=1).dropna()
x = x[(x.gps > 500)]
x['r'] = x.m2m / x.gps - 1
x = x.join(v[['grup']], on='placa')
print('m2m/gps−1 pe mașină-lună (>500 km GPS): median, P10, P90, |>10%| cote')
print(x.groupby('grup').r.describe(percentiles=[.1, .5, .9]).round(3))
print('cote |m2m/gps-1|>10%:', round(100 * (x.r.abs() > .1).mean(), 1), '%  n=', len(x))
print(x.sort_values('r').head(8).round(3)); print(x.sort_values('r').tail(8).round(3))
# zile de parcare cu km cârpiți (fantomă) — cât ar fi fost fără reparația 444
gg = gps(); gg = gg[(gg.zi >= de) & (gg.zi <= pana)].join(v[['grup']], on='placa')
print('km fantomă scoși de regula 444 (km_total - km_prod) pe grup:')
print(gg.assign(f=gg.km_total - gg.km_prod).groupby('grup').agg(f=('f', 'sum'), zile=('parcare', 'sum'), km=('km_total', 'sum')).assign(pct=lambda d: 100 * d.f / d.km).round(1))
# zile cu km mici dar pozitivi care nu sunt prinse de regula 444 (km_patched=0, km_total 5-40, pe zi fără alimentare?)
sm = gg[(gg.km_patched == 0) & (gg.km_total < 40) & (gg.km_total > 0)]
print('zile GPS <40 km fără cârpeală:', len(sm), 'km', round(sm.km_total.sum()))
