from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
M=pd.read_pickle('M.pkl'); v=pd.read_csv(D+'vehicule.csv')
print(v[v.placa.isin(['809MUM','783MUM','826GXP'])][['placa','directii','tip','norma_tip','norma_masurata','active']])
Q=M[(M.tip=='DAF')&(M.km>=1000)&(M.luna<='2026-09')].copy(); Q['c']=100*Q.l/Q.km
Q['med']=Q.groupby('luna').c.transform('median')
for p in ['783MUM','809MUM']:
    d=Q[Q.placa==p]; e=(d.l-d.km*d.med/100)
    print(p,'months',len(d),'l',d.l.sum().round(0),'km',d.km.sum().round(0),'c',round(100*d.l.sum()/d.km.sum(),1),'DAF med avg',d.med.mean().round(1),'excess over DAF median',e.sum().round(0),'per month',(e.sum()/len(d)).round(0))
# LEAR Ungheni DAFs compare
U=Q[Q.dir=='LEAR_UNGHENI'].groupby('placa').agg(l=('l','sum'),km=('km','sum'),n=('luna','size')); U['c']=100*U.l/U.km; print(U.round(1))
