from common import *
v,b,f,g,m=load()
pd.set_option('display.width',250); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',200)
b['luna']=b.zi.str[:7]; f['luna']=f.zi.str[:7]; m['luna']=m.zi.str[:7]; g['luna']=g.zi.str[:7]
g['km_real']=np.where(g.km_total-g.km_patched<5,0,g.km_total)  # parcare fara km carpiti
L=pd.concat([b.groupby(['placa','luna']).litri.sum().rename('lb'),
             f.groupby(['placa','luna']).litri.sum().rename('lf'),
             m.groupby(['placa','luna']).km.sum().rename('km_m2m'),
             m.groupby(['placa','luna']).km.size().rename('zile_m2m'),
             g.groupby(['placa','luna']).km_real.sum().rename('km_gps'),
             g.groupby(['placa','luna']).km_total.sum().rename('km_gps_brut')],axis=1).fillna(0).reset_index()
L['l']=L.lb+L.lf
L=L.merge(v[['placa','tip','categorie','directii','norma_tip','norma_masurata','active']],on='placa',how='left')
L['km']=np.where(L.km_gps>0,L.km_gps,L.km_m2m)
L['c']=np.where(L.km>=1000,100*L.l/L.km,np.nan)
L.to_pickle('L.pkl')
# 1. litri without km
nok=L[(L.l>=200)&(L.km<100)&(L.luna<'2026-10')]
print('placa-months litri>=200 & km<100:',len(nok),'litri',nok.l.sum().round(0))
print(nok.groupby('categorie',dropna=False).l.agg(['size','sum']))
print(nok[nok.categorie!='camion_marfa'].sort_values('l',ascending=False).head(25)[['placa','luna','lb','lf','km_m2m','km_gps','tip','directii']])
# km without litri
nol=L[(L.km>=2000)&(L.l<50)]
print('placa-months km>=2000 & litri<50:',len(nol),'km',nol.km.sum().round(0))
print(nol.sort_values('km',ascending=False).head(25)[['placa','luna','l','km_m2m','km_gps','tip','directii']])
# expected litres missing = km * norma
nol=nol.assign(exp=nol.km*nol.norma_tip.fillna(15)/100); print('expected litres for those', nol.exp.sum().round(0))
