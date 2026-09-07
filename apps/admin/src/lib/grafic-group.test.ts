import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ getSupabase: () => ({ from: vi.fn() }) }));

import { ziuaRo, graficGroupCaption } from './grafic-group';

describe('grafic-group', () => {
  it('ziuaRo: ziua săptămânii din data calendaristică, fără fus orar', () => {
    expect(ziuaRo('2026-09-08')).toBe('marți, 08.09.2026');
    expect(ziuaRo('2026-09-06')).toBe('duminică, 06.09.2026');
    expect(ziuaRo('2026-01-01')).toBe('joi, 01.01.2026');
  });

  it('caption: ziua + numărul de curse, fără mențiunea de corectare la prima trimitere', () => {
    const c = graficGroupCaption('2026-09-08', 27, false);
    expect(c).toContain('marți, 08.09.2026');
    expect(c).toContain('27 curse');
    expect(c).not.toContain('corectat');
  });

  it('caption: retrimiterea spune limpede că înlocuiește imaginea de mai devreme', () => {
    const c = graficGroupCaption('2026-09-08', 1, true);
    expect(c).toContain('1 cursă');
    expect(c).toContain('Grafic corectat');
  });
});
