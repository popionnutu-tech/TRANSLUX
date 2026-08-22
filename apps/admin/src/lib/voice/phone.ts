// Ambele capete (scriere post-call, citire init) trec prin ACEEASI normalizare
// — altfel memoria limbii ar putea sa nu se gaseasca niciodata, in tacere.
// Portat din TLX (lib/voice/requests.ts normalizePhone).
export function normalizePhone(raw: string | null): string {
  const s = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  if (s.startsWith('373')) return `+${s}`;
  if (s.startsWith('0') && s.length === 9) return `+373${s.slice(1)}`;
  return s;
}
