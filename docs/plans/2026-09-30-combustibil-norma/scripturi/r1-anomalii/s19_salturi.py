from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
M=pd.read_pickle('M.pkl')
Q=M[(M.grp!='camion')&M.tip.notna()&(M.luna<='2026-09')].copy()
Q=Q[Q.km>=1000]
Q['c']=100*Q.l/Q.km
Q['med_tip']=Q.groupby(['tip','luna']).c.transform('median')
Q=Q.sort_values(['placa','luna'])
Q['own']=Q.groupby('placa').c.transform(lambda s:s.rolling(12,min_periods=4).median().shift(1))
Q['flag']=(Q.c>1.3*Q.med_tip)&(Q.c>1.3*Q.own)
Q['flag_prev']=Q.groupby('placa').flag.shift(1).fillna(False)
Q['flag_next']=Q.groupby('placa').flag.shift(-1).fillna(False)
Q['cons']=Q.flag&(Q.flag_prev|Q.flag_next)
Q['exc']=np.where(Q.flag,Q.l-Q.km*Q.med_tip/100,0)
print('vehicle-months km>=1000:',len(Q),' flagged (>1.3x tip & >1.3x own):',Q.flag.sum(),'excess l',Q.exc.sum().round(0))
print(' in >=2 consecutive months:',Q.cons.sum(),'excess',Q[Q.cons].exc.sum().round(0),'vehicles',Q[Q.cons].placa.nunique())
print(Q[Q.cons][['placa','luna','tip','dir','l','km','c','med_tip','own','exc']].round(1).to_string())
print('single-month flags top:'); print(Q[Q.flag&~Q.cons].sort_values('exc',ascending=False)[['placa','luna','tip','dir','l','km','c','med_tip','own','exc']].head(15).round(1))
# monthly liters vs km correlation per vehicle (last 12 months) -> 'liters written regardless of km'
R=Q[Q.luna>='2025-10'].groupby('placa').apply(lambda d:pd.Series({'n':len(d),'corr':d.l.corr(d.km),'cv_l':d.l.std()/d.l.mean(),'cv_km':d.km.std()/d.km.mean(),'lf_share':d.lf.sum()/d.l.sum()}),include_groups=False)
R=R[R.n>=8]; print('vehicles n>=8 months: corr(l,km) median',R['corr'].median().round(2)); print(R[R['corr']<0.3].sort_values('corr').round(2))
