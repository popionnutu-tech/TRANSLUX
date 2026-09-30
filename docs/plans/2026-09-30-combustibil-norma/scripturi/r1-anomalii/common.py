import pandas as pd, numpy as np
D='/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-151-translux-combustibil-analiza-c/docs/plans/2026-09-30-combustibil-norma/date/'
def load():
    v=pd.read_csv(D+'vehicule.csv')
    b=pd.read_csv(D+'alimentari_benzol.csv')
    b['ts']=pd.to_datetime(b.alimentat_at,utc=True)
    b['loc']=b.ts.dt.tz_convert('Europe/Chisinau')
    b['zi']=b['loc'].dt.date.astype(str)
    f=pd.read_csv(D+'foi_parcurs.csv')
    g=pd.read_csv(D+'km_gps_zi.csv').rename(columns={'date':'zi'})
    m=pd.read_csv(D+'km_lde_m2m.csv')
    return v,b,f,g,m
