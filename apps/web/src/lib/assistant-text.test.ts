import { describe, expect, it } from 'vitest';
import { parseAssistantText, parseInline } from './assistant-text';

describe('assistant-text', () => {
  it('îngroșat, text și telefon clicabil', () => {
    expect(parseInline('Cursa de **07:30**, șoferul: 069 123 456.')).toEqual([
      { kind: 'text', text: 'Cursa de ' },
      { kind: 'bold', text: '07:30' },
      { kind: 'text', text: ', șoferul: ' },
      { kind: 'tel', href: 'tel:+37369123456', label: '069 123 456' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('linkul de hartă singur pe rând devine buton', () => {
    const g = 'https://www.google.com/maps/search/?api=1&query=Calea%20Mo%C8%99ilor';
    const w = 'https://waze.com/ul?q=Calea%20Mo%C8%99ilor&navigate=yes';
    expect(parseAssistantText(`Adresa: str. Calea Moșilor 2/a\nGoogle Maps: ${g}\n- Waze: ${w}`)).toEqual([
      { kind: 'para', parts: [{ kind: 'text', text: 'Adresa: str. Calea Moșilor 2/a' }] },
      { kind: 'map', provider: 'google', href: g },
      { kind: 'map', provider: 'waze', href: w },
    ]);
  });

  it('doar https devine link — javascript: rămâne text', () => {
    const parts = parseInline('vezi javascript:alert(1) și http://x.md');
    expect(parts.every((p) => p.kind === 'text')).toBe(true);
  });

  it('liste cu «- »', () => {
    expect(parseAssistantText('- **06:00**\n- **07:30**').map((b) => b.kind)).toEqual(['bullet', 'bullet']);
  });
});
