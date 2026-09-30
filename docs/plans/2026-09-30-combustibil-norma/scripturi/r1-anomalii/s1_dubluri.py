from common import *
v,b,f,g,m=load()
pd.set_option('display.width',250); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',80)
# foi structure
print('foi rows per placa/zi', f.groupby(['placa','zi']).size().value_counts().head())
print('foi rows per placa/zi/foaie', f.groupby(['placa','zi','foaie']).size().value_counts().head())
print('km_foaie==1 share by foaie'); print(f.assign(k1=f.km_foaie<=1).groupby('foaie').k1.mean())
# --- 1. benzol duplicates within X minutes
b=b.sort_values(['placa','ts']).reset_index(drop=True)
b['dt_prev']=b.groupby('placa').ts.diff().dt.total_seconds()/60
b['l_prev']=b.groupby('placa').litri.shift()
b['src_prev']=b.groupby('placa').sursa.shift()
for th in [5,15,30,60]:
    s=b[b.dt_prev<=th]
    print(f'benzol consecutive <= {th} min: {len(s)} rows, litri {s.litri.sum():.0f}; same src {(s.sursa==s.src_prev).sum()}, cross src {(s.sursa!=s.src_prev).sum()}')
s=b[b.dt_prev<=30].copy()
s['same_l']=(s.litri-s.l_prev).abs()<=0.5
print('<=30min same litri(+-0.5):', s.same_l.sum(), s[s.same_l].litri.sum())
print(s[s.same_l][['placa','loc','litri','l_prev','sursa','src_prev','dt_prev']].head(15))
print('exact same timestamp same placa:', b.duplicated(['placa','ts']).sum())
print(b[b.duplicated(['placa','ts'],keep=False)][['placa','loc','litri','sursa']].head(20))
# cross source identical litri within 24h
b['key']=b.litri.round(2)
x=b.merge(b,on=['placa','key'],suffixes=('','_2'))
x=x[(x.sursa<x.sursa_2)]
x['dh']=(x.ts_2-x.ts).abs().dt.total_seconds()/3600
x=x[x.dh<=24]
print('benzol vs benzol2 same litri (to 0.01) within 24h:',len(x), x.litri.sum()); print(x[['placa','loc','litri','sursa','loc_2','sursa_2','dh']].head(15))
# sum per sursa over time
print(b.groupby([b['loc'].dt.strftime('%Y-%m'),'sursa']).litri.sum().unstack().tail(22))
# placa using both sources
ps=b.groupby('placa').sursa.nunique(); print('placa with both sources', (ps>1).sum(), 'of', len(ps))
# --- zero litri
print('benzol litri==0:', (b.litri==0).sum(), ' <1:',(b.litri<1).sum())
# --- 2. benzol vs foaie same day
bd=b.groupby(['placa','zi']).agg(lb=('litri','sum'),nb=('litri','size'),lmax=('litri','max'),lst=('litri',list)).reset_index()
fd=f.groupby(['placa','zi']).agg(lf=('litri','sum'),nf=('litri','size'),foi=('foaie',lambda s:','.join(sorted(set(s)))),lfl=('litri',list)).reset_index()
j=bd.merge(fd,on=['placa','zi'])
print('placa-days with both benzol & foaie:',len(j),'foaie litri',j.lf.sum(),'benzol litri',j.lb.sum())
def match(r):
    for a in r.lst:
        for c in r.lfl:
            if abs(a-c)<=max(0.5,0.01*a): return True
    return False
j['match']=j.apply(match,axis=1)
jm=j[j['match']]
print('same-day benzol~foaie litri match (<=1%/0.5l):',len(jm),'litri foaie',jm.lf.sum())
print(jm.foi.value_counts())
print(jm[['placa','zi','lst','lfl','foi']].head(20))
# also adjacent day match (foaie date shift +-1)
f2=f.copy(); 
rows=[]
for sh in [-1,1]:
    ff=f.copy(); ff['zi']=(pd.to_datetime(ff.zi)+pd.Timedelta(days=sh)).dt.date.astype(str)
    jj=b.merge(ff,on=['placa','zi'],suffixes=('_b','_f'))
    jj=jj[(jj.litri_b-jj.litri_f).abs()<=np.maximum(0.5,0.01*jj.litri_b)]
    print('shift',sh,'matches',len(jj), jj.litri_f.sum())
# random-chance baseline: match benzol with foaie of a different placa same day
fr=f.copy(); rng=np.random.default_rng(1); fr['placa']=rng.permutation(fr.placa.values)
jr=bd.merge(fr.groupby(['placa','zi']).agg(lfl=('litri',list),lf=('litri','sum')).reset_index(),on=['placa','zi'])
jr['match']=jr.apply(match,axis=1); print('baseline shuffled placa: pairs',len(jr),'matches',jr['match'].sum())
jm.to_csv('dub_benzol_foaie.csv',index=False)
# ratio of match rate
print('match rate real', len(jm)/len(j), 'baseline', jr['match'].sum()/max(1,len(jr)))
# --- 3. foaie duplicates: same placa, same zi, two foaie tables
fx=f.groupby(['placa','zi']).foaie.nunique(); print('placa-days in >1 foaie table',(fx>1).sum())
ff=f[f.set_index(['placa','zi']).index.isin(fx[fx>1].index)]
print(ff.sort_values(['placa','zi']).head(20))
# same placa same zi same foaie repeated litri
dd=f[f.duplicated(['placa','zi','litri'],keep=False)]
print('foaie exact duplicate placa/zi/litri rows:',len(dd), dd.litri.sum()/2); print(dd.head(10))
