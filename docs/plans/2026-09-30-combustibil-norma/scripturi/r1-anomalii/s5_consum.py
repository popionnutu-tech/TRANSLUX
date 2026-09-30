from common import *
v,b,f,g,m=load()
pd.set_option('display.width',260); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',200)
L=pd.read_pickle('L.pkl')
L['grp']=np.where(L.directii=='camioane','camion',L.categorie.fillna('fara_tip'))
# litri without km, excluding trucks before 2026-06
nok=L[(L.l>=200)&(L.km<100)&~((L.grp=='camion')&(L.luna<'2026-06'))&(L.luna<='2026-09')]
print('litri>=200 & km<100 (excl trucks pre-jun26):',len(nok),nok.l.sum().round(0))
print(nok.sort_values('l',ascending=False)[['placa','luna','lb','lf','km_m2m','km_gps','km_gps_brut','tip','directii','active']].head(40))
# ratio litri/km very low -> km without litri (partial), months km>=1500
LL=L[(L.km>=1500)&(L.grp!='camion')].copy()
LL['exp']=LL.km*LL.norma_tip/100
LL['r']=LL.l/LL.exp
print('non-truck months km>=1500:',len(LL))
print('months with litri < 50% of norma_tip expectation:',(LL.r<0.5).sum(), 'missing l',(LL.exp-LL.l)[LL.r<0.5].sum().round(0))
print(LL[LL.r<0.5].sort_values('r')[['placa','luna','l','km','km_m2m','km_gps','exp','r','tip','directii']].head(30))
print('months with litri > 150% of norma_tip:',(LL.r>1.5).sum(),'excess l',(LL.l-LL.exp)[LL.r>1.5].sum().round(0))
print(LL[LL.r>1.5].sort_values('r',ascending=False)[['placa','luna','l','km','km_m2m','km_gps','exp','r','tip','directii']].head(40))
LL.to_pickle('LL.pkl')
