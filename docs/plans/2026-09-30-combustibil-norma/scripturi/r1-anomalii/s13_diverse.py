from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
v,b,f,g,m=load()
Z=pd.read_pickle('Z.pkl')
# plates: fuel total vs km total whole period, non-truck
A=Z.groupby('placa').agg(l=('l','sum'),km=('km','sum'),grp=('grp','first'),dir=('directii','first'),first=('zi','min'),last=('zi','max'))
A['c']=100*A.l/A.km.replace(0,np.nan)
print('fuel >=1000 l total but km < 1000 (whole period), non-truck:'); x=A[(A.l>=1000)&(A.km<1000)&(A.grp!='camion')]; print(x.round(0)); print('sum',x.l.sum().round(0))
# where km zero but vehicle known: 297LVY check m2m/g presence
for p in ['297LVY','740IZX','125COY','127COY']:
    print(p,'m2m rows',(m.placa==p).sum(),'gps rows',(g.placa==p).sum(), 'm2m km',m[m.placa==p].km.sum().round(0))
# S047 driver
s=f[f.sofer=='S047']; print('S047', s.foaie.value_counts().to_dict(), s.placa.value_counts().head(5).to_dict(), s.zi.min(), s.zi.max(), s.litri.value_counts().head(8).to_dict())
# ---- GPS vs m2m divergence
B=Z[Z.km_real.notna()&Z.km_m2m.notna()&(Z.zi>='2026-07-01')]
B=B[(B.km_total>=20)|(B.km_m2m>=20)]
B['d']=B.km_m2m-B.km_total
print('days both',len(B),' |diff|>50km & >25%:',((B.d.abs()>50)&(B.d.abs()>0.25*B.km_total)).sum())
bad=B[(B.d.abs()>50)&(B.d.abs()>0.25*B[['km_total','km_m2m']].max(axis=1))]
print('m2m>gps',(bad.d>0).sum(),bad[bad.d>0].d.sum().round(0),' gps>m2m',(bad.d<0).sum(),bad[bad.d<0].d.sum().round(0))
pv=B.groupby('placa').agg(n=('d','size'),gps=('km_total','sum'),m2m=('km_m2m','sum')); pv['r']=pv.m2m/pv.gps
print('vehicle m2m/gps ratio Jul-Sep, n>=30 days: outside 0.9-1.15:'); print(pv[(pv.n>=30)&((pv.r<0.9)|(pv.r>1.15))].sort_values('r').round(2))
print(bad.sort_values('d',ascending=False)[['placa','zi','km_total','km_patched','km_m2m','d','l']].head(8))
# km_patched
G=Z[Z.km_real.notna()]
print('km_patched total',G.km_patched.sum().round(0),'of km_total',G.km_total.sum().round(0),' days patched>50km',(G.km_patched>50).sum(),G[G.km_patched>50].km_patched.sum().round(0))
pp=G.groupby('placa').agg(p=('km_patched','sum'),t=('km_total','sum')); pp['s']=pp.p/pp.t
print(pp[pp.t>5000].sort_values('s',ascending=False).head(10).round(2))
# phantom parking days
pk=G[G.park&(G.km_total>=10)]; print('parking days with km_total>=10 (phantom removed):',len(pk),pk.km_total.sum().round(0))
# ---- benzol2 August 2026 gap
b2=b[b.sursa=='benzol2']; dd=b2.groupby('zi').size()
days=pd.date_range('2026-07-01','2026-09-27').astype(str)
miss=[d for d in days if d not in dd.index]; print('benzol2 days with zero records Jul-Sep 2026:',miss)
b1=b[b.sursa=='benzol']; dd1=b1.groupby('zi').size(); print('benzol days zero:',[d for d in pd.date_range('2025-01-02','2026-09-27').astype(str) if d not in dd1.index][:40])
miss2=[d for d in pd.date_range('2025-01-02','2026-09-27').astype(str) if d not in dd.index]; print('benzol2 missing days all period',len(miss2),miss2[:60])
