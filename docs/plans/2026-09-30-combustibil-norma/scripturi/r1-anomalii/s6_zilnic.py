from common import *
v,b,f,g,m=load()
pd.set_option('display.width',260); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',200)
g['park']=(g.km_total-g.km_patched)<5
g['km_real']=np.where(g.park,0,g.km_total)
md=m.groupby(['placa','zi']).agg(km_m2m=('km','sum'),sofer_m2m=('sofer','first'),dir_m2m=('directia','first'))
gd=g.set_index(['placa','zi'])[['km_real','km_total','km_patched','km_check','park','suspect','suspect_reason','gps_points']]
bd=b.groupby(['placa','zi']).agg(lb=('litri','sum'),nb=('litri','size'))
fd=f.groupby(['placa','zi']).agg(lf=('litri','sum'),foaie=('foaie','first'),km_foaie=('km_foaie','sum'),sofer_f=('sofer','first'))
Z=pd.concat([md,gd,bd,fd],axis=1).reset_index()
Z[['lb','lf','nb']]=Z[['lb','lf','nb']].fillna(0)
Z['l']=Z.lb+Z.lf
Z['km']=np.where(Z.km_real.notna(),Z.km_real,Z.km_m2m.fillna(0))
Z['src']=np.where(Z.km_real.notna(),'gps',np.where(Z.km_m2m.notna(),'m2m','none'))
Z=Z.merge(v[['placa','tip','categorie','directii','norma_tip','norma_masurata','active']],on='placa',how='left')
Z['grp']=np.where(Z.directii=='camioane','camion',Z.categorie.fillna('fara_tip'))
Z['luna']=Z.zi.str[:7]
Z.to_pickle('Z.pkl')
M=Z.groupby(['placa','luna']).agg(l=('l','sum'),lb=('lb','sum'),lf=('lf','sum'),km=('km','sum'),km_m2m=('km_m2m','sum'),zile_km=('km',lambda s:(s>=20).sum()),grp=('grp','first'),tip=('tip','first'),dir=('directii','first'),norma_tip=('norma_tip','first'),norma_m=('norma_masurata','first')).reset_index()
M['c']=np.where(M.km>=1000,100*M.l/M.km,np.nan)
M.to_pickle('M.pkl')
print('Z rows',len(Z)); print(Z.src.value_counts())
# m2m phantom days
print('m2m days >1000 km:',(Z.km_m2m>1000).sum(), Z[Z.km_m2m>1000].groupby('grp').size().to_dict())
print(Z[Z.km_m2m>1000].sort_values('km_m2m',ascending=False)[['placa','zi','km_m2m','km_real','l','tip','dir_m2m']].head(15))
