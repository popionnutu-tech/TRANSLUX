import { PRAG_INDICATII_KM } from '@/lib/lde/drax-analiza';
import { textCaz, textR1a, TOLERANTA_KM, ziScurt, type CeFaciDrax, type IndicatieMasinaDrax } from '@/lib/lde/drax-ce-faci';

// «Ce faci săptămâna asta» (ION-105): indicațiile în cuvinte deasupra tabelului Drăxlmaier. Textul și cifrele vin din
// lib/lde/drax-ce-faci.ts (funcții pure, testate); aici doar se așază.

const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

function Abatere({ x }: { x: IndicatieMasinaDrax }) {
  if (Math.abs(x.abatere) <= TOLERANTA_KM) return null;
  return <p className={`text-[12px] ${ROSU}`}>Control: cazurile adună {n1(x.kmCazuri)} km, R1b + R3 = {n1(x.R1bR3)} km (diferență {n1(x.abatere)} km).</p>;
}

function Masina({ x }: { x: IndicatieMasinaDrax }) {
  const r1a = textR1a(x);
  return (
    <li className="rounded-[12px] border border-neutral-200 bg-white p-4! dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-2! flex flex-wrap items-baseline gap-x-3">
        <b className="font-mono text-[15px]">{x.m}</b>
        <span className={`font-mono font-bold tabular-nums ${VERDE}`}>−{n0(x.R1bR3)} km/săpt.</span>
        {x.lei != null && <span className="text-[12.5px] text-neutral-500">≈ {n0(x.lei)} lei</span>}
        <span className="text-[12px] text-neutral-500">măsurat {x.zileMasurate} din {x.zileLucrate} zile</span>
        {x.deLamurit && <span className={`text-[11.5px] ${ROSU}`} title={x.deLamurit}>de lămurit: {x.deLamurit}</span>}
      </div>
      <ul className="list-disc! space-y-1.5! pl-5! text-[13.5px] leading-snug">
        {x.cazuri.map((c, i) => <li key={i}>{textCaz(c)}</li>)}
      </ul>
      {r1a && <p className="mt-2! text-[12px] text-neutral-500">{r1a}</p>}
      <Abatere x={x} />
    </li>
  );
}

export default function CeFaciDraxSectiune({ c }: { c: CeFaciDrax }) {
  const pesteKm = c.pestePrag.reduce((s, x) => s + x.kmCazuri, 0);
  return (
    <section className="mt-9!">
      <h2 className="mb-1! text-xs font-bold uppercase tracking-widest text-neutral-500">
        Ce faci săptămâna asta · {c.pestePrag.length} {c.pestePrag.length === 1 ? 'mașină' : 'mașini'} peste {PRAG_INDICATII_KM} km/săpt.
      </h2>
      <p className="mb-3! text-[12.5px] text-neutral-500">
        Unde pleacă mașina acasă între curse și unde ar trebui să aștepte în loc. Km-ii sunt pe săptămână, extrapolați pe zilele lucrate.
        {' '}Peste prag {n0(pesteKm)} km + sub prag sau măsurate sub 3 zile {n0(c.subPrag.km)} km ({c.subPrag.masini} mașini, în tabel) = {n0(c.total)} km
        {Math.abs(c.abatereCard) <= TOLERANTA_KM
          ? <> = cardul «se poate tăia cu o dispoziție».</>
          : <b className={ROSU}> ≠ cardul {n0(c.card)} km (diferență {n1(c.abatereCard)} km).</b>}
      </p>
      {c.pestePrag.length
        ? <ol className="space-y-3!">{c.pestePrag.map((x) => <Masina key={x.m} x={x} />)}</ol>
        : <p className="text-[13px] text-neutral-500">Nicio mașină peste prag săptămâna asta.</p>}
    </section>
  );
}

/** în rândul deschis al tabelului: aceleași cazuri, zi cu zi */
export function CazuriZiCuZi({ x }: { x: IndicatieMasinaDrax }) {
  if (!x.cazuri.length) return null;
  return (
    <div className="mb-3! space-y-2! text-[12.5px]">
      <b>Ce faci (R1b + R3, {n0(x.kmCazuri)} km/săpt.):</b>
      {x.cazuri.map((c, i) => (
        <div key={i}>
          <p>{textCaz(c)}</p>
          <p className="font-mono text-[11.5px] text-neutral-500">
            {c.zile.map((d) => `${ziScurt(d.z)} ${d.ora} · ${n1(d.km)} km`).join('  ·  ')}
          </p>
        </div>
      ))}
      <Abatere x={x} />
    </div>
  );
}
