import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { chisinauTimeOf } from '@/lib/chisinau-time';
import { autentificaSofer } from '@/lib/bilete/sofer-auth';
import { curseleSoferului } from '@/lib/bilete/sofer';
import { COD_QR_RE, biletPermis, cheieCursa, clasificaScanare, parseazaCheie, parseazaScanari, type RezultatScanare } from '@/lib/bilete/sofer-reguli';

// POST /api/bilete-sofer/scan — lotul de scanări al șoferului (ION-239, contractul ION-190 pașii 7–8; coada offline
// trimite mai multe deodată). Corp: { cheie: «2026-10-05|7|false», scanari: [{cod, moment_client, offline}] }.
//  * ok = biletul e «valid» pe cursa cheie → UPDATE … WHERE status = 'valid' (prima scanare câștigă; dacă între timp l-a
//    urcat altul → deja_urcat cu urcat_de_altul=true); urcat_at = ora clientului (scanarea), urcat_sursa = 'scan'.
//  * deja_urcat / anulat / alta_cursa (cu cursa biletului) / necunoscut — doar jurnal.
//  * fiecare scanare se scrie în bilete_scanari; retrimiterea aceleiași scanări (același cod, șofer, moment_client, «ok»
//    deja scris) răspunde «ok» fără rând nou.
//  * cheia trebuie să fie o cursă a ȘOFERULUI (din atribuirile zilei din cheie) — SEC-14; altfel 403 cursa_straina.
// Se apără prin X-Telegram-Init-Data; plafon 60/min pe telegram_id; fără cache.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

interface BiletRand {
  id: string; comanda_id: string; cod_qr: string; nr: number; loc_nr: number | null;
  status: 'valid' | 'urcat' | 'anulat' | 'returnat'; urcat_at: string | null; urcat_de: string | null;
  trip_date: string; crm_route_id: number; going_north: boolean;
  comanda: { passenger_name: string; from_name: string; to_name: string; departure_at: string; test: boolean; proba_fizica: boolean } | null;
}

interface RezultatApi {
  cod: string; rezultat: RezultatScanare; loc_nr: number | null; nume: string | null; locuri_ramase_comanda: number | null;
  cursa_bilet: string | null; urcat_at: string | null; urcat_de_altul: boolean;
}

const SEL = 'id, comanda_id, cod_qr, nr, loc_nr, status, urcat_at, urcat_de, trip_date, crm_route_id, going_north, comanda:bilete_comenzi(passenger_name, from_name, to_name, departure_at, test, proba_fizica)';

async function citesteBilet(db: ReturnType<typeof getSupabase>, cod: string): Promise<BiletRand | null> {
  const { data, error } = await db.from('bilete').select(SEL).eq('cod_qr', cod).maybeSingle();
  if (error) throw new Error(`bilete: ${error.message}`);
  return (data as unknown as BiletRand) ?? null;
}

/** «Lipcani – Chișinău 14:50, 06.10» — ca șoferul să-l poată îndruma pe omul cu bilet pe altă cursă (C-c din plan). */
function textCursaBilet(b: BiletRand): string {
  const [, m, d] = b.trip_date.split('-');
  const ora = chisinauTimeOf(b.comanda?.departure_at ?? `${b.trip_date}T00:00:00Z`);
  return `${b.comanda?.from_name ?? '?'} – ${b.comanda?.to_name ?? '?'} ${ora}, ${d}.${m}`;
}

export async function POST(req: NextRequest) {
  // ION-273: identitatea și plafonul într-un singur hop (în paralel).
  const auth = await autentificaSofer(req.headers.get('x-telegram-init-data'));
  if (!auth.ok) return NextResponse.json({ eroare: auth.eroare }, { status: auth.status, headers: ANTETE });

  const corp: unknown = await req.json().catch(() => null);
  const cheie = parseazaCheie((corp as { cheie?: unknown })?.cheie);
  const acum = new Date();
  const scanari = parseazaScanari(corp, acum);
  if (!cheie || !scanari) return NextResponse.json({ eroare: 'corp nevalid' }, { status: 400, headers: ANTETE });
  const cheieSofer = cheieCursa(cheie.tripDate, cheie.crmRouteId, cheie.goingNorth);

  const db = getSupabase();
  try {
    const ale = await curseleSoferului(db, auth.sofer.id, cheie.tripDate, auth.sofer.is_test);
    if (!ale.some((c) => c.crm_route_id === cheie.crmRouteId && c.going_north === cheie.goingNorth)) {
      return NextResponse.json({ eroare: 'cursa_straina' }, { status: 403, headers: ANTETE });
    }

    const rezultate: RezultatApi[] = [];
    for (const s of scanari) {
      // Biletul nepermis (test la șofer real, real la șoferul de probă, comandă necitită) = absent pentru tot răspunsul (532).
      const citit = COD_QR_RE.test(s.cod) ? await citesteBilet(db, s.cod) : null;
      const b = citit && biletPermis(auth.sofer.is_test, citit.comanda) ? citit : null;
      const cheieBilet = b ? cheieCursa(b.trip_date, b.crm_route_id, b.going_north) : null;
      let okDejaScrisa = false;
      if (b && b.status === 'urcat' && b.urcat_de === auth.sofer.id) {
        const { data } = await db.from('bilete_scanari').select('id').eq('cod_citit', s.cod_citit).eq('driver_id', auth.sofer.id)
          .eq('rezultat', 'ok').eq('moment_client', s.moment_client).limit(1);
        okDejaScrisa = Boolean(data?.length);
      }
      let cls = clasificaScanare(b && cheieBilet ? { status: b.status, cheie: cheieBilet, urcat_de: b.urcat_de } : null, cheieSofer, auth.sofer.id, okDejaScrisa);
      let urcatAt = b?.urcat_at ?? null;

      if (b && cls.rezultat === 'ok' && !cls.repetata) {
        const { data: upd, error } = await db.from('bilete')
          .update({ status: 'urcat', urcat_at: s.moment_client, urcat_de: auth.sofer.id, urcat_sursa: 'scan' })
          .eq('id', b.id).eq('status', 'valid').select('id');
        if (error) throw new Error(`bilete update: ${error.message}`);
        if (upd?.length) {
          urcatAt = s.moment_client;
        } else {
          // Între citire și scriere l-a urcat altcineva (a doua mașină, SEC-7): prima scanare a câștigat.
          const re = await citesteBilet(db, s.cod);
          cls = { rezultat: 'deja_urcat', urcat_de_altul: re?.urcat_de !== auth.sofer.id };
          urcatAt = re?.urcat_at ?? null;
        }
      }

      if (!cls.repetata) {
        const { error } = await db.from('bilete_scanari').insert({
          cod_citit: s.cod_citit, driver_id: auth.sofer.id, cursa_sofer: cheieSofer, cursa_bilet: cheieBilet,
          rezultat: cls.rezultat, moment_client: s.moment_client,
        });
        if (error) console.error('[bilete-sofer/scan] jurnal:', error.message);
      }

      let ramase: number | null = null;
      if (b) {
        const { count } = await db.from('bilete').select('id', { count: 'exact', head: true }).eq('comanda_id', b.comanda_id).eq('status', 'valid');
        ramase = count ?? null;
      }
      rezultate.push({
        cod: s.cod_citit, rezultat: cls.rezultat, loc_nr: b?.loc_nr ?? null, nume: b?.comanda?.passenger_name ?? null,
        locuri_ramase_comanda: ramase, cursa_bilet: b && cls.rezultat === 'alta_cursa' ? textCursaBilet(b) : null,
        urcat_at: urcatAt, urcat_de_altul: cls.urcat_de_altul ?? false,
      });
    }
    return NextResponse.json({ rezultate }, { headers: ANTETE });
  } catch (e) {
    console.error('[bilete-sofer/scan]', e instanceof Error ? e.message : e);
    return NextResponse.json({ eroare: 'temporar indisponibil' }, { status: 503, headers: { ...ANTETE, 'Retry-After': '5' } });
  }
}
