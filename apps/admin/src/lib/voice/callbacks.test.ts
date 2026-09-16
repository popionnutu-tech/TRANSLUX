import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { formatCallbackAlert } from './callbacks';

describe('formatCallbackAlert', () => {
  it('экранирует опасные символы в motiv', () => {
    const text = formatCallbackAlert(
      { conversation_id: 'c1', caller_phone: '+37360000001', reason: '<x>' },
      null,
    );
    expect(text).toContain('&lt;x&gt;');
    expect(text).not.toContain('<x>');
  });

  it('содержит telefonul apelantului', () => {
    const text = formatCallbackAlert(
      { conversation_id: 'c1', caller_phone: '+37360000001', reason: 'test' },
      null,
    );
    expect(text).toContain('+37360000001');
  });

  it('omite linia Nume: cînd numele este null', () => {
    const text = formatCallbackAlert(
      { conversation_id: 'c1', caller_phone: '+37360000001', reason: 'test' },
      null,
    );
    expect(text).not.toContain('Nume:');
  });

  it('include linia Nume: cînd numele este prezent', () => {
    const text = formatCallbackAlert(
      { conversation_id: 'c1', caller_phone: '+37360000001', reason: 'test' },
      'Ion',
    );
    expect(text).toContain('Nume: Ion');
  });
});

describe('formatCallbackAlert după 16.09', () => {
  it('nu mai anunță o «cerere de apel înapoi» — nimeni nu sună pe nimeni', () => {
    const t = formatCallbackAlert({ conversation_id: 'c1', caller_phone: '+37360000000', reason: 'Angajare: șofer' }, null);
    expect(t).toContain('Solicitare notată (agent vocal)');
    expect(t).not.toContain('apel înapoi');
    expect(t).toContain('+37360000000');
    expect(t).toContain('Angajare: șofer');
  });
});
