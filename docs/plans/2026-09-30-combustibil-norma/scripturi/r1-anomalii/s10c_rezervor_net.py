# limita de jos: in aceeasi zi alimentarea poate acoperi km-ii zilei (net), norma generoasa x1.3 (camioane 45)
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
    nogps=(d.src=='none').sum()
    lvl=T/2; over=0
    for _,x in d.iterrows():
        lvl=lvl+x.l-x.km*nh/100
        if lvl>T+0.5:
            evs.append(dict(placa=p,grp=r0.grp,tip=t,dir=r0.directii,zi=x.zi,l=round(x.l,1),km=x.km,src=x.src,over=round(lvl-T,1),lb=x.lb,lf=x.lf,foaie=x.foaie)); over+=lvl-T; lvl=T
        lvl=max(0,lvl)
    out.append(dict(placa=p,grp=r0.grp,tip=t,dir=r0.directii,T=round(T),l=d.l.sum(),km=d.km.sum(),over=over,zile_fara_gps=nogps))
O=pd.DataFrame(out); E=pd.DataFrame(evs)
print(O.groupby('grp').agg(n=('placa','size'),l=('l','sum'),over=('over','sum'),veh=('over',lambda s:(s>0).sum())).round(0))
print(O.groupby('dir').agg(n=('placa','size'),over=('over','sum'),veh=('over',lambda s:(s>0).sum())).round(0))
print('total',O.over.sum().round(0),'per 30 days',(O.over.sum()/110*30).round(0))
print(O[O.over>0].sort_values('over',ascending=False)[['placa','grp','tip','dir','T','l','km','over','zile_fara_gps']].head(25).round(0))
Eg=E[E.src=='gps']; print('events on days WITH gps row:',len(Eg),Eg.over.sum().round(0),' without gps row:',len(E)-len(Eg),E[E.src!='gps'].over.sum().round(0))
print(E[E.grp!='camion'].sort_values('over',ascending=False).head(15).to_string())
E.to_csv('rezervor_net_evenimente.csv',index=False); O.to_csv('rezervor_net_masini.csv',index=False)
