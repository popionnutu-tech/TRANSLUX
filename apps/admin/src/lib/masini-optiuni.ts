import type { SSOption } from '@/components/SearchSelect';

// Numărul de înmatriculare se scrie în două feluri: „GHT553" și „553 GHT". În 1C sunt cu cifrele în față,
// la noi unele sunt invers, iar oamenii tastează cum văd pe mașină sau pe hârtie.
//
// Cerut de Mariana (09.10): «Eduard introduce numărul și apoi seria, pe când la noi e invers — fă cumva
// ca el să aleagă numărul și să-i iasă tot ce coincide cu acel număr, apoi alege care unitate îi trebuie».
//
// De aceea textul după care se CAUTĂ conține ambele ordini, iar cel afișat rămâne cel real. Tastând „553"
// ies toate mașinile care au 553 oriunde în număr, indiferent cum e scris.
const invers = (p: string) => {
  let m = /^([A-Z]+)(\d+)$/.exec(p);
  if (m) return m[2] + m[1];
  m = /^(\d+)([A-Z]+)$/.exec(p);
  return m ? m[2] + m[1] : '';
};

export function optiuniMasini(masini: { id: number; label: string }[]): SSOption[] {
  return masini.map((v) => {
    const p = (v.label || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const alt = invers(p);
    return { id: v.id, label: v.label, search: [v.label, p, alt].filter(Boolean).join(' ').toLowerCase() };
  });
}
