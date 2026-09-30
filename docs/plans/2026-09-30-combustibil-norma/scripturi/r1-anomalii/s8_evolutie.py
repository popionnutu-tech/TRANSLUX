from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
v,b,f,g,m=load()
Z=pd.read_pickle('Z.pkl'); M=pd.read_pickle('M.pkl')
# plate format check
allp=pd.Series(pd.concat([v.placa,b.placa,f.placa,g.placa,m.placa]).unique())
norm=allp.str.replace(r'\s+','',regex=True).str.upper()
dup=allp[norm.duplicated(keep=False)]; print('plates differing only by space/case:',sorted(dup.tolist()))
for t,d in [('v',v),('b',b),('f',f),('g',g),('m',m)]:
    print(t, sorted(d.placa[d.placa.str.contains(' ')].unique().tolist()))
# the six interurban sprinters
P6=['077CMN','819BXI','805BXI','283YEK','749SHS','118BHA','054MLD','104BHA','210BZP','828MLN']
q=M[M.placa.isin(P6)].copy(); q['c']=np.where(q.km>=500,100*q.l/q.km,np.nan)
pv=q.pivot(index='luna',columns='placa',values='c').round(1); print(pv)
q['per']=np.where(q.luna<='2025-10','A:ian-oct25','B:nov25-sep26')
s=q[q.luna<='2026-09'].groupby(['placa','per']).agg(l=('l','sum'),km=('km','sum')).reset_index(); s['c']=100*s.l/s.km
print(s.pivot(index='placa',columns='per',values='c').round(1))
s2=s.pivot(index='placa',columns='per',values=['l','km','c'])
s2['exc_A']=s2[('l','A:ian-oct25')]-s2[('km','A:ian-oct25')]*s2[('c','B:nov25-sep26')]/100
print(s2.round(0)); print('total excess in A vs B-rate', s2.exc_A.sum().round(0))
# km in period A per month for these to check m2m coverage
print(q.pivot(index='luna',columns='placa',values='km').round(0))
