from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl'); b=pd.read_pickle('b.pkl')
P=Z[(Z.zi>='2026-06-10')&(Z.zi<='2026-09-27')&(Z.grp!='camion')]
hasgps=set(P[P.src=='gps'].placa)
P=P[P.placa.isin(hasgps)]
x=P[(P.lf>0)&((P.src=='none')|((P.km<20)&(P.km_m2m.fillna(0)<20)))]
print('non-truck foaie on day with no km (no GPS row & no m2m, or both <20km), since 10.06:',len(x),'litri',x.lf.sum().round(0))
print(x.groupby('placa').agg(n=('lf','size'),l=('lf','sum'),foaie=('foaie','first'),dir=('directii','first'),sof=('sofer_f',lambda s:','.join(sorted(set(map(str,s)))))).sort_values('l',ascending=False).head(20).round(0))
print(x.groupby('foaie').lf.agg(['size','sum']).round(0))
# is next day with km? i.e. foaie dated a day off?
y=P[(P.lb>0)&((P.src=='none')|((P.km<20)&(P.km_m2m.fillna(0)<20)))]
print('benzol on such days:',len(y),y.lb.sum().round(0))
# whole period with m2m (2025-): foaie on days without m2m km for vehicles that have m2m
Q=Z[(Z.grp!='camion')&(Z.zi<'2026-06-10')]
hm=set(Q[Q.src=='m2m'].placa)
q=Q[Q.placa.isin(hm)&(Q.lf>0)&(Q.km<20)]
print('pre-10.06 foaie on day with m2m<20 km:',len(q),q.lf.sum().round(0),' benzol same cond',len(Q[Q.placa.isin(hm)&(Q.lb>0)&(Q.km<20)]), Q[Q.placa.isin(hm)&(Q.lb>0)&(Q.km<20)].lb.sum().round(0))
# baseline: fuel happens on day off frequently (refuel evening before day off?) -> compare foaie vs benzol rate
tot_f=Q[Q.placa.isin(hm)&(Q.lf>0)]; tot_b=Q[Q.placa.isin(hm)&(Q.lb>0)]
print('rate foaie',round(len(q)/len(tot_f),3),' rate benzol',round(len(Q[Q.placa.isin(hm)&(Q.lb>0)&(Q.km<20)])/len(tot_b),3))
x.to_csv('foaie_zi_fara_km.csv',index=False)
# ---- two 'plin' same day: sessions >= 0.85*P90 of vehicle's sessions, 2+ on same day with day km < 150 (non-truck)
S=pd.read_pickle('S.pkl'); S['zi']=S.t0.dt.date.astype(str)
p90=S.groupby('placa').l.quantile(.9); S['plin']=S.l>=0.85*S.placa.map(p90)
S=S[~S.cat.isna()&(S.cat!='camion_marfa')]
dp=S[S.plin].groupby(['placa','zi']).agg(n=('l','size'),l=('l','sum'),h=('t0',lambda s:','.join(s.dt.strftime('%H:%M')))).reset_index()
dp=dp[dp.n>=2].merge(Z[['placa','zi','km','src']],on=['placa','zi'],how='left')
print('days with >=2 plin sessions:',len(dp),dp.l.sum().round(0)); 
lo=dp[dp.km.fillna(0)<150]; print('   of which day km<150:',len(lo),lo.l.sum().round(0)); print(lo.sort_values('l',ascending=False).head(12))
