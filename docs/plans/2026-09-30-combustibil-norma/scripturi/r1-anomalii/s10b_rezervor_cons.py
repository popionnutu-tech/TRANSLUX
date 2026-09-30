# varianta conservatoare: km-ii zilei consumati INAINTE de alimentare (overflow minim), norma generoasa
from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl')
Z=Z[(Z.zi>='2026-06-10')&(Z.zi<='2026-09-27')].sort_values(['placa','zi'])
f=pd.read_csv(D+'foi_parcurs.csv'); b=pd.read_pickle('b.pkl')
recs=pd.concat([b[['placa','litri']],f[['placa','litri']]]); p95=recs.groupby('placa').litri.quantile(.95)
out=[];evs=[]
for p,d in Z.groupby('placa'):
    r0=d.iloc[0]; t=str(r0.tip)
    if r0.grp=='camion': T=max(600,float(p95.get(p,600))*1.1); nh=45
    elif t=='DAF': T=260; nh=r0.norma_tip*1.3
    elif t.startswith(('SPRINTER','CRAFTER','FORD','INTERURBAN')): T=100; nh=r0.norma_tip*1.3
    else: continue
    if d.km.sum()<1000: continue
    lvl=T/2; over=0
    for _,x in d.iterrows():
        lvl=max(0,lvl-x.km*nh/100)
        lvl+=x.l
        if lvl>T+0.5:
            evs.append(dict(placa=p,grp=r0.grp,tip=t,zi=x.zi,l=round(x.l,1),km=x.km,over=round(lvl-T,1),lb=x.lb,lf=x.lf,foaie=x.foaie)); over+=lvl-T; lvl=T
    out.append(dict(placa=p,grp=r0.grp,tip=t,dir=r0.directii,T=round(T),l=d.l.sum(),km=d.km.sum(),over=over))
O=pd.DataFrame(out); E=pd.DataFrame(evs)
print(O.groupby('grp').agg(n=('placa','size'),l=('l','sum'),over=('over','sum'),veh=('over',lambda s:(s>0).sum())).round(0))
print('total overflow',O.over.sum().round(0),'per month (3.6 mo)',(O.over.sum()/3.6).round(0))
print(O[O.over>0].sort_values('over',ascending=False)[['placa','grp','tip','dir','T','l','km','over']].head(25).round(0))
print(E.sort_values('over',ascending=False).head(30).to_string())
print('events',len(E), E.groupby('grp').size().to_dict())
E.to_csv('rezervor_overflow_evenimente.csv',index=False); O.to_csv('rezervor_overflow_masini.csv',index=False)
