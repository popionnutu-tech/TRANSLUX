import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { extractCall } from './calls';

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
