"""5. Verificarea rezervorului virtual al lui Claude r1 (9.920 l la camioane) — sensibilitate la ipoteze."""
import sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r1-anomalii')
import pandas as pd, numpy as np
R1 = '/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r1-anomalii/'
D = '/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-151-translux-combustibil-analiza-c/docs/plans/2026-09-30-combustibil-norma/date/'
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 30)
Z = pd.read_pickle(R1 + 'Z.pkl')
Z = Z[(Z.zi >= '2026-06-10') & (Z.zi <= '2026-09-27') & (Z.grp == 'camion')].sort_values(['placa', 'zi'])
b = pd.read_csv(D + 'alimentari_benzol.csv'); f = pd.read_csv(D + 'foi_parcurs.csv')
b['zi'] = pd.to_datetime(b.alimentat_at, utc=True).dt.tz_convert('Europe/Chisinau').dt.date.astype(str)
recs = pd.concat([b[['placa', 'litri']], f[['placa', 'litri']]]); p95 = recs.groupby('placa').litri.quantile(.95)
maxrec_b = b.groupby('placa').litri.max()                     # cea mai mare alimentare benzol singulară, tot istoricul
dsum = pd.concat([b[['placa', 'zi', 'litri']], f[['placa', 'zi', 'litri']]]).groupby(['placa', 'zi']).litri.sum()
maxday = dsum.groupby('placa').max()
# ratio propriu pe fereastra GPS (pentru norma alternativă)
own = Z.groupby('placa').apply(lambda d: 100 * d.l.sum() / d.km.sum() if d.km.sum() > 0 else np.nan)


def run(T_rule, norm_rule, start, reset_gap, zone='all'):
    tot = 0; ev = []
    for p, d in Z.groupby('placa'):
        if d.km.sum() < 1000:
            continue
        T = {'r1': max(600, float(p95.get(p, 600)) * 1.1), 'maxrec': max(600, float(maxrec_b.get(p, 600))),
             'maxday': max(600, float(maxday.get(p, 600)))}[T_rule]
        nh = {'45': 45.0, 'own1.3': 1.3 * own.get(p, 45)}[norm_rule]
        lvl = T / 2 if start == 'half' else 0.0
        for _, x in d.iterrows():
            if reset_gap and x.src == 'none':
                lvl = 0.0               # zi fără rând GPS: nu știm km-ii → nivelul necunoscut, pornim de la gol (conservator)
                continue
            lvl = lvl + x.l - x.km * nh / 100
            if lvl > T + 0.5:
                ev.append(dict(placa=p, zi=x.zi, l=x.l, km=x.km, src=x.src, over=lvl - T, T=T, park=x.km < 5))
                tot += lvl - T; lvl = T
            lvl = max(0, lvl)
    return tot, pd.DataFrame(ev)


base, E = run('r1', '45', 'half', False)
print('reproducere r1 (T=max(600,1,1·P95), normă 45, start T/2, fără reset):', round(base), 'l, evenimente', len(E), ', camioane', E.placa.nunique())
print('  din care în zile fără rând GPS:', round(E[E.src == "none"].over.sum()), '| zile cu km<5:', round(E[E.park].over.sum()),
      '| zile în care litrii zilei > T:', round(E[E.l > E['T']].over.sum()))
nxt = []
for p, d in Z.groupby('placa'):
    d = d.reset_index(drop=True); gap = d.src.eq('none')
    for _, e in E[E.placa == p].iterrows():
        i = d.index[d.zi == e.zi][0]
        nxt.append(bool(gap.iloc[max(0, i - 7):i].any()))
E['gap7'] = nxt
print('  evenimente cu o zi fără GPS în cele 7 zile dinainte:', int(E.gap7.sum()), round(E[E.gap7].over.sum()), 'l')
print('T folosit vs cea mai mare alimentare benzol singulară (tot istoricul), camioane din simulare:')
tt = pd.DataFrame({'T_r1': [max(600, float(p95.get(p, 600)) * 1.1) for p in Z.placa.unique()],
                   'max_rec': [maxrec_b.get(p, np.nan) for p in Z.placa.unique()], 'max_zi': [maxday.get(p, np.nan) for p in Z.placa.unique()]}, index=Z.placa.unique())
print('  camioane cu o alimentare singulară > T_r1:', int((tt.max_rec > tt.T_r1 + 1).sum()), 'din', len(tt), '| median max_rec/T_r1', round((tt.max_rec / tt.T_r1).median(), 3))
print(tt[tt.max_rec > tt.T_r1 + 1].round(0).to_string())
res = []
for T_rule in ['r1', 'maxrec', 'maxday']:
    for norm_rule in ['45', 'own1.3']:
        for start in ['half', 'zero']:
            for rg in [False, True]:
                t, e = run(T_rule, norm_rule, start, rg)
                res.append(dict(T=T_rule, norma=norm_rule, start=start, reset_gol=rg, litri=round(t), ev=len(e), camioane=e.placa.nunique() if len(e) else 0))
print(pd.DataFrame(res).to_string())
t, e = run('maxrec', 'own1.3', 'zero', True)
print('\nvarianta cea mai conservatoare — evenimente rămase:'); print(e.sort_values('over', ascending=False).round(1).head(15).to_string())
