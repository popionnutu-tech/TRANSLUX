'use server';

import { autorFor, auditWrite } from '@/lib/audit';

import { createSale, cecVanzare } from '@/lib/piese-ops';
import { issueShortages } from '@/lib/piese';
import { requirePieseIssue, canSeeCost, assertWarehouseAllowed, canOverrideStock } from '@/lib/piese-access';

export async function submitSale(payload: { warehouse_id: number; client_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_price: number }[]; allow_short?: boolean; plata?: string; incasat?: number | null }) {
  const session = await requirePieseIssue();
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate vinde din alt depozit
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  // Dreptul de a vinde peste stoc e al aceleiași perechi ca la eliberări și mutări: ADMIN și GESTIONAR.
  // Vânzătorul NU poate — el e tocmai cel care ar fi tentat s-o facă, ca să nu piardă clientul.
  // `=== true`, nu truthy: acordul vine de la client, deci se acceptă doar forma exactă.
  if (payload.allow_short === true && !(await canOverrideStock(session))) {
    await auditWrite({
      adminId: session.id, action: 'SALE_SHORT_DENIED', entity: 'sale',
      after: { depozit: Number(payload.warehouse_id), pozitii: lines.length },
      notes: 'Cerere de vânzare peste stoc, refuzată — rol fără drept',
    });
    throw new Error('Nu ai dreptul să vinzi peste stoc. Cheamă gestionarul sau administratorul.');
  }

  let res: Awaited<ReturnType<typeof createSale>>;
  try {
    res = await createSale({ ...payload, lines, userId: session.id },
      await autorFor(session.id), payload.allow_short === true,
      payload.plata || 'NUMERAR', payload.incasat ?? null);
  } catch (e: any) {
    const msg = (e?.message || '').trim();
    if (msg === 'INCASAT_PREA_MIC') throw new Error('Suma primită e mai mică decât totalul de plată.');
    if (msg !== 'SHORTAGE') throw e;
    // Nu s-a scris nimic — baza a anulat tot. Omul vede ce lipsește și decide.
    try {
      return { ok: false as const, shortages: await issueShortages(payload.warehouse_id, lines) };
    } catch {
      throw new Error('Nu ajunge marfa în magazin, iar detaliile nu s-au putut încărca. Reîncearcă.');
    }
  }
  // Vânzătorul nu primește cost/profit nici în răspunsul vânzării (ar fi vizibile în Network tab) — doar docId + total.
  if (!canSeeCost(session.role)) return { ok: true as const, docId: res.docId, total: res.total, plata: res.plata, rest: res.rest };
  return { ok: true as const, ...res };
}

// Conținutul cecului unei vânzări (migr. 373-374), pentru tipărire imediat după emitere.
export async function incarcaCec(docId: number) {
  const session = await requirePieseIssue();
  const cec = await cecVanzare(Number(docId));
  // Garda de depozit: un vânzător legat de un depozit n-are de ce să vadă cecurile altuia.
  await assertWarehouseAllowed(session, cec.warehouse_id);
  return cec;
}
