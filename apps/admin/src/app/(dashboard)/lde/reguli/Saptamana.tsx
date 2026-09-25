'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Selectorul de săptămână al raportului, același pe toate uzinele (ION-68). Săptămâna se alege prin
// URL (?saptamina=), ca linkul către o săptămână să se poată trimite. `baza` păstrează uzina
// («/lde/reguli?uz=sebn&») — fără ea săgețile de la Florești duceau la LEAR Ungheni.
// Lista vine de la cea mai nouă la cea mai veche: ‹ duce înapoi în timp, › înainte.
export default function Saptamana({ baza, activa, eticheta, optiuni }: {
  baza: string; activa: string; eticheta: string; optiuni: { v: string; e: string }[];
}) {
  const router = useRouter();
  const i = optiuni.findIndex((o) => o.v === activa);
  const mai_veche = i >= 0 ? optiuni[i + 1]?.v : undefined;
  const mai_noua = i > 0 ? optiuni[i - 1].v : undefined;
  const sageata = (s: string | undefined, semn: string, et: string) => s
    ? <Link href={`${baza}saptamina=${s}`} scroll={false} aria-label={et}
        className="flex h-9 w-9 items-center justify-center text-lg text-neutral-600 hover:bg-[#9B1B30]/[0.06] hover:text-[#9B1B30] dark:text-neutral-300">{semn}</Link>
    : <span className="flex h-9 w-9 items-center justify-center text-lg text-neutral-300 dark:text-neutral-600" aria-hidden>{semn}</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center overflow-hidden rounded-[8px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {sageata(mai_veche, '‹', 'săptămâna dinainte')}
        <span className="min-w-[170px] border-x border-neutral-200 px-3! text-center text-[13.5px] font-semibold leading-9 dark:border-neutral-700">
          {eticheta}
        </span>
        {sageata(mai_noua, '›', 'săptămâna următoare')}
      </div>
      {optiuni.length > 1 && (
        <select value={activa} onChange={(e) => router.push(`${baza}saptamina=${e.target.value}`, { scroll: false })}
          aria-label="Alege săptămâna"
          style={{ width: 'auto', fontStyle: 'normal', padding: '0 10px', color: 'inherit', borderRadius: 8 }}
          className="h-9 rounded-[8px] border border-neutral-200 bg-white px-2! text-[12.5px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          {optiuni.map((o) => <option key={o.v} value={o.v}>{o.e}</option>)}
        </select>
      )}
    </div>
  );
}
