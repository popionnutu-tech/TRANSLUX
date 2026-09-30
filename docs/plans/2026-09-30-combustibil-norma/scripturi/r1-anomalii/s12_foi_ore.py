from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
v,b,f,g,m=load()
Z=pd.read_pickle('Z.pkl')
# ---- rounding
def rnd(x):
    c=np.round(x*100).astype(int)
    return (c%1000==0)|(c%1000==1)|(c%1000==999)   # multiples of 10 l (+-0.01)
def whole(x):
    c=np.round(x*100).astype(int); return (c%100==0)|(c%100==1)|(c%100==99)
f['r10']=rnd(f.litri); f['r1']=whole(f.litri); b['r10']=rnd(b.litri); b['r1']=whole(b.litri)
print('foi: share multiple of 10 l', f.groupby('foaie').r10.mean().round(3).to_dict()); print('foi: share whole litre', f.groupby('foaie').r1.mean().round(3).to_dict())
print('benzol: share mult 10', b.groupby('sursa').r10.mean().round(3).to_dict(),' whole', b.groupby('sursa').r1.mean().round(3).to_dict())
print('foi rows mult10 & >=50 l:', (f.r10&(f.litri>=50)).sum(), f[f.r10&(f.litri>=50)].litri.sum().round(0))
print(f[f.r10].groupby('foaie').litri.agg(['size','sum']).round(0))
# per driver on foi: share mult10
fd=f[f.foaie!='pz_camcer'].groupby('sofer').agg(n=('r10','size'),r10=('r10','mean'),l=('litri','sum'))
print('drivers (non camcer, n>=50) with >50% round entries:'); print(fd[(fd.n>=50)&(fd.r10>0.5)].sort_values('r10',ascending=False).round(2))
print('drivers n>=50 count',(fd.n>=50).sum(), 'median r10',fd[fd.n>=50].r10.median())
# ---- hours (local)
b['h']=b['loc'].dt.hour; b['wd']=b['loc'].dt.dayofweek
b=b.merge(v[['placa','directii','categorie']],on='placa',how='left')
print('hour histogram benzol (local):', b.groupby('h').litri.agg(['size','sum']).round(0).T.to_string())
night=b[(b.h>=0)&(b.h<4)&(b.litri>=1)]
print('night 00-04 refuels >=1l:',len(night),night.litri.sum().round(0)); print(night.groupby('directii',dropna=False).litri.agg(['size','sum']).round(0))
nv=night.groupby('placa').agg(n=('litri','size'),l=('litri','sum'))
tot=b[b.litri>=1].groupby('placa').litri.size()
nv['share']=nv.n/tot.reindex(nv.index); print(nv[nv.n>=10].sort_values('share',ascending=False).head(15).round(2))
print(night.sort_values('litri',ascending=False)[['placa','loc','litri','sursa','directii']].head(10))
wk=b[b.wd==6]; print('sunday refuels',len(wk),wk.litri.sum().round(0),'share rows',round(len(wk)/len(b),3))
# tiny records
t=b[b.litri<1]; print('benzol <1 l:',len(t),t.litri.sum().round(1), 'top plates', t.placa.value_counts().head(5).to_dict())
# 297LVY
x=b[b.placa=='297LVY']; print('297LVY', len(x), x.litri.describe().round(1).to_dict(), x.r10.mean().round(2), x.groupby(x['loc'].dt.strftime('%Y-%m')).litri.sum().round(0).to_dict())
