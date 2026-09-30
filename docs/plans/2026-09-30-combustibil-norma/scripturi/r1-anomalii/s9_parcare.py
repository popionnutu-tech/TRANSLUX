from common import *
pd.set_option('display.width',260); pd.set_option('display.max_columns',40); pd.set_option('display.max_rows',200)
Z=pd.read_pickle('Z.pkl')
G=Z[Z.km_real.notna()]  # GPS days from 10.06
print('GPS days',len(G),'with fuel',(G.l>0).sum())
for grp in ['all','camion','non']:
    d=G if grp=='all' else (G[G.grp=='camion'] if grp=='camion' else G[G.grp!='camion'])
    pk=d[(d.park)&(d.l>0)]
    print(grp,'fuel on parking day (km_total-km_patched<5):',len(pk),'l',pk.l.sum().round(0),' of which benzol',pk.lb.sum().round(0),'foaie',pk.lf.sum().round(0))
pk=G[(G.park)&(G.l>0)].copy()
# is neighbouring day with km? check prev/next day km
G2=Z.sort_values(['placa','zi']).copy()
G2['km_prev']=G2.groupby('placa').km.shift(1); G2['km_next']=G2.groupby('placa').km.shift(-1)
G2['zi_prev']=G2.groupby('placa').zi.shift(1); G2['zi_next']=G2.groupby('placa').zi.shift(-1)
pk=G2[(G2.km_real.notna())&(G2.park==True)&(G2.l>0)]
iso=pk[(pk.km_prev.fillna(0)<20)&(pk.km_next.fillna(0)<20)]
print('parking-day fuel where prev and next day also <20km:',len(iso),'l',iso.l.sum().round(0))
print(iso.groupby('grp').l.agg(['size','sum']))
print(iso.sort_values('l',ascending=False)[['placa','zi','lb','lf','foaie','km_total','km_patched','km_check','gps_points','km_prev','km_next','tip','directii']].head(30))
# low gps points -> tracker off rather than parked
print('iso with gps_points<100:',(iso.gps_points<100).sum())
iso.to_csv('fuel_parcare_izolat.csv',index=False)
# days with fuel but NO km row at all (no gps, no m2m) since 10.06 for vehicles that have gps
hasg=set(G.placa)
nk=Z[(Z.zi>='2026-06-10')&(Z.src=='none')&(Z.l>0)]
print('fuel days with no km record (since 10.06):',len(nk),nk.l.sum().round(0)); print(nk.groupby('placa').l.agg(['size','sum']).sort_values('sum',ascending=False).head(15))
