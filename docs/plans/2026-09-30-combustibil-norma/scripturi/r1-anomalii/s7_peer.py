from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl'); M=pd.read_pickle('M.pkl')
# period Jul-Sep 2026 (GPS full), Sep until 27 (benzol ends 27.09)
P=Z[(Z.zi>='2026-07-01')&(Z.zi<='2026-09-27')]
V=P.groupby('placa').agg(l=('l','sum'),km=('km','sum'),grp=('grp','first'),tip=('tip','first'),dir=('directii','first'),nt=('norma_tip','first'),nm=('norma_masurata','first'),zile=('km',lambda s:(s>=20).sum())).reset_index()
V=V[(V.km>=3000)&(V.grp!='camion')&V.tip.notna()]
V['c']=100*V.l/V.km
V['peer_med']=V.groupby('tip').c.transform('median')
V['peer_n']=V.groupby('tip').c.transform('size')
V['ratio']=V.c/V.peer_med
V['exc_med']=np.maximum(0,V.l-V.km*V.peer_med/100)
V['exc_115']=np.maximum(0,V.l-V.km*V.peer_med*1.15/100)
print('vehicles',len(V),'total l',V.l.sum().round(0),'excess over peer median',V.exc_med.sum().round(0),' over 1.15*median',V.exc_115.sum().round(0))
print(V.groupby('tip').agg(n=('c','size'),med=('c','median'),p25=('c',lambda s:s.quantile(.25)),p75=('c',lambda s:s.quantile(.75)),nt=('nt','median'),nm=('nm','median')).round(1))
print(V.sort_values('exc_115',ascending=False)[['placa','tip','dir','km','l','c','peer_med','ratio','nt','nm','exc_115']].head(25).round(1))
print('ratio>1.3:',(V.ratio>1.3).sum(),' <0.75:',(V.ratio<0.75).sum())
print(V[V.ratio<0.75][['placa','tip','dir','km','l','c','peer_med','nt']].round(1))
V.to_csv('peer_jul_sep26.csv',index=False)
# per month excess series normalized: months = monthly l/100 per vehicle vs tip median same month (all months, km>=1500) — for 2025-2026 with m2m
Q=M[(M.km>=1500)&(M.grp!='camion')&M.tip.notna()&(M.luna<='2026-09')].copy()
Q['c']=100*Q.l/Q.km
Q['med']=Q.groupby(['tip','luna']).c.transform('median')
Q['r']=Q.c/Q.med
# fleet monthly median c by grp
print(Q.groupby(['luna']).r.median().round(3).to_dict())
fl=Q.groupby('luna').apply(lambda d:100*d.l.sum()/d.km.sum()).round(2); print('fleet non-truck l/100 by month', fl.to_dict())
Q.to_pickle('Q.pkl')
