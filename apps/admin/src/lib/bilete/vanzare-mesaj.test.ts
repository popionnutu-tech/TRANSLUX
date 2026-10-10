import { describe, expect, it } from 'vitest';
import { mesajVanzare, type ComandaVanduta } from './vanzare-mesaj';

const baza: ComandaVanduta = {
  from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-11T03:30:00Z', seats: 1, total: 135,
  passenger_name: 'Ion <Pop>', phone: '37369000000', reducere_tip: null, reducere_pct: null, telegram_id: null,
  locuri_alese: null, punct_urcare_nume_ro: null,
};

describe('mesajVanzare', () => {
  it('o comandă de pe site: ruta, ora Chișinăului, suma, clientul scăpat HTML', () => {
    const m = mesajVanzare([baza]);
    expect(m).toContain('Bilet vândut · 135 lei');
    expect(m).toContain('Briceni → Chișinău, 11.10, 06:30');
    expect(m).toContain('1 loc · 135 lei');
    expect(m).toContain('Ion &lt;Pop&gt; · +37369000000 · site');
  });

  it('tur + retur din pachet într-un mesaj, cu reducerea, locurile și Telegram', () => {
    const retur = { ...baza, from_name: 'Chișinău', to_name: 'Briceni', departure_at: '2026-10-12T14:00:00Z', total: 108, reducere_tip: 'retur', reducere_pct: 20 };
    const m = mesajVanzare([{ ...baza, seats: 2, total: 270, locuri_alese: [3, 4], telegram_id: 5, punct_urcare_nume_ro: 'Gara' }, retur]);
    expect(m).toContain('tur + retur) · 378 lei');
    expect(m).toContain('2 locuri · loc 3, 4 · 270 lei');
    expect(m).toContain('108 lei · retur −20%');
    expect(m).toContain('Urcare: Gara');
    expect(m).toContain('· Telegram');
  });
});
