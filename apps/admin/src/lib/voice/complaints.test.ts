import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fals Supabase: ține UN rând și înregistrează patch-urile. Interesează două
// invariante, ambele pe rândul deja existent — identificarea găsită nu se
// pierde la un apel ulterior mai sărac, iar alerta pleacă o singură dată.
type Row = { id: string; complaint: string | null; caller_phone: string | null; identified: boolean; alerted: boolean; driver_id?: string | null };
let existing: Row | null = null;
let lastPatch: Record<string, unknown> | null = null;
let inserted: Record<string, unknown> | null = null;

vi.mock('../supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing }) }) }),
      update: (patch: Record<string, unknown>) => { lastPatch = patch; return { eq: async () => ({ error: null }) }; },
      insert: async (row: Record<string, unknown>) => { inserted = row; return { error: null }; },
    }),
  }),
}));

import { saveComplaint, formatComplaintAlert, type ComplaintInput } from './complaints';

const base: ComplaintInput = {
  conversation_id: 'conv_1', caller_phone: '+37360000001', complaint: 'a luat 250 lei în loc de 68',
  trip_date: '2026-09-01', departure: '01:30', route: 'Bălți – Criva',
  driver_id: 'd-1', driver_name: 'Mihai Popescu', plate: 'ABC 123',
  identified: true, evidence: 'plate', final: true,
};

beforeEach(() => { existing = null; lastPatch = null; inserted = null; });

describe('saveComplaint', () => {
  it('scrie rândul nou și cere alerta când cazul e închis', async () => {
    const { shouldAlert } = await saveComplaint(base);
    expect(shouldAlert).toBe(true);
    expect(inserted).toMatchObject({ driver_id: 'd-1', identified: true, alerted: true });
    // `final` e semnal de flux, nu coloană — nu are ce căuta în insert.
    expect(inserted).not.toHaveProperty('final');
  });

  it('nu cere alerta cât timp cazul e deschis', async () => {
    const { shouldAlert } = await saveComplaint({ ...base, identified: false, final: false, driver_id: null, driver_name: null });
    expect(shouldAlert).toBe(false);
    expect(inserted).toMatchObject({ alerted: false });
  });

  it('un apel ulterior fără identificare NU șterge vinovatul găsit', async () => {
    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: '+37360000001', identified: true, alerted: true };
    await saveComplaint({ ...base, identified: false, final: false, driver_id: null, driver_name: null, plate: null, complaint: 'a luat 250 lei' });
    expect(lastPatch).not.toHaveProperty('driver_id');
    expect(lastPatch).not.toHaveProperty('identified');
  });

  it('identificarea nouă suprascrie rândul și cere alerta o singură dată', async () => {
    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: '+37360000001', identified: false, alerted: false };
    const first = await saveComplaint(base);
    expect(first.shouldAlert).toBe(true);
    expect(lastPatch).toMatchObject({ identified: true, driver_id: 'd-1', alerted: true });

    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: '+37360000001', identified: true, alerted: true, driver_id: 'd-1' };
    const second = await saveComplaint(base);
    expect(second.shouldAlert).toBe(false);
    expect(second.alreadyIdentified).toBe(true);
  });

  it('trimite o alertă CORECTIVĂ când vinovatul apare după un caz închis fără el', async () => {
    // Închis ca NEIDENTIFICAT (alerta a plecat), apoi clientul își amintește plăcuța.
    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: null, identified: false, alerted: true };
    const res = await saveComplaint(base);
    expect(res.shouldAlert).toBe(true);
    expect(lastPatch).toMatchObject({ identified: true, driver_id: 'd-1' });
  });

  it('alertează DIN NOU când vinovatul se schimbă pe alt om', async () => {
    // Clientul a dat altă plăcuță: dosarul trece pe alt șofer. Fără alerta nouă,
    // în Telegram ar rămâne numit primul om, iar în bază ar sta al doilea.
    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: null, identified: true, alerted: true, driver_id: 'd-1' };
    const res = await saveComplaint({ ...base, driver_id: 'd-2', driver_name: 'Vasile Rusu' });
    expect(res.shouldAlert).toBe(true);
    expect(res.corrected).toBe(true);
    expect(lastPatch).toMatchObject({ driver_id: 'd-2' });
  });

  it('nu alertează a doua oară pentru ACELAȘI vinovat', async () => {
    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: null, identified: true, alerted: true, driver_id: 'd-1' };
    const res = await saveComplaint(base);
    expect(res.shouldAlert).toBe(false);
  });

  it('detaliul nou se adaugă la textul reclamației, nu îl înlocuiește', async () => {
    existing = { id: 'r1', complaint: 'a luat 250 lei', caller_phone: null, identified: false, alerted: false };
    await saveComplaint({ ...base, complaint: 'a spus că nu merge până la Criva', identified: false, final: false });
    expect(lastPatch?.complaint).toBe('a luat 250 lei | a spus că nu merge până la Criva');
  });
});

describe('formatComplaintAlert', () => {
  it('arată vinovatul când e identificat', () => {
    const text = formatComplaintAlert(base);
    expect(text).toContain('Vinovat: Mihai Popescu · ABC 123');
    expect(text).toContain('Cursa: Bălți – Criva · 01:30 · 2026-09-01');
  });

  it('spune deschis când nu există vinovat', () => {
    const text = formatComplaintAlert({ ...base, identified: false, driver_name: null, plate: null });
    expect(text).toContain('Vinovat: NEIDENTIFICAT');
  });

  it('escapează textul venit de la model', () => {
    const text = formatComplaintAlert({ ...base, complaint: '<b>hack</b>' });
    expect(text).toContain('&lt;b&gt;hack&lt;/b&gt;');
    expect(text).not.toContain('<b>hack');
  });
  it('titlul alertei corectate se distinge de prima', () => {
    expect(formatComplaintAlert(base, true)).toContain('VINOVAT CORECTAT');
    expect(formatComplaintAlert(base)).not.toContain('VINOVAT CORECTAT');
  });
  it('temeiul identificării apare în alertă', () => {
    expect(formatComplaintAlert(base)).toContain('Temei: numărul mașinii');
    expect(formatComplaintAlert({ ...base, evidence: 'trip_only' }))
      .toContain('Temei: DOAR cursa');
    // Fără vinovat nu există temei de arătat.
    expect(formatComplaintAlert({ ...base, identified: false })).not.toContain('Temei:');
  });
});
