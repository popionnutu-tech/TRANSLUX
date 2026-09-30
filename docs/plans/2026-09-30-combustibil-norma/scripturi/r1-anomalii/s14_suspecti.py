from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
v,b,f,g,m=load()
Z=pd.read_pickle('Z.pkl')
print('809MUM rows: m2m',(m.placa=='809MUM').sum(),'gps',(g.placa=='809MUM').sum(),'benzol',(b.placa=='809MUM').sum(),'foi',(f.placa=='809MUM').sum(), f[f.placa=='809MUM'].litri.sum().round(0), f[f.placa=='809MUM'].zi.agg(['min','max']).tolist())
x=f[f.placa=='809MUM']; print(x.groupby(x.zi.str[:7]).litri.agg(['size','sum']).round(0).T)
for p in ['603BRAS','034BRAT','279BRAT','783MUM','849BRAN','284BRAT']:
    d=Z[Z.placa==p].copy()
    d['km_m2m0']=d.km_m2m.fillna(0); d['gps0']=d.km_real.fillna(np.nan)
    r=d.groupby('luna').agg(l=('l','sum'),lb=('lb','sum'),lf=('lf','sum'),m2m=('km_m2m0','sum'),gps=('km_total','sum'),n_fuel=('l',lambda s:(s>0).sum()),zile_m2m=('km_m2m',lambda s:(s>=20).sum()),zile_gps=('km_real',lambda s:(s>=20).sum()))
    r['c_m2m']=100*r.l/r.m2m.replace(0,np.nan); r['c_gps']=100*r.l/r.gps.replace(0,np.nan)
    nt=v.loc[v.placa==p,['tip','norma_tip','norma_masurata','directii']].values
    print('====',p,nt); print(r[r.index>='2025-09'].round(1))
