from common import *
v,b0,f,g,m=load()
pd.set_option('display.width',250); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',100)
S=pd.read_pickle('S.pkl'); b=pd.read_pickle('b.pkl')
small=S.tip.fillna('').str.match('SPRINTER|CRAFTER|FORD|INTERURBAN_MJW')
X=S[small&(S.l>100)].copy()
print('small-vehicle sessions >100 l:',len(X),'litri',X.l.sum().round(0),'excess over 100:',(X.l-100).sum().round(0))
print(X.groupby('placa').agg(n=('l','size'),l=('l','sum'),mx=('l','max'),tip=('tip','first'),dir=('dir','first'),first=('t0','min'),last=('t0','max')).sort_values('l',ascending=False).head(25))
print(X.groupby(X.t0.dt.strftime('%Y-%m')).l.agg(['size','sum']))
print(X.sort_values('l',ascending=False)[['placa','t0','n','l','tip','src','parts']].head(15))
# hour distribution of these vs all
X['h']=X.t0.dt.hour
print('hours of >100l sessions', X.h.value_counts().sort_index().to_dict())
# per vehicle: its own P90 vs these
X.to_csv('peste_rezervor_mic.csv',index=False)
# foaie > tank for small vehicles
f2=f.merge(v[['placa','tip','categorie']],on='placa',how='left')
sm=f2.tip.fillna('').str.match('SPRINTER|CRAFTER|FORD|INTERURBAN_MJW')
Y=f2[sm&(f2.litri>100)]
print('foaie small >100 l:',len(Y),Y.litri.sum().round(0)); print(Y.sort_values('litri',ascending=False).head(10))
print('foaie per tip describe'); print(f2.groupby('tip').litri.describe(percentiles=[.5,.95,.99]))
# DAF / buses big
Z=S[(S.tip=='DAF')&(S.l>220)]; print('DAF >220', len(Z), Z.l.sum()); print(Z[['placa','t0','l','parts']].head())
# not in vehicle list
nv=b[b.tip.isna()]; print('benzol plates not in fleet:', nv.placa.nunique(), 'rows',len(nv),'litri',nv.litri.sum().round(0))
print(nv.groupby('placa').agg(n=('litri','size'),l=('litri','sum'),first=('loc','min'),last=('loc','max')).sort_values('l',ascending=False))
fn=f2[f2.tip.isna()]; print('foi plates not in fleet', fn.placa.nunique(), len(fn), fn.litri.sum().round(0))
print(fn.groupby(['placa','foaie']).litri.agg(['size','sum']).sort_values('sum',ascending=False).head(15))
