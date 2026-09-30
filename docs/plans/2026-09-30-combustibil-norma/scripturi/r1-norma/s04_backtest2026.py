"""Backtest 2026: calibrare pe C, predicție pe T. Țintă 1 = litrii lunii (regula producției), țintă 2 = plin la plin în T."""
import sys, warnings
warnings.filterwarnings('ignore')
from core import *

SRC = sys.argv[1] if len(sys.argv) > 1 else 'prod'
SPLIT = sys.argv[2] if len(sys.argv) > 2 else 'sep'
if SPLIT == 'sep':
    C0, C1, T0, T1 = '2026-06-10', '2026-08-31', '2026-09-01', '2026-09-27'
else:  # două luni
    C0, C1, T0, T1 = '2026-06-10', '2026-07-31', '2026-08-01', '2026-09-27'
v = veh().set_index('placa'); a = alim(); k = kmzi(SRC)
old = v.norma_masurata_incarcat.combine_first(v.norma_masurata).combine_first(v.norma_tip)

def praguri(a, de, pana, frac=0.85, q=0.9):
    x = cut(a, de, pana)
    return (frac * x.groupby('placa').litri.quantile(q)).to_dict()

N = {}
N['veche'] = old
N['raport_C'] = raport(a, k, C0, C1).norma
N['raport_lunar_C'] = raport_lunar(a, k, C0, C1).norma
# plin la plin: producția și variante
def pl(**kw):
    minint = kw.pop('minint', 3); stat = kw.pop('stat', 'ratio')
    return plin_norma(plin_intervale(a, k, C0, C1, **kw), minint=minint, stat=stat).norma
N['plin_prod'] = pl()
N['plin_f70'] = pl(frac=0.70)
N['plin_f80'] = pl(frac=0.80)
N['plin_f90'] = pl(frac=0.90)
N['plin_f95'] = pl(frac=0.95)
N['plin_max85'] = pl(q=1.0)
N['plin_P75_100'] = pl(q=0.75, frac=1.0)
N['plin_zi'] = pl(prag='zi')
N['plin_ora'] = pl(ora=True)
N['plin_km0'] = pl(minkm=1)
N['plin_km800'] = pl(minkm=800)
N['plin_min1'] = pl(minint=1)
N['plin_median'] = pl(stat='median')
N['plin_wmedian'] = pl(stat='wmedian')
N['plin_trim10'] = pl(stat='trim')
rg = regresie(a, k, C0, C1)
N['regr_origine'] = rg.norma_origine
N['regr_panta'] = rg.norma_panta
# EB: raportul mașinii tras spre raportul tipului
rc = raport(a, k, C0, C1)
rc = rc[rc.km > 0].join(v[['tip_nume', 'grup']])
rc['tipk'] = rc.tip_nume.fillna(rc.grup)
tip = rc.groupby('tipk').apply(lambda d: 100 * d.l.sum() / d.km.sum())
for K in [2000, 5000, 10000, 30000]:
    rt = rc.tipk.map(tip)
    N[f'eb_tip_K{K//1000}k'] = (rc.km * rc.norma + K * rt) / (rc.km + K)
N['tip_pur'] = rc.tipk.map(tip)
# hibrid: plin (≥3) altfel raport_C altfel veche
N['hibrid_plin_raport'] = N['plin_prod'].combine_first(N['raport_C']).combine_first(old)
N['prod_fallback'] = N['plin_prod'].combine_first(old)
# plin cu EB spre tip
ivp = plin_intervale(a, k, C0, C1)
pk = plin_norma(ivp, minint=1).join(v[['tip_nume', 'grup']])
pk['tipk'] = pk.tip_nume.fillna(pk.grup)
ptip = pk.groupby('tipk').apply(lambda d: 100 * d.l.sum() / d.km.sum())
for K in [3000, 10000]:
    pt = pk.tipk.map(ptip)
    N[f'plin_eb_K{K//1000}k'] = ((pk.km * pk.norma + K * pt) / (pk.km + K)).combine_first(N['eb_tip_K5k'])

# ---------- ținte ----------
T = luna_prod(a, k, T0, T1)
T = T[(T.km >= 1000) & (T.L > 0)].join(v[['grup']])
# ținta 2: plin la plin în T, pragul din C
ivT = plin_intervale(a, k, T0, T1, ref=praguri(a, C0, C1))
ivT = ivT.groupby('placa')[['l', 'km']].sum()
ivT = ivT[ivT.km >= 1000].join(v[['grup']])

def scor(norm, tinta, lcol, kmcol):
    x = tinta.join(norm.rename('n'), how='left').dropna(subset=['n'])
    x = x[x.n > 0]
    pred = x.n * x[kmcol] / 100
    x['e'] = x[lcol] / pred - 1
    x['pred'] = pred
    return x

rows = []
for nm, norm in N.items():
    for tn, tinta, lc in [('luna', T, 'L'), ('plin', ivT, 'l')]:
        x = scor(norm, tinta, lc, 'km')
        for gname, d in list(x.groupby('grup')) + [('TOTAL', x)]:
            rows.append(dict(metoda=nm, tinta=tn, grup=gname, n=len(d), acop=len(d) / max(1, (tinta.grup == gname).sum() if gname != 'TOTAL' else len(tinta)),
                             med_abs=100 * d.e.abs().median(), mape=100 * d.e.abs().mean(), bias_med=100 * d.e.median(),
                             p80=100 * d.e.abs().quantile(.8), sub10=100 * (d.e.abs() < .10).mean(),
                             bias_tot=100 * (d[lc].sum() / d.pred.sum() - 1)))
R = pd.DataFrame(rows)
R.to_csv(f'out_bt2026_{SRC}_{SPLIT}.csv', index=False)
pd.set_option('display.width', 250); pd.set_option('display.max_rows', 500)
for tn in ['luna', 'plin']:
    print(f'===== ținta {tn}  src={SRC} split={SPLIT}  (n țintă luna={len(T)}, plin={len(ivT)})')
    t = R[R.tinta == tn].pivot_table(index='metoda', columns='grup', values='med_abs').round(1)
    t['n_TOT'] = R[(R.tinta == tn) & (R.grup == 'TOTAL')].set_index('metoda').n
    t['mape_TOT'] = R[(R.tinta == tn) & (R.grup == 'TOTAL')].set_index('metoda').mape.round(1)
    t['bias_TOT'] = R[(R.tinta == tn) & (R.grup == 'TOTAL')].set_index('metoda').bias_tot.round(1)
    t['sub10'] = R[(R.tinta == tn) & (R.grup == 'TOTAL')].set_index('metoda').sub10.round(0)
    print(t.sort_values('TOTAL').to_string())

# ---------- comparație corectă: fiecare metodă completată cu norma veche (aceeași acoperire) ----------
print('\n##### COMPLETAT cu veche (toate mașinile țintei) — med_abs pe grup, p80/p90 total')
rows = []
for nm, norm in N.items():
    nf = norm.combine_first(old)
    for tn, tinta, lc in [('luna', T, 'L'), ('plin', ivT, 'l')]:
        x = scor(nf, tinta, lc, 'km')
        for gname, d in list(x.groupby('grup')) + [('TOTAL', x)]:
            rows.append(dict(metoda=nm, tinta=tn, grup=gname, n=len(d), med_abs=100 * d.e.abs().median(),
                             p80=100 * d.e.abs().quantile(.8), p90=100 * d.e.abs().quantile(.9), bias_med=100 * d.e.median(),
                             bias_tot=100 * (d[lc].sum() / d.pred.sum() - 1)))
R2 = pd.DataFrame(rows); R2.to_csv(f'out_bt2026_{SRC}_{SPLIT}_complet.csv', index=False)
for tn in ['luna', 'plin']:
    t = R2[R2.tinta == tn].pivot_table(index='metoda', columns='grup', values='med_abs').round(1)
    tt = R2[(R2.tinta == tn) & (R2.grup == 'TOTAL')].set_index('metoda')
    t['p80_TOT'] = tt.p80.round(1); t['p90_TOT'] = tt.p90.round(1); t['bias_med'] = tt.bias_med.round(1); t['bias_tot'] = tt.bias_tot.round(1)
    ng = R2[(R2.tinta == tn) & (R2.metoda == 'veche')].set_index('grup').n
    print(f'--- ținta {tn}; n pe grup:', ng.to_dict())
    print(t.sort_values('TOTAL').to_string())
