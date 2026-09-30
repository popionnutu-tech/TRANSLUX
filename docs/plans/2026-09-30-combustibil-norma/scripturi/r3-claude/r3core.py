"""Runda 3 — protocolul comun cu fallback FĂRĂ viitor (măsurarea contează doar dacă data_masurare < începutul lunii testate)."""
import sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r2-claude')
from r2core import *  # noqa

V['dm'] = pd.to_datetime(V.data_masurare)


def old_asof(T0):
    ok = V.dm.isna() | (V.dm < pd.Timestamp(T0))   # fără dată = norma de dinainte (Codex)
    mi = V.norma_masurata_incarcat.where(ok)
    mm = V.norma_masurata.where(ok)
    return mi.combine_first(mm).combine_first(V.norma_tip)


TESTS = {'sep': ('2026-06-10', '2026-08-31', '2026-09-01', '2026-09-27'),
         'aug': ('2026-06-10', '2026-07-31', '2026-08-01', '2026-08-31')}


def metode3(C0, C1):
    N = {}
    iv_sql = intervale(C0, C1, 'fill')
    iv_zi = intervale(C0, C1, 'zi')
    N['plin SQL 445'] = norma_iv(iv_sql).norma
    N['plin zi'] = norma_iv(iv_zi).norma
    N['Codex: plin zi ≥3.000'] = norma_iv(iv_zi, minkm=3000).norma
    N['SQL trim10'] = norma_iv(iv_sql, stat='trim').norma
    N['zi trim10'] = norma_iv(iv_zi, stat='trim').norma
    N['zi ≥3.000 trim10'] = norma_iv(iv_zi, minkm=3000, stat='trim').norma
    N['zi ≥5 int. trim10'] = norma_iv(iv_zi, minint=5, stat='trim').norma
    rl = raport_lunar(C0, C1)
    N['raport fereastra'] = rl.norma
    eb = shrink(rl, 5000)
    N['EB K5k (Claude)'] = eb
    N['_eb'] = eb
    N['_n_sql'] = norma_iv(iv_sql).n
    N['_n_zi'] = norma_iv(iv_zi).n
    return N
