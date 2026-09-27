import { TOLERANTA_KM, type IndicatieMasinaDrax } from '@/lib/lde/drax-ce-faci';
import {
  frazaMasina, intrebareSeara, orePeZile, sectiuneaDeSus, textDoarMici, textNemasurate, type PaginaCeFaciDrax,
} from '@/lib/lde/drax-ce-faci-text';
import { schimbPublicat, textLant, textLeiLant, textStarePlan } from '@/lib/lde/drax-plan-schimb';
import type { PlanSchimbDrax } from '@/lib/lde/drax-analiza';

// «Ce faci săptămâna asta» și «Planul de schimb» (ION-105, ION-107, ION-108): costul de azi pe GPS (dimineață / seară), ce se
// face, estimarea o singură dată, întrebarea de seară o singură dată, o frază pe mașină; schimbul de linii doar în secțiunea lui.
// Textul și cifrele vin din lib/lde (funcții pure, testate); aici doar se așază.

const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const TITLU = 'mb-1! text-xs font-bold uppercase tracking-widest text-neutral-500';

function Masina({ x, plan }: { x: IndicatieMasinaDrax; plan: PlanSchimbDrax | null }) {
  const ore = orePeZile(x);
  return (
    <li className="rounded-[12px] border border-neutral-200 bg-white p-4! text-[13.5px] leading-snug dark:border-neutral-700 dark:bg-neutral-900">
      <p>{frazaMasina(x, plan)}</p>
      {x.deLamurit && <p className={`mt-1! text-[12px] ${ROSU}`}>De lămurit: {x.deLamurit}</p>}
      {ore.length > 0 && (
        <details className="mt-2! text-[12px] text-neutral-500">
          <summary className="cursor-pointer">orele, zi cu zi</summary>
          <ul className="mt-1! space-y-0.5! pl-4!">{ore.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </details>
      )}
      {Math.abs(x.abatere) > TOLERANTA_KM && (
        <p className={`mt-1! text-[12px] ${ROSU}`}>Control: zilele adună {n1(x.kmCazuri)} km, tabelul are {n1(x.kmSapt)} km (diferență {n1(x.abatere)} km).</p>
      )}
    </li>
  );
}

function PlanSchimb({ p }: { p: PaginaCeFaciDrax }) {
  const publicat = schimbPublicat(p.plan);
  return (
    <>
      <p className={`mb-2! text-[13.5px] ${publicat ? '' : 'text-neutral-500'}`}>{textStarePlan(p.stare)}</p>
      {publicat && (
        <ol className="list-decimal! space-y-1! pl-5! text-[13px] leading-snug">
          {p.plan!.schimb.lanturi.map((l, i) => {
            const lei = textLeiLant(l);
            return <li key={i}>{textLant(l)}{lei && <span className={`ml-1! ${VERDE}`}>{lei}</span>}</li>;
          })}
        </ol>
      )}
    </>
  );
}

export default function CeFaciDraxSectiune({ p }: { p: PaginaCeFaciDrax }) {
  const { c, plan } = p;
  const intrebare = intrebareSeara(c, plan);
  const note = [textDoarMici(c), textNemasurate(c, plan)].filter((t): t is string => !!t);
  return (
    <section className="mt-9!">
      <h2 className={TITLU}>Ce faci săptămâna asta</h2>
      <div className="mb-3! space-y-1! text-[14px] leading-snug">{sectiuneaDeSus(c, plan).map((r, i) => <p key={i}>{r}</p>)}</div>
      {intrebare && <p className="mb-3! rounded-[12px] border border-[#9B1B30]/30 p-3! text-[13.5px]">{intrebare}</p>}
      {c.deAratat.length > 0 && <ol className="space-y-2!">{c.deAratat.map((x) => <Masina key={x.m} x={x} plan={plan} />)}</ol>}
      {note.map((t, i) => <p key={i} className="mt-2! text-[12.5px] text-neutral-500">{t}</p>)}
      {Math.abs(c.abatereCard) > TOLERANTA_KM && (
        <p className={`mt-1! text-[12px] ${ROSU}`}>Control: mașinile adună {n0(c.total)} km, tabelul are {n0(c.card)} km (diferență {n1(c.abatereCard)} km).</p>
      )}

      <h2 className={`${TITLU} mt-7!`}>Planul de schimb · plus mic, după ce mașinile stau parcate între curse</h2>
      <PlanSchimb p={p} />
    </section>
  );
}
