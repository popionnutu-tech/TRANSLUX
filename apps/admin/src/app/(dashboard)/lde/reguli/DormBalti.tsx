import type { AnalizaDrax } from '@/lib/lde/drax-analiza';
import { dormBalti, INTRO_BALTI, textBalti } from '@/lib/lde/drax-balti';

// «Dorm în Bălți — livrarea de analizat» (ION-109, §7.4 / §12.1): bloc separat de «Ce faci» — nu e indicație pentru dispecer.
// Textul vine din lib/lde/drax-balti.ts (funcții pure, testate); aici doar se așază.
const TITLU = 'mb-1! text-xs font-bold uppercase tracking-widest text-neutral-500';

export default function DormBalti({ a }: { a: AnalizaDrax }) {
  const r = dormBalti(a);
  if (!r.length) return null;
  return (
    <section className="mt-9!">
      <h2 className={TITLU}>Dorm în Bălți · livrarea de analizat</h2>
      <p className="mb-3! text-[14px] leading-snug">{INTRO_BALTI}</p>
      <ol className="space-y-2! text-[14px] leading-snug">{r.map((x) => <li key={x.m}>{textBalti(x)}</li>)}</ol>
    </section>
  );
}
