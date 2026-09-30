"""R3.6 — verificarea a două clase Codex înainte de lista finală: foi fără niciun rând km (fără camioane) și foi pz_camcer peste
cea mai mare alimentare benzol a mașinii; plus litri/30 zile pentru toate clasele."""
import sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r1-norma')
from load import *
V = veh().set_index('placa'); CAM = set(V.index[V.grup == 'camioane'])
f = foi(); b = benzol()
g = pd.read_csv(D + 'km_gps_zi.csv'); g['zi'] = pd.to_datetime(g.date)
m = pd.read_csv(D + 'km_lde_m2m.csv'); m['zi'] = pd.to_datetime(m.zi)
W0, W1 = pd.Timestamp('2026-06-10'), pd.Timestamp('2026-09-27')
ff = f[(f.zi >= W0) & (f.zi <= W1)]
gk = set(zip(g.placa, g.zi)); mk = set(zip(m.placa, m.zi))
ff = ff.assign(fara=[(p, z) not in gk and (p, z) not in mk for p, z in zip(ff.placa, ff.zi)])
x = ff[ff.fara & ~ff.placa.isin(CAM)]
zile = (W1 - W0).days + 1
print(f'foi fără rând GPS și fără rând m2m, fără camioane, {W0.date()}–{W1.date()} ({zile} zile): {len(x)} rânduri, {x.placa.nunique()} vehicule, {x.litri.sum():.2f} l = {x.litri.sum()/zile*30:.0f} l/30 zile')
print(x.groupby('placa').litri.agg(['count', 'sum']).sort_values('sum', ascending=False).round(1).to_string())
# vehicule cu tracker (au GPS în fereastră) — foaia în zi fără rând e ciudată doar dacă mașina are GPS în rest
hasg = set(g[(g.zi >= W0)].placa)
print('  din care la vehicule care au GPS în rest:', round(x[x.placa.isin(hasg)].litri.sum(), 1), 'l')
xc = ff[ff.fara & ff.placa.isin(CAM)]
print(f'  camioane: {len(xc)} rânduri, {xc.litri.sum():.1f} l')
# foi pz_camcer peste max benzol singular (tot istoricul) al mașinii
mx = b.groupby('placa').litri.max()
c = ff[ff.foaie == 'pz_camcer'].copy(); c['maxb'] = c.placa.map(mx)
big = c[c.litri > c.maxb]
print(f'\nfoi pz_camcer {W0.date()}–{W1.date()} peste cea mai mare alimentare benzol a mașinii: {len(big)} rânduri, {big.placa.nunique()} camioane, {big.litri.sum():.1f} l (= {big.litri.sum()/zile*30:.0f} l/30 zile); excesul peste max benzol {(big.litri-big.maxb).sum():.1f} l')
print(big.sort_values('litri', ascending=False)[['placa', 'zi', 'litri', 'maxb']].head(12).to_string())
nob = c[c.maxb.isna()]
print(f'  foi pz_camcer la camioane fără nicio alimentare benzol: {len(nob)} rânduri, {nob.litri.sum():.1f} l')
# litri fără km 01.07–27.09
Z0 = pd.Timestamp('2026-07-01'); zz = (W1 - Z0).days + 1
lit = pd.concat([b[(b.zi >= Z0) & (b.zi <= W1)][['placa', 'litri']], f[(f.zi >= Z0) & (f.zi <= W1)][['placa', 'litri']]]).groupby('placa').litri.sum()
kg = g[(g.zi >= Z0) & (g.zi <= W1)].groupby('placa').km_total.sum(); km_ = m[(m.zi >= Z0) & (m.zi <= W1)].groupby('placa').km.sum()
km = kg.add(km_, fill_value=0).reindex(lit.index).fillna(0)
nk = lit[km == 0]
print(f'\nlitri fără niciun km 01.07–27.09 ({zz} zile): {len(nk)} vehicule, {nk.sum():.2f} l = {nk.sum()/zz*30:.0f} l/30 zile; >200 l: {nk[nk>200].sum():.2f} = {nk[nk>200].sum()/zz*30:.0f} l/30 zile')
print(nk.sort_values(ascending=False).round(1).to_dict())
for nm, L, dd in [('supraconsum 4 sigure', 2891, 89), ('034BRAT+783MUM', 1629, 89), ('10 peste mediana tipului', 5660.01, 89), ('RWN193+HMK135', 1523, 89),
                  ('rezervor robust 3 ev.', 336, 110), ('rezervor start gol', 4366.46, 110), ('602BRAS+710CWN', 490, 89)]:
    print(f'{nm:28s} {L:9.1f} l / {dd} zile = {L/dd*30:6.0f} l/30 zile = {L/dd*30*22:8.0f} lei/lună la 22 lei/l')
