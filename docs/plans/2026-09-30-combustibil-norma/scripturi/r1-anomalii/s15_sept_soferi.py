from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
v,b,f,g,m=load()
Z=pd.read_pickle('Z.pkl')
print('max dates: gps',g.zi.max(),'m2m',m.zi.max(),'foi',f.zi.max(),'benzol',b.zi.max())
Z['dd']=Z.zi.str[8:10].astype(int)
W=Z[(Z.dd<=27)&(Z.grp!='camion')&(Z.zi>='2026-01-01')]
r=W.groupby('luna').agg(l=('l','sum'),km=('km','sum'),lb=('lb','sum'),lf=('lf','sum')); r['c']=100*r.l/r.km; print('fleet non-truck days 1-27:'); print(r.round(1))
# by direction
r2=W[W.luna>='2026-07'].groupby(['directii','luna']).agg(l=('l','sum'),km=('km','sum')); r2['c']=100*r2.l/r2.km; print(r2.c.unstack().round(2))
# ---- drivers: per vehicle-day driver from m2m; attribute fuel to stints
Y=Z[(Z.grp!='camion')&Z.sofer_m2m.notna()].sort_values(['placa','zi']).copy()
# stint = consecutive rows same driver on same vehicle
Y['new']=(Y.sofer_m2m!=Y.groupby('placa').sofer_m2m.shift())
Y['stint']=Y.new.cumsum()
St=Y.groupby('stint').agg(placa=('placa','first'),sof=('sofer_m2m','first'),l=('l','sum'),km=('km','sum'),d=('zi','size'),dir=('dir_m2m','first'),tip=('tip','first'))
# driver-vehicle aggregate, only long stints to reduce tank-boundary noise
St=St[St.km>=800]
DV=St.groupby(['placa','sof']).agg(l=('l','sum'),km=('km','sum'),dir=('dir','first'),tip=('tip','first')).reset_index()
DV=DV[DV.km>=3000]
veh=DV.groupby('placa').agg(L=('l','sum'),K=('km','sum'),nd=('sof','nunique'))
DV=DV.merge(veh,on='placa'); DV=DV[DV.nd>=2]
# compare driver to the others on same vehicle
DV['c']=100*DV.l/DV.km; DV['c_oth']=100*(DV.L-DV.l)/(DV.K-DV.km); DV['r']=DV.c/DV.c_oth
DV['exc']=DV.l-DV.km*DV.c_oth/100
D=DV.groupby('sof').agg(nveh=('placa','nunique'),km=('km','sum'),l=('l','sum'),exc=('exc','sum'),rmed=('r','median'),rmin=('r','min'),rmax=('r','max'),dirs=('dir',lambda s:','.join(sorted(set(map(str,s))))))
D['r_w']=(D.l)/(D.l-D.exc)
print('driver-vehicle pairs',len(DV),'drivers',len(D))
print('ratio distribution pairs', DV.r.describe(percentiles=[.05,.25,.5,.75,.95]).round(3).to_dict())
print('drivers with >=2 vehicles, sorted by weighted ratio:')
DD=D[D.nveh>=2].sort_values('r_w',ascending=False); print(DD.head(12).round(2)); print(DD.tail(6).round(2))
print('drivers nveh>=2 with r_w>1.1 and rmin>1.03 (consistent on all vehicles):'); c=DD[(DD.r_w>1.1)&(DD.rmin>1.03)]; print(c.round(2)); print('sum excess',c.exc.sum().round(0))
DV.to_csv('soferi_pereche.csv',index=False); D.to_csv('soferi.csv')
