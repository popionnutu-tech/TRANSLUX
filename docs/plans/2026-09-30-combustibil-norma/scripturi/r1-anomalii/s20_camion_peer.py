from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl')
T=Z[(Z.grp=='camion')&(Z.zi>='2026-07-01')&(Z.zi<='2026-09-27')]
V=T.groupby('placa').agg(l=('l','sum'),km=('km','sum'),nogps=('src',lambda s:(s=='none').sum()),lb=('lb','sum'),lf=('lf','sum'))
nok=V[V.km<500]; print('trucks with fuel but <500 km Jul-Sep:'); print(nok.round(0)); print('litri',nok.l.sum().round(0),'per month',(nok.l.sum()/2.9).round(0))
W=V[V.km>=3000].copy(); W['c']=100*W.l/W.km
med=W.c.median(); p25=W.c.quantile(.25)
W['exc_med']=np.maximum(0,W.l-W.km*med/100); W['exc_p25']=np.maximum(0,W.l-W.km*p25/100)
print('trucks',len(W),'l',W.l.sum().round(0),'km',W.km.sum().round(0),'c fleet',round(100*W.l.sum()/W.km.sum(),1),'median',round(med,1),'p25',round(p25,1))
print('excess over median',W.exc_med.sum().round(0),'per month',(W.exc_med.sum()/2.9).round(0),' over p25',W.exc_p25.sum().round(0))
print(W.sort_values('c',ascending=False).round(1))
# monthly per truck c to see stability
T2=Z[(Z.grp=='camion')&(Z.zi>='2026-07-01')]
r=T2.groupby(['placa','luna']).agg(l=('l','sum'),km=('km','sum')); r['c']=np.where(r.km>=1000,100*r.l/r.km,np.nan)
print(r.c.unstack().round(1))
