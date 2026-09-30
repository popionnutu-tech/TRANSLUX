from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
v,b,f,g,m=load()
Z=pd.read_pickle('Z.pkl'); S=pd.read_pickle('S.pkl')
trucks=set(v.placa[v.directii=='camioane'])
fc=f[f.foaie=='pz_camcer'].copy(); print('pz_camcer rows',len(fc),'litri',fc.litri.sum().round(0),'plates',fc.placa.nunique(), 'non-truck plates in camcer', sorted(set(fc.placa)-trucks))
print('camcer size bins', pd.cut(fc.litri,[0,100,200,300,400,500,600,800,1000,2000]).value_counts().sort_index().to_dict())
big=fc[fc.litri>=600]; print('camcer >=600 l:',len(big),big.litri.sum().round(0)); print(big.sort_values('litri',ascending=False).head(10)[['placa','zi','litri','km_foaie','sofer']])
# exact round values
fc['c']=np.round(fc.litri*100).astype(int)
print('camcer exact multiples of 50 l (+-0.02):', ((fc.c%5000<=2)|(fc.c%5000>=4998)).mean().round(3))
print('top values', fc.litri.round(2).value_counts().head(12).to_dict())
# benzol trucks
bt=b[b.placa.isin(trucks)].copy(); bt['c']=np.round(bt.litri*100).astype(int)
print('truck benzol rows',len(bt),'litri',bt.litri.sum().round(0),' share x.0x of multiple of 50:', ((bt.c%5000<=9)).mean().round(3))
print('truck benzol top values', bt.litri.round(2).value_counts().head(12).to_dict())
# month-end: fills on last 2 days of month for trucks vs uniform
allf=pd.concat([bt[['placa','zi','litri']],fc[['placa','zi','litri']]])
dd=pd.to_datetime(allf.zi); last=(dd+pd.offsets.MonthEnd(0)); allf['end']=(last-dd).dt.days<=1
print('truck fuel on last 2 days of month: rows share',allf.end.mean().round(3),'litri share',(allf[allf.end].litri.sum()/allf.litri.sum()).round(3),' expected ~',round(2/30.4,3))
nt=Z[(Z.grp!='camion')]; ntt=pd.to_datetime(nt[nt.l>0].zi); e=((ntt+pd.offsets.MonthEnd(0))-ntt).dt.days<=1; print('non-truck fuel-days share last 2 days', e.mean().round(3))
# per month truck litri on last2 days
allf['luna']=allf.zi.str[:7]
x=allf.groupby('luna').apply(lambda d:pd.Series({'l':d.litri.sum(),'end':d[d.end].litri.sum()}),include_groups=False); x['share']=x.end/x.l; print(x.round(2).T)
# truck consumption Jun-Sep per month, GPS
T=Z[(Z.grp=='camion')&(Z.zi>='2026-06-10')]
r=T.groupby('luna').agg(l=('l','sum'),km=('km','sum')); r['c']=100*r.l/r.km; print(r.round(1))
# truck sessions multiple pumps: same day benzol + foaie
j=Z[(Z.grp=='camion')&(Z.lb>0)&(Z.lf>0)]; print('truck days with both benzol and camcer:',len(j),j.l.sum().round(0)); print(j[['placa','zi','lb','lf','km']].head(10))
