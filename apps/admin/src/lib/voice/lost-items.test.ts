import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { formatLostItemForAdmins } from './lost-items';

const obiect = {
  trip_date: '2026-09-14', departure: '07:30', route: 'Chișinău–Criva',
  driver_name: 'Sergiu', plate: 'ABC 123',
  identified: true, phone_withheld: false, caller_name: 'Svetlana',
};

describe('formatLostItemForAdmins', () => {
  it('duce la birou numărul clientului, șoferul și numele', () => {
    const t = formatLostItemForAdmins(obiect, '+37360000000', true);
    expect(t).toContain('Lucru uitat (agent vocal)');
    expect(t).toContain('+37360000000');
    expect(t).toContain('Sergiu · ABC 123');
    expect(t).toContain('Clientul: Svetlana');
    expect(t).toContain('clientul are numărul și sună direct');
  });

  it('spune limpede când obiectul se predă la birou', () => {
    const t = formatLostItemForAdmins({ ...obiect, phone_withheld: true }, '+37360000000', true);
    expect(t).toContain('se predă LA BIROU');
  });

  it('arată cursa neidentificată', () => {
    const t = formatLostItemForAdmins({ ...obiect, identified: false }, null, true);
    expect(t).toContain('Cursă neidentificată');
    expect(t).toContain('necunoscut');
  });

  it('semnalează numele neculeș — e o abatere a agentului', () => {
    const t = formatLostItemForAdmins({ ...obiect, caller_name: '  ' }, '+373', true);
    expect(t).toContain('Numele clientului NU a fost cules');
  });

  it('cere legarea grupei doar când grupa lipsește', () => {
    expect(formatLostItemForAdmins(obiect, '+373', false)).toContain('/lega_reclamatii');
    expect(formatLostItemForAdmins(obiect, '+373', true)).not.toContain('/lega_reclamatii');
  });

  it('escapează numele și numărul', () => {
    const t = formatLostItemForAdmins({ ...obiect, caller_name: 'Ana & <b>Co</b>' }, '<i>+373</i>', true);
    expect(t).toContain('Ana &amp; &lt;b&gt;Co&lt;/b&gt;');
    expect(t).not.toContain('<b>Co</b>');
    expect(t).toContain('&lt;i&gt;+373&lt;/i&gt;');
  });
});
