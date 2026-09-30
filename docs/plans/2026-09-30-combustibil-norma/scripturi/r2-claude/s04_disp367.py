"""Dezacordurile 3 (P90 înregistrări vs zi; înregistrări cumulate), 6 (mașini fără km), 7 (identitatea km GPS; m2m vs GPS)."""
from r2core import *
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 30)
C0, C1 = '2026-06-10', '2026-08-31'
print('##### 3. P90 pe înregistrări vs pe totalul zilei (calibrare 10.06–31.08)')
a = cut(A, C0, C1)
diff = []
for p, g in a.groupby('placa'):
    gl = g.groupby('zi').litri.sum()
    t_r = 0.85 * np.percentile(g.litri, 90); t_z = 0.85 * np.percentile(gl, 90)
    pr = set(g[g.litri >= t_r].zi.unique()); pz = set(gl[gl >= t_z].index)
    diff.append(dict(placa=p, rec=len(g), zile=len(gl), multi=(g.groupby('zi').size() > 1).sum(), p90r=t_r / .85, p90z=t_z / .85,
                     n_r=len(pr), n_z=len(pz), doar_r=len(pr - pz), doar_z=len(pz - pr)))
Dd = pd.DataFrame(diff).set_index('placa').join(V[['grup']])
print('vehicule:', len(Dd), '| cu seturi de plin diferite:', int(((Dd.doar_r + Dd.doar_z) > 0).sum()),
      '| zile de plin doar-înregistrare:', int(Dd.doar_r.sum()), 'doar-zi:', int(Dd.doar_z.sum()), '| din', int(Dd.n_r.sum()), 'zile plin SQL')
print('P90 zi / P90 înregistrare, median pe grup:', (Dd.p90z / Dd.p90r).groupby(Dd.grup).median().round(3).to_dict())
print('cota zilelor cu >1 alimentare, pe grup:', (Dd.multi.groupby(Dd.grup).sum() / Dd.zile.groupby(Dd.grup).sum()).round(3).to_dict())
ns = norma_iv(intervale(C0, C1, 'fill')).norma; nz = norma_iv(intervale(C0, C1, 'zi')).norma
j = pd.concat([ns.rename('sql'), nz.rename('zi')], axis=1).dropna()
r = j.zi / j.sql - 1
print('norma zi / norma SQL − 1: n', len(j), 'median', round(100 * r.median(), 2), '%, |Δ|>3 %:', int((r.abs() > .03).sum()), ', |Δ|>10 %:', int((r.abs() > .1).sum()))
print(r.sort_values().round(3).head(5).to_dict(), r.sort_values().round(3).tail(5).to_dict())
# înregistrări cumulate > 100 l pe tipuri mici (Sprinter/Crafter/Ford/MJW), pe ani
b = benzol().join(V[['tip', 'grup']], on='placa')
mic = b.tip.fillna('').str.startswith(('SPRINTER', 'CRAFTER', 'FORD')) | b.tip.fillna('').str.contains('MJW')
big = b[mic & (b.litri > 100)]
print('benzol >100 l pe tipuri mici, pe lună:', big.groupby(big.zi.dt.to_period('M')).litri.agg(['size', 'sum']).round(0).to_dict('index'))
print('în fereastra 10.06–27.09.2026:', len(big[big.zi >= '2026-06-10']))
fm = foi().join(V[['tip']], on='placa')
fmic = fm[fm.tip.fillna('').str.startswith(('SPRINTER', 'CRAFTER', 'FORD')) & (fm.litri > 100) & (fm.zi >= '2026-06-10')]
print('foi >100 l pe tipuri mici din 10.06.2026:', len(fmic), round(fmic.litri.sum(), 1), fmic.sort_values('litri').tail(6)[['placa', 'zi', 'litri', 'foaie']].to_dict('records'))
# zile >100 l (suma zilei) pe tipuri mici din 10.06
az = A[A.zi >= '2026-06-10'].groupby(['placa', 'zi']).litri.sum().reset_index().join(V[['tip']], on='placa')
azm = az[az.tip.fillna('').str.startswith(('SPRINTER', 'CRAFTER', 'FORD')) & (az.litri > 100)]
print('zile (sumă) >100 l pe tipuri mici din 10.06.2026:', len(azm), 'vehicule', azm.placa.nunique(), azm.groupby('placa').size().sort_values().tail(6).to_dict())

print('\n##### 6. Mașini cu litri și fără km în T = 01.07–27.09.2026')
T0, T1 = '2026-07-01', '2026-09-27'
L = cut(A, T0, T1).groupby('placa').litri.agg(['sum', 'size'])
g = gps(); g = g[(g.zi >= T0) & (g.zi <= T1)]
graw = pd.read_csv(D + 'km_gps_zi.csv'); graw['zi'] = pd.to_datetime(graw.date); graw = graw[(graw.zi >= T0) & (graw.zi <= T1)]
m = m2m(); m = m[(m.zi >= T0) & (m.zi <= T1)]
kk = pd.DataFrame({'L': L['sum'], 'n_alim': L['size'], 'gps_rows': graw.groupby('placa').size(), 'gps_km': graw.groupby('placa').km_total.sum(),
                   'm2m_rows': m.groupby('placa').size(), 'm2m_km': m.groupby('placa').km.sum()}).fillna(0)
kk = kk.join(V[['grup', 'tip', 'directii', 'active', 'categorie']])
fara = kk[(kk.L > 0) & (kk.gps_km + kk.m2m_km == 0)]
print(fara.sort_values('L', ascending=False).round(1).to_string())
print('total litri', round(fara.L.sum(), 2))
# cu km foarte puțini (<100) dar litri mari
print('cu km < 100 dar > 0 și litri > 200:')
print(kk[(kk.L > 200) & (kk.gps_km + kk.m2m_km > 0) & (kk.gps_km.clip(lower=kk.m2m_km) < 100)].round(1).to_string())
# pe care alimentări: foaie sau benzol
AA = cut(A, T0, T1)
print(AA[AA.placa.isin(fara.index)].groupby(['placa', 'src']).litri.sum().round(1).unstack().to_string())
print('ultima zi cu km (orice sursă, tot istoricul):')
gall = pd.read_csv(D + 'km_gps_zi.csv'); mall = m2m()
for p in fara.index:
    lg = gall[(gall.placa == p) & (gall.km_total > 0)].date.max(); lm = mall[(mall.placa == p) & (mall.km > 0)].zi.max()
    print(' ', p, 'GPS ultima', lg, '| m2m ultima', lm)

print('\n##### 7. Identitatea km_total = km_check + km_patched')
G = pd.read_csv(D + 'km_gps_zi.csv'); G['km_patched'] = G.km_patched.fillna(0)
G = G[G.km_total > 0]
d = G.km_total - G.km_check - G.km_patched
print('rânduri km_total>0:', len(G), '| |Δ|>0,2 km:', round(100 * (d.abs() > .2).mean(), 2), '% | km_check lipsă:', int(G.km_check.isna().sum()))
print('Δ = total − check − patched: quantile', d.quantile([.05, .25, .5, .75, .95]).round(2).to_dict())
d2 = G.km_total - G.km_check
print('total − check: |Δ|≤0,2:', round(100 * (d2.abs() <= .2).mean(), 1), '%; quantile', d2.quantile([.05, .25, .5, .75, .95]).round(2).to_dict())
rel = (G.km_total / G.km_check - 1)
print('total/check−1 (check>20): quantile', rel[G.km_check > 20].quantile([.05, .25, .5, .75, .95]).round(4).to_dict())
print('Σ total / Σ check:', round(G.km_total.sum() / G.km_check.sum(), 4), '| Σ(check+patched)/Σtotal', round((G.km_check + G.km_patched).sum() / G.km_total.sum(), 4))
print('pe rânduri fără cârpeală (patched=0): |total−check|>0,2:', round(100 * (d2[G.km_patched == 0].abs() > .2).mean(), 1), '%, Σtotal/Σcheck', round(G[G.km_patched == 0].km_total.sum() / G[G.km_patched == 0].km_check.sum(), 4))
print('pe rânduri cu cârpeală: Σtotal/Σcheck', round(G[G.km_patched > 0].km_total.sum() / G[G.km_patched > 0].km_check.sum(), 4), ' Σtotal/Σ(check+patched)', round(G[G.km_patched > 0].km_total.sum() / (G[G.km_patched > 0].km_check + G[G.km_patched > 0].km_patched).sum(), 4))
print('data_source:', G.data_source.value_counts().to_dict())
print(G.assign(r=d2.abs() > .2).groupby('data_source').r.mean().round(3).to_dict())
# ce sursă de km dă intervale mai strânse: km_total vs km_check (aceleași intervale)
iv = intervale('2026-06-10', '2026-09-27', 'zi')
G['zi'] = pd.to_datetime(G.date)
for col in ['km_total', 'km_check']:
    kd = {p: gg.set_index('zi')[col] for p, gg in G.groupby('placa')}
    iv['k_' + col] = [kd[p][(kd[p].index >= z1) & (kd[p].index < z2)].sum() if p in kd else np.nan for p, z1, z2 in zip(iv.placa, iv.z1, iv.z2)]
iv = iv[(iv.k_km_total >= 300) & (iv.k_km_check >= 300)].join(V[['grup']], on='placa')
res = []
for (p, gr), dd in iv.groupby(['placa', 'grup']):
    if len(dd) < 5: continue
    r_ = {'grup': gr}
    for col in ['km_total', 'km_check']:
        c = 100 * dd.l / dd['k_' + col]; r_[col] = 100 * (c - c.median()).abs().median() / c.median()
    r_['ratio'] = dd.k_km_check.sum() / dd.k_km_total.sum()
    res.append(r_)
R = pd.DataFrame(res)
print('MAD relativ median l/100 pe intervale (≥5 intervale), km_total vs km_check:'); print(R.groupby('grup')[['km_total', 'km_check']].median().round(2).to_string())
print('TOTAL', R[['km_total', 'km_check']].median().round(2).to_dict(), 'n=', len(R), '| Σcheck/Σtotal median', round(R.ratio.median(), 4))
# m2m vs GPS pe zilele comune iul–sep, ambele ≥20 km
gg = gps()[['placa', 'zi', 'km_total', 'km_prod']]; mm = m2m()
j = gg.merge(mm, on=['placa', 'zi'])
j = j[(j.zi >= '2026-07-01') & (j.zi <= '2026-09-30') & (j.km_total >= 20) & (j.km >= 20)].join(V[['grup']], on='placa')
print('m2m vs GPS, zile comune iul–sep ≥20 km: n', len(j), '| la ±10 %:', round(100 * ((j.km / j.km_total - 1).abs() <= .1).mean(), 2), '% | Σm2m/ΣGPS', round(j.km.sum() / j.km_total.sum(), 4))
print(j.groupby('grup').apply(lambda x: round(x.km.sum() / x.km_total.sum(), 4)).to_dict())
