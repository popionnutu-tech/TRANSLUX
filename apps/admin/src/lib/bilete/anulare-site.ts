import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { ComandaError } from './comenzi';
import { anuleazaSiReturneaza, garantieLansareActiva } from './refund';
import { trimiteEmailAnulare } from './email';
import { CIFRE_INCERCARI_MAX, eligibilitateRetur } from './retur-bot-reguli';
import { sumaRestituire } from './refund-reguli';

// Anularea biletului pe site și din asistentul online (Ion, 10.10.2026: «anularea la bilet posibilă și pe site în
// găsește biletul, și din asistentul online, dacă se identifică clientul»; «niciodată nu trebuie decide dispecerul»).
// Identificarea: codul biletului (linkul secret) + ultimele 4 cifre ale telefonului din comandă (557: 5 greșeli → pauză
// 15 min). Aceleași reguli ca botul: grila de restituire (sau garanția de lansare), tur-returul întreg până la plecarea
// turului, returul legat cu aceeași fracție. Fără tabel de oferte: suma se calculează la cerere și din nou la confirmare;
// dacă între timp s-a schimbat (alt prag al grilei), omul o vede și confirmă din nou.

const COD_RE = /^[0-9a-f]{32}$/;
const COL = 'id, cod, status, phone, total, departure_at, from_name, to_name, lang, in_pachet, comanda_tur_id, bani_inapoi';

type Rand = { id: string; cod: string; status: string; phone: string; total: number; departure_at: string; from_name: string; to_name: string; lang: string | null; in_pachet: boolean; comanda_tur_id: string | null; bani_inapoi?: boolean };

export type RaspunsAnulare =
  | { ok: true; tip: 'oferta'; suma: number; total: number; cu_retur: boolean; from_name: string; to_name: string; departure_at: string }
  | { ok: true; tip: 'anulat'; suma: number; refund: 'creat' | 'necunoscut' | 'fara_plata' }
  | { ok: true; tip: 'suma_schimbata'; suma: number }
  | { ok: false; cod: 'inexistent' | 'stare' | 'bani_inapoi' | 'cifre_gresite' | 'pauza' | 'urcat' | 'plecat' | 'sub_4h' | 'sub_10' | 'indisponibil'; ramase?: number; minute?: number; motiv?: string };

const parteRetur = (total: number, noimi: number) => (noimi >= 9 ? Math.round(total * 100) / 100 : sumaRestituire(total, noimi));

async function pregateste(codRaw: unknown, cifreRaw: unknown): Promise<
  { ok: false; r: RaspunsAnulare } | { ok: true; tur: Rand; leg: { id: string; total: number } | null; turSuma: number; suma: number; total: number; noimi: number }
> {
  const cod = String(codRaw ?? '').trim().toLowerCase();
  if (!COD_RE.test(cod)) return { ok: false, r: { ok: false, cod: 'inexistent' } };
  const db = getSupabase();
  const { data: c0, error } = await db.from('bilete_comenzi').select(COL).eq('cod', cod).maybeSingle();
  if (error) throw new Error(`bilete_comenzi: ${error.message}`);
  if (!c0) return { ok: false, r: { ok: false, cod: 'inexistent' } };
  let tur = { ...(c0 as Rand), total: Number((c0 as Rand).total) };
  if (tur.in_pachet && tur.comanda_tur_id) {
    const { data: t } = await db.from('bilete_comenzi').select(COL).eq('id', tur.comanda_tur_id).maybeSingle();
    if (!t) return { ok: false, r: { ok: false, cod: 'inexistent' } };
    tur = { ...(t as Rand), total: Number((t as Rand).total) };
  }
  // L4 (revizia 10.10): plata fără bilet cu banii deja în drum înapoi — nimic de anulat; pagina spune că banii se întorc.
  if (tur.status === 'platita_fara_bilet' && tur.bani_inapoi) return { ok: false, r: { ok: false, cod: 'bani_inapoi' } };
  if (!(tur.status === 'platita' || tur.status === 'platita_fara_bilet')) return { ok: false, r: { ok: false, cod: 'stare' } };

  // Cele 4 cifre, pe comanda turului (o singură pauză pentru pachet).
  const { data: v, error: eV } = await db.rpc('bilete_anulare_cifre', { p_comanda: tur.id, p_cifre: String(cifreRaw ?? '').slice(0, 20), p_max: CIFRE_INCERCARI_MAX });
  if (eV) throw new Error(`bilete_anulare_cifre: ${eV.message}`);
  const vc = v as { ok: boolean; ramase: number; blocat: boolean; minute?: number };
  if (!vc.ok) return { ok: false, r: vc.blocat ? { ok: false, cod: 'pauza', minute: vc.minute ?? 15 } : { ok: false, cod: 'cifre_gresite', ramase: vc.ramase } };

  const { data: l } = await db.from('bilete_comenzi').select('id, total').eq('comanda_tur_id', tur.id).in('status', ['platita', 'platita_fara_bilet'])
    .eq('bani_inapoi', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const leg = l ? { id: (l as { id: string }).id, total: Number((l as { total: number }).total) } : null;
  // C6 (10.10): aceeași eligibilitate ca botul (eligibilitateRetur) — urcat, tur-retur până la plecarea turului, grila
  // sau garanția de lansare.
  const urcate = async (id: string) => (await db.from('bilete').select('id', { count: 'exact', head: true }).eq('comanda_id', id).eq('status', 'urcat')).count ?? 0;
  const [urcateTur, urcateRetur, garantie] = await Promise.all([urcate(tur.id), leg ? urcate(leg.id) : Promise.resolve(0), garantieLansareActiva()]);
  const calc = eligibilitateRetur({ departureAt: tur.departure_at, total: tur.total, urcateTur, leg: leg ? { total: leg.total, urcate: urcateRetur } : null, nowMs: Date.now(), garantie });
  if (calc.tip === 'fara_bani') return { ok: false, r: { ok: false, cod: calc.motiv } };
  if (calc.tip === 'dispecer') return { ok: false, r: { ok: false, cod: 'sub_10' } };
  const plus = leg ? parteRetur(leg.total, calc.noimi) : 0;
  return { ok: true, tur, leg, turSuma: calc.suma, suma: Math.round((calc.suma + plus) * 100) / 100, total: tur.total + (leg?.total ?? 0), noimi: calc.noimi };
}

/** Cât primește omul înapoi acum (după identificare). Nu anulează nimic. */
export async function ofertaAnulare(cod: unknown, cifre: unknown): Promise<RaspunsAnulare> {
  const p = await pregateste(cod, cifre);
  if (!p.ok) return p.r;
  return { ok: true, tip: 'oferta', suma: p.suma, total: p.total, cu_retur: Boolean(p.leg), from_name: p.tur.from_name, to_name: p.tur.to_name, departure_at: p.tur.departure_at };
}

/** Anularea și returnarea banilor, cu suma pe care omul a văzut-o (altfel «suma s-a schimbat», fără anulare). */
export async function confirmaAnulare(cod: unknown, cifre: unknown, sumaVazuta: unknown, sursa: 'site' | 'asistent'): Promise<RaspunsAnulare> {
  const p = await pregateste(cod, cifre);
  if (!p.ok) return p.r;
  if (!(Math.abs(Number(sumaVazuta) - p.suma) < 0.005)) return { ok: true, tip: 'suma_schimbata', suma: p.suma };
  const sumaRetur = p.leg ? parteRetur(p.leg.total, p.noimi) : undefined;
  try {
    const r = await anuleazaSiReturneaza(p.tur.id, {
      sursa: 'pasager',
      motiv: `anulare cerută ${sursa === 'site' ? 'pe pagina biletului' : 'în asistentul de pe site'} (${p.suma} lei după grilă${p.leg ? ', cu returul legat' : ''})`,
      suma: p.turSuma, ...(p.leg ? { siReturul: true, sumaRetur } : {}),
    });
    if (r.refund !== 'fara_plata') await trimiteEmailAnulare(p.tur.id, r.suma ?? p.suma).catch(() => 'esuat');
    return { ok: true, tip: 'anulat', suma: p.suma, refund: r.refund };
  } catch (e) {
    if (e instanceof ComandaError) return { ok: false, cod: e.cod === 'inchis' && /scanat/.test(e.message) ? 'urcat' : 'indisponibil', motiv: e.message };
    throw e;
  }
}
