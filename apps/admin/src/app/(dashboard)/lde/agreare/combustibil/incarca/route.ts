import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import {
  detecteazaFormat, parsePetrom, parseIntelect, finalizeaza, placutaDinNume, EroareFisier, type Sursa,
} from '@/lib/lde/combustibil-fisiere';
import { randuriXls } from '@/lib/lde/combustibil-xls';

// Încărcarea fișierului Petrom (.txt) sau Intelect (.xls) de către Clava (plan 2026-10-08, pasul 3). Route handler sub
// calea ei (middleware: /lde/agreare/**), nu server action: acolo limita e 1 MB, iar Intelect pe o lună are ~0,9 MB.
// Fișierul nu se păstrează; rândurile intră printr-o singură funcție SQL (o tranzacție): lde_fuel_import_aplica.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const MAX = 4 * 1024 * 1024;

const normPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function POST(req: NextRequest) {
  const s = await verifySession();
  if (!s || !['ADMIN', 'CONTABIL_LDE'].includes(s.role)) return NextResponse.json({ error: 'Acces interzis' }, { status: 403 });
  try {
    const form = await req.formData();
    const f = form.get('fisier');
    if (!(f instanceof File)) return NextResponse.json({ error: 'Alege fișierul' }, { status: 400 });
    if (f.size > MAX) return NextResponse.json({ error: 'Fișierul e mai mare de 4 MB — e chiar raportul lunar?' }, { status: 400 });
    const buf = new Uint8Array(await f.arrayBuffer());
    const sursa: Sursa | null = detecteazaFormat(buf);
    const ext = f.name.toLowerCase().split('.').pop();
    if (!sursa || (sursa === 'petrom' && ext !== 'txt') || (sursa === 'intelect' && ext !== 'xls')) {
      return NextResponse.json({ error: 'Nu recunosc fișierul: se încarcă raportul Petrom (.txt) sau raportul Intelect (.xls)' }, { status: 400 });
    }
    const tr = sursa === 'petrom' ? parsePetrom(new TextDecoder('utf-16le').decode(buf)) : parseIntelect(randuriXls(buf));
    const randuri = finalizeaza(tr);
    if (!randuri.length) return NextResponse.json({ error: 'Fișierul nu are nicio alimentare' }, { status: 400 });
    const zile = randuri.map((r) => r.zi_local).sort();

    // propunerea de mașină pe card / portofel, din plăcuța scrisă în nume (Clava confirmă; numele de persoane nu se potrivesc)
    const db = getSupabase();
    const { data: veh, error: ev } = await db.from('vehicles').select('id, plate_number').limit(1000);
    if (ev) throw new Error(ev.message);
    const placi = new Map((veh ?? []).map((v) => [normPlaca(v.plate_number), v.id as string]));
    const portofele = new Map<string, { cod: string; nume_fisier: string; propus_vehicle_id: string | null }>();
    for (const r of randuri) {
      if (portofele.has(r.cod)) continue;
      const prop = placutaDinNume(r.nume_fisier).map((p) => placi.get(p)).find(Boolean) ?? null;
      portofele.set(r.cod, { cod: r.cod, nume_fisier: r.nume_fisier, propus_vehicle_id: prop });
    }

    const { data, error } = await db.rpc('lde_fuel_import_aplica', {
      p: {
        sursa, fisier_nume: f.name.slice(0, 200), sha256: createHash('sha256').update(buf).digest('hex'),
        de: zile[0], pana: zile[zile.length - 1], incarcat_de: s.email,
        portofele: [...portofele.values()],
        randuri: randuri.map((r) => ({
          external_id: r.external_id, cod: r.cod, alimentat_at: r.alimentat_at, zi_local: r.zi_local, litri: r.litri,
          pret: r.pret, reducere: r.reducere, suma: r.suma, statie: r.statie, produs: r.produs, este_dt: r.este_dt,
        })),
      },
    });
    if (error) {
      const msg = /deja încărcat/.test(error.message) ? 'Fișierul acesta e deja încărcat' : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({
      ok: true, sursa, de: zile[0], pana: zile[zile.length - 1], randuri: randuri.length,
      litri_dt: Math.round(randuri.filter((r) => r.este_dt).reduce((a, r) => a + r.litri, 0) * 100) / 100, rezultat: data,
    });
  } catch (e) {
    if (e instanceof EroareFisier) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('combustibil/incarca:', e);
    return NextResponse.json({ error: 'Încărcarea n-a reușit: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
