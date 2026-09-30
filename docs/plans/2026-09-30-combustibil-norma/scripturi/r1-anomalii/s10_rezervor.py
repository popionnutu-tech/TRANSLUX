from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl'); S=pd.read_pickle('S.pkl')
Z=Z[(Z.zi>='2026-06-10')&(Z.zi<='2026-09-27')].sort_values(['placa','zi'])
def tank(r):
    t=str(r.tip)
    if r.grp=='camion': return None
    if t=='DAF': return 260
    if t.startswith(('SPRINTER','CRAFTER','FORD','INTERURBAN')): return 100
    return None
# truck tank: own P95 of single benzol/foi records 2025-26, min 600
f=pd.read_csv(D+'foi_parcurs.csv'); b=pd.read_pickle('b.pkl')
recs=pd.concat([b[['placa','litri']],f[['placa','litri']]])
p95=recs.groupby('placa').litri.quantile(.95)
out=[]
for p,d in Z.groupby('placa'):
    r0=d.iloc[0]
    T=tank(r0)
    if r0.grp=='camion': T=max(600,float(p95.get(p,600))*1.1); nh,nl=45,20
    elif T is None: continue
    else:
        nt=r0.norma_tip if pd.notna(r0.norma_tip) else 15
        nh,nl=nt*1.3,nt*0.7
    if d.km.sum()<1000: continue
    lvl=T/2; lvl2=T/2; over=0; deficit=0; ev=[]
    for _,x in d.iterrows():
        # refuel at start of day then drive (conservative for overflow: consume prev day's km first -> already done)
        lvl+=x.l
        if lvl>T: ev.append((x.zi,round(x.l,1),round(lvl-T,1))); over+=lvl-T; lvl=T
        lvl-=x.km*nh/100
        if lvl<0: lvl=0
        lvl2+=x.l; lvl2=min(lvl2,T)
        lvl2-=x.km*nl/100
        if lvl2<0: deficit+=-lvl2; lvl2=0
    out.append(dict(placa=p,grp=r0.grp,tip=r0.tip,dir=r0.directii,T=round(T),l=d.l.sum(),km=d.km.sum(),over=over,n_over=len(ev),deficit_l=deficit,ev=ev[:6]))
O=pd.DataFrame(out)
print('vehicles',len(O)); print(O.groupby('grp').agg(n=('placa','size'),l=('l','sum'),over=('over','sum'),veh_over=('over',lambda s:(s>0).sum()),deficit=('deficit_l','sum')).round(0))
print(O.sort_values('over',ascending=False)[['placa','grp','tip','dir','T','l','km','over','n_over','ev']].head(30).to_string())
print(O.sort_values('deficit_l',ascending=False)[['placa','grp','tip','dir','T','l','km','deficit_l']].head(20).round(0))
O.to_pickle('O.pkl')
