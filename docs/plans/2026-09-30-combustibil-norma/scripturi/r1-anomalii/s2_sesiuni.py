from common import *
v,b,f,g,m=load()
pd.set_option('display.width',250); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',100)
b=b.merge(v[['placa','tip','categorie','directii','norma_tip','norma_masurata']],on='placa',how='left')
print('benzol placa not in vehicule:', b.tip.isna().sum(), b[b.tip.isna()].placa.unique()[:20])
b=b.sort_values(['placa','ts']).reset_index(drop=True)
b['gap']=b.groupby('placa').ts.diff().dt.total_seconds()/60
b['sess']=((b.gap.isna())|(b.gap>30)).cumsum()
S=b.groupby('sess').agg(placa=('placa','first'),t0=('loc','first'),t1=('loc','last'),n=('litri','size'),l=('litri','sum'),lmax=('litri','max'),tip=('tip','first'),cat=('categorie','first'),dir=('directii','first'),src=('sursa','first'),parts=('litri',lambda s:list(s.round(2)))).reset_index()
print('sessions',len(S),'multi-row',(S.n>1).sum(), S[S.n>1].l.sum())
print(S[S.n>1].groupby('cat').agg(n=('l','size'),l=('l','sum')))
print('multi sessions n distribution', S[S.n>1].n.value_counts().head(10))
print(S[S.n>=5].sort_values('n',ascending=False).head(15)[['placa','t0','t1','n','l','tip','parts']])
# per type distribution of session sums
q=S.groupby('tip').l.describe(percentiles=[.5,.9,.95,.99]); print(q)
# single-row max per type
print(b.groupby('tip').litri.describe(percentiles=[.5,.9,.95,.99]))
S.to_pickle('S.pkl'); b.to_pickle('b.pkl')
