import { PRAG_INDICATII_KM } from '@/lib/lde/drax-analiza';
import {
  durata, PRAG_ASTEPTARE_MIN, PRAG_KM_ZI, textCaz, textR1a, TOLERANTA_KM, ziScurt,
  type CeFaciDrax, type IndicatieMasinaDrax, type VerdictCazDrax,
} from '@/lib/lde/drax-ce-faci';

// «Ce faci săptămâna asta» (ION-105, ION-107): indicațiile în cuvinte deasupra tabelului Drăxlmaier. Textul, verdictul și cifrele
// vin din lib/lde/drax-ce-faci.ts (funcții pure, testate); aici doar se așază.

const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
export const NUME_VERDICT: Record<VerdictCazDrax, string> = {
  realist: 'indicație', schimb: 'candidat de schimb de linii', mic: 'mic, sub prag',
};

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
        <span className={`font-mono font-bold tabular-nums ${VERDE}`}>−{n0(x.km.realist)} km/săpt.</span>
        {x.lei != null && <span className="text-[12.5px] text-neutral-500">≈ {n0(x.lei)} lei</span>}
        <span className="text-[12px] text-neutral-500">măsurat {x.zileMasurate} din {x.zileLucrate} zile · R1b + R3 {n0(x.R1bR3)} km</span>
        {x.deLamurit && <span className={`text-[11.5px] ${ROSU}`} title={x.deLamurit}>de lămurit: {x.deLamurit}</span>}
      </div>
      <ul className="list-disc! space-y-1.5! pl-5! text-[13.5px] leading-snug">
        {x.cazuri.filter((c) => c.verdict === 'realist').map((c, i) => <li key={i}>{textCaz(c)}</li>)}
      </ul>
      {r1a && <p className="mt-2! text-[12px] text-neutral-500">{r1a}</p>}
      <Abatere x={x} />
    </li>
  );
}

export default function CeFaciDraxSectiune({ c }: { c: CeFaciDrax }) {
  const egal = Math.abs(c.abatereCard) <= TOLERANTA_KM;
  return (
    <section className="mt-9!">
      <h2 className="mb-1! text-xs font-bold uppercase tracking-widest text-neutral-500">
        Ce faci săptămâna asta · {c.cuIndicatie.length} {c.cuIndicatie.length === 1 ? 'mașină' : 'mașini'} cu indicație
      </h2>
      <p className="mb-3! text-[12.5px] text-neutral-500">
        Indicație = mașina ar aștepta cel mult {durata(PRAG_ASTEPTARE_MIN)} și se taie cel puțin {PRAG_KM_ZI} km/zi; pragul mașinii rămâne {PRAG_INDICATII_KM} km/săpt.
        {' '}Km-ii sunt pe săptămână, extrapolați pe zilele lucrate. Realist {n0(c.km.realist)} + candidați de schimb de linii {n0(c.km.schimb)}
        {' '}+ mici, sub prag {n0(c.km.mic)}
        {Math.abs(c.neexplicat) > TOLERANTA_KM && <b className={ROSU}> + fără bucăți care să-i explice {n0(c.neexplicat)}</b>}
        {' '}= {n0(c.total)} km
        {egal ? <> = cardul «se poate tăia cu o dispoziție».</> : <b className={ROSU}> ≠ cardul {n0(c.card)} km (diferență {n1(c.abatereCard)} km).</b>}
      </p>
      {c.cuIndicatie.length
        ? <ol className="space-y-3!">{c.cuIndicatie.map((x) => <Masina key={x.m} x={x} />)}</ol>
        : <p className="text-[13px] text-neutral-500">Nicio indicație realistă săptămâna asta.</p>}

      <h3 className="mb-1! mt-6! text-xs font-bold uppercase tracking-widest text-neutral-500">
        Candidați de schimb de linii · {c.candidatiSchimb.length} · {n0(c.km.schimb)} km/săpt.
      </h3>
      <p className="mb-2! text-[12.5px] text-neutral-500">
        Așteptarea ar fi peste {durata(PRAG_ASTEPTARE_MIN)}: nu e o dispoziție «să aștepte». Mașina face linii în capete diferite; câștigul vine din repartizarea liniilor între mașini.
      </p>
      {c.candidatiSchimb.length > 0 && (
        <ul className="space-y-1.5! text-[13px] leading-snug">
          {c.candidatiSchimb.map(({ m, caz }, i) => <li key={i}><b className="font-mono">{m}</b> — {textCaz(caz)}</li>)}
        </ul>
      )}
      <p className="mt-4! text-[12.5px] text-neutral-500">
        Mici, sub prag: {n0(c.km.mic)} km/săpt. — ocoluri sub {PRAG_KM_ZI} km/zi și mașinile sub {PRAG_INDICATII_KM} km/săpt. (în tabel, zi cu zi).
      </p>
    </section>
  );
}

/** în rândul deschis al tabelului: toate cazurile mașinii, cu verdictul și așteptarea zi cu zi */
export function CazuriZiCuZi({ x }: { x: IndicatieMasinaDrax }) {
  if (!x.cazuri.length) return null;
  return (
    <div className="mb-3! space-y-2! text-[12.5px]">
      <b>Ce faci (R1b + R3, {n0(x.kmCazuri)} km/săpt.: indicație {n0(x.km.realist)} · schimb de linii {n0(x.km.schimb)} · mici {n0(x.km.mic)}):</b>
      {x.cazuri.map((c, i) => (
        <div key={i}>
          <p><span className={c.verdict === 'realist' ? VERDE : 'text-neutral-500'}>[{NUME_VERDICT[c.verdict]}]</span> {textCaz(c)}</p>
          <p className="font-mono text-[11.5px] text-neutral-500">
            {c.zile.map((d) => `${ziScurt(d.z)} ${d.ora} (${durata(d.asteptareMin)}) · ${n1(d.km)} km`).join('  ·  ')}
          </p>
        </div>
      ))}
      <Abatere x={x} />
    </div>
  );
}
