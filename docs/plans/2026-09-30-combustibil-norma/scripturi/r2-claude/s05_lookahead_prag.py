"""4. Lookahead-ul posterului (norma plin 10.06→sfârșitul lunii judecate) și 9. pragul de abatere."""
from r2core import *
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 30)
print('##### 4. Lookahead: posterul lunii = plin SQL 10.06→pana (luna inclusă) vs norma fixată la sfârșitul lunii anterioare')
for luna, (T0, T1, Cfix) in {'2026-08': ('2026-08-01', '2026-08-31', '2026-07-31'), '2026-09': ('2026-09-01', '2026-09-30', '2026-08-31')}.items():
    lp = luna_prod(T0, T1)
    lp = lp[(lp.km >= 1000) & (lp.L > 0)]
    fapt = 100 * lp.L / lp.km
    n_post = norma_iv(intervale('2026-06-10', T1, 'fill')).norma
    n_fix = norma_iv(intervale('2026-06-10', Cfix, 'fill')).norma
    x = pd.DataFrame({'fapt': fapt, 'post': n_post.reindex(fapt.index).combine_first(OLD.reindex(fapt.index)),
                      'fix': n_fix.reindex(fapt.index).combine_first(OLD.reindex(fapt.index)),
                      'post_proprie': n_post.reindex(fapt.index).notna(), 'fix_proprie': n_fix.reindex(fapt.index).notna()}).dropna(subset=['fapt'])
    x['cam'] = x.index.isin(CAM)
    x['d_post'] = x.fapt / x.post - 1; x['d_fix'] = x.fapt / x.fix - 1
    x['sh'] = x.post / x.fix - 1
    print(f'--- {luna}: {len(x)} mașini ≥1.000 km; normă proprie poster {int(x.post_proprie.sum())}, fixă {int(x.fix_proprie.sum())}')
    for g, d in [('fara_cam', x[~x.cam]), ('camioane', x[x.cam])]:
        print(f'  {g} n={len(d)}: |abatere| mediană poster {100*d.d_post.abs().median():.2f} % vs fixă {100*d.d_fix.abs().median():.2f} %; '
              f'>+15 %: {int((d.d_post>.15).sum())} vs {int((d.d_fix>.15).sum())}; >+20 %: {int((d.d_post>.2).sum())} vs {int((d.d_fix>.2).sum())}; '
              f'<−15 %: {int((d.d_post<-.15).sum())} vs {int((d.d_fix<-.15).sum())}; norma se mută |Δ| median {100*d.sh.abs().median():.2f} %, P90 {100*d.sh.abs().quantile(.9):.2f} %')
        # corelația: cât din abaterea fixă «înghite» norma poster
        dd = d[(d.post_proprie) & (d.fix_proprie)]
        if len(dd) > 5:
            b = np.polyfit(dd.d_fix, dd.sh, 1)[0]
            print(f'     panta shift ~ abatere_fixă: {b:.3f} (fracția din abatere absorbită de normă), n={len(dd)}')
    big = x[(x.d_fix.abs() > .15)].sort_values('d_fix')
    print('  exemple |abatere fixă|>15 %:'); print(big[['fapt', 'fix', 'post', 'd_fix', 'd_post']].round(3).head(12).to_string())

print('\n##### 9. Pragul: cota semnalată pe eșantionul protocolului (fără vină cunoscută) + ce prinde pe cazurile cunoscute')
TESTS = {'T1_sep': ('2026-06-10', '2026-08-31', '2026-09-01', '2026-09-27'),
         'T2_aug': ('2026-06-10', '2026-07-31', '2026-08-01', '2026-08-31')}
REF = 'plin zi ≥3.000 km (Codex r1)'
rows = []
for tn, (C0, C1, T0, T1) in TESTS.items():
    s = esantion(C0, C1, T0, T1)
    N = metode(C0, C1)
    x = scor(N[REF], s)
    plin = cut(A, C0, C1).groupby('placa').litri.quantile(.9)
    x['plin'] = plin.reindex(x.index)
    x['test'] = tn
    rows.append(x)
X = pd.concat(rows)
X['dev'] = X.L / X.pred - 1; X['dl'] = X.L - X.pred
X['kmb'] = pd.cut(X.km, [0, 2000, 3500, 6000, 1e9], labels=['1-2k', '2-3.5k', '3.5-6k', '>6k'])
rules = {'|dev|>10 %': X.dev.abs() > .10, '|dev|>15 %': X.dev.abs() > .15, '|dev|>20 %': X.dev.abs() > .20,
         'dev>+15 %': X.dev > .15, 'dev>+20 %': X.dev > .20,
         '|ΔL|>max(10 %,2 plin)': X.dl.abs() > np.maximum(.10 * X.pred, 2 * X.plin),
         'ΔL>max(15 %,2 plin)': X.dl > np.maximum(.15 * X.pred, 2 * X.plin),
         'ΔL>max(15 %,1 plin)': X.dl > np.maximum(.15 * X.pred, 1 * X.plin),
         'ΔL>max(20 %,2 plin)': X.dl > np.maximum(.20 * X.pred, 2 * X.plin)}
for g, m in [('fara_cam', ~X.cam), ('camioane', X.cam)]:
    out = pd.DataFrame({k: (100 * v[m].groupby(X.kmb[m]).mean()).round(1) for k, v in rules.items()})
    out.loc['TOTAL'] = [round(100 * v[m].mean(), 1) for v in rules.values()]
    out['n'] = X[m].groupby('kmb').size().tolist() + [int(m.sum())]
    print(f'--- {g}: cota vehicul-lunilor semnalate (%), sep+aug'); print(out.T.to_string())
print('P5/P95 dev fără camioane:', X[~X.cam].dev.quantile([.05, .95]).round(4).to_dict(), '| camioane:', X[X.cam].dev.quantile([.05, .95]).round(4).to_dict())
print('plin tipic median (l) fără camioane:', round(X[~X.cam].plin.median(), 1), '; ca % din litrii lunii prezise:', round(100 * (X[~X.cam].plin / X[~X.cam].pred).median(), 1))
# cazurile cunoscute pe luna lor, toată flota ≥1.000 km (fără filtrul de eșantion), norma fixată înainte
CAZ = ['603BRAS', '279BRAT', '034BRAT', '783MUM', 'HMK135', 'LJN080', '710CWN', 'RWN193', '602BRAS', '863MXL']
for tn, (C0, C1, T0, T1) in TESTS.items():
    lp = luna_prod(T0, T1); lp = lp[lp.km >= 1000]
    N = metode(C0, C1); n = N[REF].reindex(lp.index).combine_first(OLD.reindex(lp.index))
    plin = cut(A, C0, C1).groupby('placa').litri.quantile(.9).reindex(lp.index)
    pred = n * lp.km / 100; dl = lp.L - pred; dev = lp.L / pred - 1
    t = pd.DataFrame({'km': lp.km.round(0), 'L': lp.L.round(0), 'norma': n.round(2), 'dev%': (100 * dev).round(1), 'ΔL': dl.round(0), 'plin': plin.round(0),
                      '>15%': dev > .15, '>max(15%,2plin)': dl > np.maximum(.15 * pred, 2 * plin)})
    print(f'--- cazuri cunoscute, {tn}'); print(t.reindex([c for c in CAZ if c in t.index]).to_string())
