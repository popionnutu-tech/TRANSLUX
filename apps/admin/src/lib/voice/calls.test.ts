import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { extractCall, formatCallReport } from './calls';

const payload = {
  type: 'post_call_transcription',
  data: {
    conversation_id: 'conv_1',
    status: 'done',
    transcript: [{ role: 'agent', message: 'Bună ziua!' }],
    metadata: { call_duration_secs: 95, cost: 123, phone_call: { external_number: '+37360000000' } },
    analysis: { transcript_summary: 'Client a întrebat orarul.', call_successful: 'success' },
  },
};

describe('extractCall', () => {
  it('извлекает ключевые поля', () => {
    const row = extractCall(payload);
    expect(row.conversation_id).toBe('conv_1');
    expect(row.caller_phone).toBe('+37360000000');
    expect(row.summary).toBe('Client a întrebat orarul.');
    expect(row.duration_secs).toBe(95);
    expect(row.status).toBe('done');
  });

  it('не падает на пустом payload', () => {
    const row = extractCall({ data: { conversation_id: 'c2' } });
    expect(row.conversation_id).toBe('c2');
    expect(row.caller_phone).toBeNull();
  });
});

describe('formatCallReport', () => {
  it('содержит телефон, длительность и summary', () => {
    const text = formatCallReport(extractCall(payload), false);
    expect(text).toContain('+37360000000');
    expect(text).toContain('Client a întrebat orarul.');
    expect(text).toContain('1 min 35 s');
  });

  it('помечает, если callback-алерт уже был отправлен', () => {
    const text = formatCallReport(extractCall(payload), true);
    expect(text).toContain('cerere de apel înapoi');
  });

  it('экранирует HTML-символы в summary и телефоне', () => {
    const rowWithUnsafeText = {
      conversation_id: 'conv_2',
      direction: 'in' as const,
      caller_phone: '+373<script>alert(1)</script>',
      transcript: null,
      summary: 'Client a cerut & info despre <b>ofertă</b>',
      analysis: null,
      duration_secs: 60,
      cost: 50,
      status: 'done',
    };
    const text = formatCallReport(rowWithUnsafeText, false);
    // Проверяем, что опасные символы экранированы
    expect(text).toContain('&lt;script&gt;');
    expect(text).not.toContain('<script>');
    expect(text).toContain('&amp;');
    expect(text).toContain('&lt;b&gt;');
    expect(text).not.toContain('<b>ofertă</b>');
  });
  it('arată vinovatul reclamației în raportul apelului', () => {
    const row = {
      conversation_id: 'conv_3', direction: 'in' as const, caller_phone: '+37360000001',
      transcript: null, summary: 'Reclamație', analysis: null, duration_secs: 110, cost: 50, status: 'done',
    };
    expect(formatCallReport(row, false, { identified: true, driver_name: 'Mihai Popescu', plate: 'ABC 123' }))
      .toContain('vinovat: Mihai Popescu · ABC 123');
    expect(formatCallReport(row, false, { identified: false, driver_name: null, plate: null }))
      .toContain('vinovat NEIDENTIFICAT');
    // Apel fără reclamație — raportul rămâne cum era.
    expect(formatCallReport(row, false)).not.toContain('Reclamație înregistrată');
  });
});
