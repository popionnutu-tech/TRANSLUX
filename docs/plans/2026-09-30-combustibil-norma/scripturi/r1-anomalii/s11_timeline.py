from common import *
import sys
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',300)
Z=pd.read_pickle('Z.pkl')
for p,a,bb in [('IIC230','2026-07-25','2026-09-05'),('LJN076','2026-06-08','2026-07-05'),('RWN169','2026-06-08','2026-07-05'),('603BRAS','2026-06-14','2026-07-05'),('034BRAT','2026-08-10','2026-09-15')]:
    d=Z[(Z.placa==p)&(Z.zi>=a)&(Z.zi<=bb)]
    print('====',p); print(d[['zi','src','km','km_total','km_patched','km_check','gps_points','km_m2m','lb','nb','lf','foaie','sofer_f','sofer_m2m']].to_string(index=False))
# gps coverage per truck: days in period with GPS row
T=Z[(Z.grp=='camion')&(Z.zi>='2026-06-10')&(Z.zi<='2026-09-27')]
cov=T.groupby('placa').agg(gps_days=('src',lambda s:(s=='gps').sum()),fuel_nogps=('src',lambda s:(s=='none').sum()),km=('km','sum'),l=('l','sum'))
cov['c']=100*cov.l/cov.km; print(cov.sort_values('c',ascending=False).round(1))
