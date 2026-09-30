from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl')
Z['sof']=Z.sofer_m2m.fillna(Z.sofer_f)
for s in ['S217','S004']:
    d=Z[Z.sof==s]
    r=d.groupby(['placa','luna']).agg(l=('l','sum'),km=('km','sum'),zile=('zi','size')); r['c']=100*r.l/r.km.replace(0,np.nan)
    print('=====',s); print(r.round(1))
# same vehicles: consumption by driver per month
for p in ['279BRAT','034BRAT','603BRAS']:
    d=Z[(Z.placa==p)&(Z.zi>='2026-01-01')]
    r=d.groupby(['luna','sof']).agg(l=('l','sum'),km=('km','sum'),zile=('zi','size')); r['c']=100*r.l/r.km.replace(0,np.nan)
    print('=====',p); print(r.round(1))
