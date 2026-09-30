"""Cât de uniform semnalează fiecare regulă de prag pe km-ii lunii (ideal: aceeași cotă peste tot, fiindcă zgomotul nu e vină)."""
import warnings; warnings.filterwarnings('ignore')
from load import *
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 20)
R = pd.read_csv('out_rolling_m2m.csv'); R = R[(R.W == 3) & (R.metoda == 'eb_tip_K5k')]
L = pd.read_csv('out_luni_m2m.csv'); R = R.merge(L[['luna', 'placa', 'km']], on=['luna', 'placa'])
a = alim(); R = R.join(a[a.zi >= '2025-01-01'].groupby('placa').litri.quantile(.9).rename('plin'), on='placa')
R['kmb'] = pd.cut(R.km, [0, 2000, 3500, 6000, 1e9], labels=['1-2k', '2-3.5k', '3.5-6k', '>6k'])
R['dl'] = (R.L - R.pred).abs()
rules = {'fix 10%': R.e.abs() > .10, 'fix 15%': R.e.abs() > .15,
         'max(10%,1.5 plin)': R.dl > np.maximum(.10 * R.pred, 1.5 * R.plin),
         'max(8%,2 plin)': R.dl > np.maximum(.08 * R.pred, 2.0 * R.plin),
         'max(10%,2 plin)': R.dl > np.maximum(.10 * R.pred, 2.0 * R.plin)}
out = pd.DataFrame({k: (100 * v.groupby(R.kmb).mean()).round(1) for k, v in rules.items()})
out.loc['TOTAL'] = [round(100 * v.mean(), 1) for v in rules.values()]
out['n'] = R.groupby('kmb').size().tolist() + [len(R)]
print('cota mașină-lunilor semnalate (%), backtest lung W=3 eb_tip_K5k, km m2m:'); print(out)
print(R.groupby('grup').apply(lambda d: pd.Series({k: round(100 * v[d.index].mean(), 1) for k, v in rules.items()})))
