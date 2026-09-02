'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import {
  CULPRITS, FALLBACK_CODE, TYPES_MARKER_RO, TYPES_MARKER_RU, TYPES_END,
  type ComplaintType, type Culprit,
} from '@/lib/voice/complaint-types';
import { TOATE_MARKERELE } from '@/lib/voice/prompt-markers';

// Nomenclatorul tipurilor de reclamații (migr. 310). Ion, 02.09: lista trăiește
// în bază, nu în cod, ca un tip nou să nu ceară deploy.
//
// Agentul vocal citește lista din promptul lui, iar controlerul o rescrie acolo
// din tabela asta la fiecare rulare. Deci o schimbare făcută aici ajunge la
// agent după următoarea rulare a controlerului, nu instantaneu — ecranul o spune.

const CALE = '/reclamatii-tipuri';
const LUNGIME_MAX = 120;

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Denumirile ajung VERBATIM în system prompt-ul ambilor agenți vocali.
 *
 * Trei feluri de rău, toate tăcute:
 *  - un rând nou rupe lista în două și lasă o linie fără cod;
 *  - un nume care poartă reperele blocului face ca tăietura să cadă în mijlocul
 *    listei: coada veche rămâne orfană, sincronizarea nu mai converge niciodată,
 *    iar controlerul face PATCH la fiecare rulare, de zeci de ori pe zi;
 *  - un nume care poartă markerul ALTUI bloc îl face pe controler să creadă
 *    blocul viu — inclusiv blocul care interzice numirea vinovatului, care putea
 *    fi apoi șters din dashboard fără ca cineva să afle (security 02.09).
 */
function verificaNume(name_ro: string, name_ru: string) {
  const interzise = [TYPES_MARKER_RO, TYPES_MARKER_RU, TYPES_END, ...TOATE_MARKERELE];
  for (const nume of [name_ro, name_ru]) {
    if (nume.length > LUNGIME_MAX) {
      throw new Error(`Denumirea nu poate depăși ${LUNGIME_MAX} de caractere.`);
    }
    // Caracterele de control se verifică pe COD, nu cu un interval scris literal:
    // într-un fișier, intervalul lor e invizibil și ușor de stricat la o editare.
    const areControl = [...nume].some((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c < 0x20 || c === 0x7f;
    });
    if (areControl) {
      throw new Error('Denumirea trebuie să fie pe un singur rând, fără caractere de control.');
    }
    if (interzise.some((s) => nume.includes(s))) {
      throw new Error('Denumirea nu poate conține titlul unei secțiuni din promptul agentului.');
    }
  }
}

export async function getComplaintTypes(): Promise<ComplaintType[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('complaint_types')
    .select('code, ord, name_ro, name_ru, culprit, note, active')
    // Aceeași ordonare ca la citirea pentru prompt: două tipuri cu același `ord`
    // n-au voie să sară de la o deschidere la alta.
    .order('ord').order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as ComplaintType[];
}

export async function createComplaintType(input: {
  code: string;
  ord: number;
  name_ro: string;
  name_ru: string;
  culprit: Culprit;
  note?: string;
}) {
  requireRole(await verifySession(), 'ADMIN');
  const code = normalizeCode(input.code);
  if (!code) throw new Error('Codul e obligatoriu.');
  if (code.length > LUNGIME_MAX) throw new Error('Codul e prea lung.');
  const name_ro = input.name_ro.trim();
  const name_ru = input.name_ru.trim();
  // Ambele nume sunt obligatorii: lista pleacă în DOUĂ prompturi, unul românesc
  // și unul rusesc. Un nume gol ar lăsa agentul RU cu un cod fără înțeles.
  if (!name_ro || !name_ru) throw new Error('Denumirea în română și în rusă sunt obligatorii.');
  if (!CULPRITS.includes(input.culprit)) throw new Error('Vinovat necunoscut.');
  verificaNume(name_ro, name_ru);
  const { error } = await getSupabase().from('complaint_types').insert({
    code,
    ord: Number.isFinite(input.ord) ? input.ord : 50,
    name_ro,
    name_ru,
    culprit: input.culprit,
    note: input.note?.trim() || null,
  });
  if (error) {
    // Cod deja folosit: mesaj de om, nu textul bazei.
    if (error.code === '23505') throw new Error(`Codul ${code} există deja.`);
    throw new Error(error.message);
  }
  revalidatePath(CALE);
}

export async function updateComplaintType(code: string, input: {
  ord: number;
  name_ro: string;
  name_ru: string;
  culprit: Culprit;
  note?: string;
}) {
  requireRole(await verifySession(), 'ADMIN');
  const name_ro = input.name_ro.trim();
  const name_ru = input.name_ru.trim();
  if (!name_ro || !name_ru) throw new Error('Denumirea în română și în rusă sunt obligatorii.');
  if (!CULPRITS.includes(input.culprit)) throw new Error('Vinovat necunoscut.');
  verificaNume(name_ro, name_ru);
  const { data, error } = await getSupabase().from('complaint_types').update({
    ord: Number.isFinite(input.ord) ? input.ord : 50,
    name_ro,
    name_ru,
    culprit: input.culprit,
    note: input.note?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('code', code).select('code');
  if (error) throw new Error(error.message);
  // Zero rânduri atinse: codul nu există. Fără verificarea asta, ecranul spunea
  // «salvat» peste o bază neschimbată (security L2, 02.09).
  if (!data || data.length === 0) throw new Error(`Tipul ${code} nu există.`);
  revalidatePath(CALE);
}

export async function toggleComplaintType(code: string, active: boolean) {
  requireRole(await verifySession(), 'ADMIN');
  // ALTUL nu se stinge: e coșul în care cade orice cod necunoscut. Stins, fiecare
  // reclamație neîncadrată ar rămâne fără tip, iar raportul ar arăta un gol.
  if (code === FALLBACK_CODE && !active) {
    throw new Error('Tipul ALTUL nu se poate dezactiva: acolo cad reclamațiile care nu intră în listă.');
  }
  const { data, error } = await getSupabase()
    .from('complaint_types')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('code', code)
    .select('code');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(`Tipul ${code} nu există.`);
  revalidatePath(CALE);
}
