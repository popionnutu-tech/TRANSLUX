'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  decide, getDetaliuMasina, confirmaLuna, trimiteDinNou, hotarasteBucata,
  type NormeData, type RandNorma, type Detaliu,
} from './actions';
import { DIRECTII_PANOU, type Ales } from '@/lib/lde/norma-luna';
import type { Bucata } from '@/lib/lde/combustibil-poster';

// Un rând pe mașină — km, litri și media lunii socotită de soft; Clava o confirmă sau pune media ei cu motivul
// (Ion, 07.10.2026: «Clava nu alege, le confirmă sau infirmă»). Detaliul se deschide doar din ▸ / plăcuță.

const BORDO = 'var(--primary, #9B1B30)';
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const LUNI_SCURT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
const etLuna = (l: string) => { const [y, m] = l.split('-').map(Number); return `${LUNI[m - 1]} ${y}`; };
const nr = (x: number | null | undefined, z = 0) => (x == null ? '—' : x.toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z }));
const semn = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${nr(x)}`);
const ALES_TEXT: Record<Ales, string> = { confirmat: 'confirmată', media_clava: 'media ta' };
const BUCATA_TEXT: Record<Bucata, string> = { album: 'posterele direcțiilor', general: 'posterul general', introducere: 'mesajul de introducere' };

function luniInchise(luna: string): string[] {
  const out = new Set<string>([luna]);
  const d = new Date(); d.setDate(1);
  for (let i = 0; i < 6; i++) { d.setMonth(d.getMonth() - 1); out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  return [...out].sort().reverse();
}
function trei(luna: string) {   // «iul–sep» = cele 3 luni închise de dinainte
  const [, m] = luna.split('-').map(Number);
  return `${LUNI_SCURT[(m + 8) % 12]}–${LUNI_SCURT[(m + 10) % 12]}`;
}

const chip = (on: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 999, fontSize: 12, minHeight: 28, cursor: 'pointer',
  border: `1px solid ${on ? BORDO : 'rgba(155,27,48,0.15)'}`, background: on ? BORDO : '#fff', color: on ? '#fff' : '#333',
});
const alegere = (on: boolean, stins = false): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: 999, fontSize: 12.5, minHeight: 32, cursor: stins ? 'default' : 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? BORDO : 'rgba(155,27,48,0.25)'}`, background: on ? BORDO : '#fff', color: on ? '#fff' : stins ? '#aaa' : '#333',
  fontWeight: on ? 600 : 400, opacity: stins ? 0.6 : 1,
});
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius, 24px)', padding: '8px 12px', boxShadow: '0 8px 40px rgba(155,27,48,0.08), 0 1px 3px rgba(0,0,0,0.04)' };
const legatura: React.CSSProperties = { padding: 0, border: 0, background: 'transparent', color: BORDO, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' };

// rândul: grilă pe ecran lat, card pe 3 linii sub 700 px
const CSS = `
.nr-rand{display:grid;grid-template-columns:28px 120px 74px 64px 64px 1fr 150px;gap:8px;align-items:center;padding:7px 8px;border-bottom:1px solid rgba(155,27,48,0.05)}
.nr-cap{font-size:10px;font-weight:600;color:rgba(155,27,48,0.45);text-transform:uppercase;letter-spacing:.08em}
.nr-alegeri{display:flex;gap:6px;flex-wrap:wrap}
@media (max-width:700px){
  .nr-rand{grid-template-columns:28px 1fr 1fr 1fr;grid-auto-rows:auto}
  .nr-rand .nr-alegeri{grid-column:1/-1}
  .nr-rand .nr-alegeri button{flex:1 1 30%;min-height:38px}
  .nr-rand .nr-stare{grid-column:1/-1}
  .nr-capete{display:none !important}
}`;

function Rand({ r, luna, poateDecide }: { r: RandNorma; luna: string; poateDecide: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deschis, setDeschis] = useState(false);
  const [alta, setAlta] = useState(false);
  const [normaEi, setNormaEi] = useState(r.decizie?.ales === 'media_clava' ? String(r.decizie.norma).replace('.', ',') : '');
  const [motiv, setMotiv] = useState(r.decizie?.ales === 'media_clava' ? r.decizie.comentariu ?? '' : '');
  const [eroare, setEroare] = useState<string | null>(null);
  const [det, setDet] = useState<Detaliu | null>(null);
  const ales = r.decizie?.ales ?? null;
  const normaAleasa = r.decizie?.norma ?? null;

  const alege = (a: Ales) => {
    if (!poateDecide) return;
    if (a === 'media_clava') { setAlta(!alta); return; }
    setEroare(null);
    start(async () => {
      try { await decide(luna, r.vehicle_id, a); setAlta(false); router.refresh(); } catch (e) { setEroare(e instanceof Error ? e.message : String(e)); }
    });
  };
  const salveazaAlta = () => {
    setEroare(null);
    start(async () => {
      try { await decide(luna, r.vehicle_id, 'media_clava', Number(normaEi.replace(',', '.')), motiv); setAlta(false); router.refresh(); }
      catch (e) { setEroare(e instanceof Error ? e.message : String(e)); }
    });
  };
  const deschide = () => {
    const nou = !deschis; setDeschis(nou);
    if (nou && !det) {
      start(async () => {
        try { setDet(await getDetaliuMasina(luna, r.vehicle_id, r.soferi, r.media, normaAleasa)); } catch (e) { setEroare(e instanceof Error ? e.message : String(e)); }
      });
    }
  };

  return (
    <div style={{ opacity: ales && !deschis ? 0.78 : 1 }}>
      <div className="nr-rand">
        <button type="button" onClick={deschide} aria-label={deschis ? 'Închide detaliul' : 'Deschide detaliul'} style={{ border: 0, background: 'transparent', color: BORDO, cursor: 'pointer', fontSize: 14, padding: 0, width: 28, height: 28 }}>{deschis ? '▾' : '▸'}</button>
        <button type="button" onClick={deschide} style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.m}</div>
          <div style={{ fontSize: 11, color: '#777' }}>{r.tip ?? 'fără tip'}</div>
        </button>
        <div style={{ textAlign: 'right' }}>{nr(r.km)} <span style={{ color: '#888', fontSize: 11 }}>km</span></div>
        <div style={{ textAlign: 'right' }}>{nr(r.litri)} <span style={{ color: '#888', fontSize: 11 }}>l</span></div>
        <div style={{ textAlign: 'right', fontWeight: 600 }} title="Media softului: litri ÷ km × 100 în lună">
          {r.media == null ? <span style={{ color: '#999', fontWeight: 400, fontSize: 11 }}>puține date</span> : nr(r.media, 1)}
        </div>
        <div className="nr-alegeri">
          {r.media != null && (
            <button type="button" disabled={pending} onClick={() => alege('confirmat')} style={alegere(ales === 'confirmat', !poateDecide)}>
              {ales === 'confirmat' ? '✓ Confirmată' : 'Confirm'}</button>
          )}
          <button type="button" disabled={pending} onClick={() => alege('media_clava')} style={alegere(ales === 'media_clava', !poateDecide)}>
            {ales === 'media_clava' ? `✓ Media ta ${nr(r.decizie!.norma, 1)}` : 'Altă medie…'}
          </button>
        </div>
        <div className="nr-stare" style={{ fontSize: 11.5, color: ales ? '#15803d' : '#b45309' }}>
          {ales ? ALES_TEXT[ales] : 'de confirmat'}
          {r.schimbat && <div style={{ color: '#b45309' }} title="Alimentări sau km au venit după confirmare">⚠ media s-a schimbat după ce ai confirmat</div>}
        </div>
      </div>

      {alta && poateDecide && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', padding: '4px 8px 10px 36px' }}>
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>Media ta
            <input value={normaEi} onChange={(e) => setNormaEi(e.target.value)} inputMode="decimal" placeholder="18,5" aria-label="Media ta, litri la 100 km"
              style={{ width: 64, padding: '4px 6px', border: '1px solid rgba(155,27,48,0.25)', borderRadius: 8, fontSize: 13 }} />
            l la 100 km</label>
          <textarea value={motiv} onChange={(e) => setMotiv(e.target.value)} placeholder="De ce e alta decât media softului" aria-label="De ce"
            rows={2} maxLength={1000} style={{ flex: '1 1 260px', padding: '6px 8px', border: '1px solid rgba(155,27,48,0.25)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
          <button type="button" disabled={pending} onClick={salveazaAlta} style={{ ...alegere(true), minHeight: 34 }}>Salvează</button>
        </div>
      )}
      {eroare && <div style={{ color: '#b91c1c', fontSize: 12, padding: '0 8px 8px 36px' }}>{eroare}</div>}

      {deschis && (
        <div style={{ padding: '6px 12px 14px 36px', fontSize: 12.5, color: '#444', display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(155,27,48,0.025)' }}>
          <div><b>Media softului {nr(r.media, 1)}</b> = {nr(r.litri)} l ÷ {nr(r.km)} km × 100{r.uzina === 'Camioane' ? ', pe cursele pornite în lună până la plinul următor (km din GPS)' : ', km din GPS'}; {r.alimentari} alimentări.</div>
          <div style={{ color: '#666' }}>Pentru comparație: norma tipului {r.tip ? `${r.tip} ` : ''}{nr(r.norma_tip, 1)} · media în {trei(luna)} {nr(r.medie3, 1)}{r.luna_trecuta != null ? ` · luna trecută confirmată ${nr(r.luna_trecuta, 1)}` : ''}.</div>
          {r.decizie && (
            <div style={{ color: '#666' }}>
              Ales de {r.decizie.decis_de.split('@')[0]}, {new Date(r.decizie.decis_la).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {r.decizie.comentariu ? ` — «${r.decizie.comentariu}»` : ''}
            </div>
          )}
          {!det && pending && <div style={{ color: '#888' }}>Se încarcă…</div>}
          {det && (
            <>
              <table style={{ borderCollapse: 'collapse', fontSize: 12.5, maxWidth: 560 }}>
                <thead><tr style={{ color: 'rgba(155,27,48,0.5)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ textAlign: 'left', padding: '3px 8px 3px 0' }}>Șoferii lunii</th><th style={{ textAlign: 'left', padding: '3px 8px' }}>Perioada</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px' }}>Km</th><th style={{ textAlign: 'right', padding: '3px 8px' }}>Litri</th>
                  <th style={{ textAlign: 'right', padding: '3px 0 3px 8px' }}>Față de media confirmată</th>
                </tr></thead>
                <tbody>
                  {det.soferi.map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: '2px 8px 2px 0', fontWeight: 600 }}>{s.nume}</td>
                      <td style={{ padding: '2px 8px', color: s.propunere ? '#b45309' : '#444' }} title={s.propunere ? 'Neagreat încă pe pagina de agreare' : undefined}>
                        {String(s.de).padStart(2, '0')}–{String(s.pana).padStart(2, '0')}.{luna.slice(5)}{s.propunere ? ' *' : ''}</td>
                      <td style={{ padding: '2px 8px', textAlign: 'right' }}>{nr(s.km)}</td>
                      <td style={{ padding: '2px 8px', textAlign: 'right' }}>{nr(s.litri)}</td>
                      <td style={{ padding: '2px 0 2px 8px', textAlign: 'right', fontWeight: (s.abatere ?? 0) > 0 ? 600 : 400, color: (s.abatere ?? 0) > 0 ? '#b91c1c' : '#333' }}>
                        {normaAleasa == null ? '—' : `${semn(s.abatere)} l`}</td>
                    </tr>
                  ))}
                  {!det.soferi.length && <tr><td colSpan={5} style={{ color: '#b45309', padding: '2px 0' }}>Niciun șofer — agreează-l pe pagina de agreare.</td></tr>}
                </tbody>
              </table>
              {det.soferi.length >= 2 && normaAleasa != null && det.soferi.some((s) => (s.abatere ?? 0) > 0) && (
                <div style={{ color: '#b45309' }}>De verificat: mai mulți șoferi și consum peste media confirmată — împărțirea după km nu arată cine a consumat.</div>
              )}
              <div title={det.zile.map((z) => `${z.zi}: ${z.km} km`).join(' · ')} style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 26 }}>
                <span style={{ fontSize: 11, color: '#777', marginRight: 6, alignSelf: 'center' }}>Km pe zile</span>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((z) => {
                  const km = det.zile.find((x) => x.zi === z)?.km ?? 0;
                  const max = Math.max(1, ...det.zile.map((x) => x.km));
                  return <span key={z} style={{ display: 'inline-block', width: 6, height: Math.max(2, Math.round((km / max) * 24)), background: km ? BORDO : 'rgba(0,0,0,0.08)', borderRadius: 1 }} />;
                })}
                <span style={{ fontSize: 11, color: '#777', marginLeft: 6, alignSelf: 'center' }}>{nr(det.km_gps)} km GPS{r.km_fara_gps > 0 ? ` · ${r.km_fara_gps} zile fără GPS (km din foi)` : ''}</span>
              </div>
              <div style={{ color: '#555' }}>
                <span style={{ fontSize: 11, color: '#777' }}>Plinuri: </span>
                {det.alimentari.length ? det.alimentari.map((a) => `${a.zi.slice(8)}.${a.zi.slice(5, 7)} ${nr(a.litri)} l`).join(' · ') : 'niciunul'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PanouIon({ data }: { data: NormeData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mesaj, setMesaj] = useState<string | null>(null);
  const c = data.confirmare;
  const decise = data.randuri.filter((r) => r.decizie).length;
  const rulează = (f: () => Promise<{ status: string; motiv?: string } | null>) => {
    setMesaj(null);
    start(async () => {
      try { const r = await f(); if (r) setMesaj(r.status === 'trimis' ? 'Posterul a plecat în grupă.' : r.motiv ?? r.status); router.refresh(); }
      catch (e) { setMesaj(e instanceof Error ? e.message : String(e)); }
    });
  };
  if (!c) {
    return (
      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{etLuna(data.luna)}: <b>{decise}/{data.randuri.length}</b> medii confirmate de Clava · așteaptă confirmarea ta.</span>
        <button type="button" disabled={pending || !data.inchisa}
          onClick={() => { if (confirm(`Confirm mediile pentru ${etLuna(data.luna)} și trimit posterul în grupă?${decise < data.randuri.length ? ` ${data.randuri.length - decise} mașini n-au media confirmată de Clava.` : ''}`)) rulează(() => confirmaLuna(data.luna)); }}
          style={{ ...alegere(true), minHeight: 34 }}>Confirm normele lunii și trimit posterul</button>
        {mesaj && <span style={{ fontSize: 12, color: '#b45309' }}>{mesaj}</span>}
      </div>
    );
  }
  const st = c.poster_rezultat;
  const pieseNesigure = (Object.keys(st) as Bucata[]).filter((b) => st[b] === 'incert' || st[b] === 'in_curs');
  const deReluat = (Object.keys(st) as Bucata[]).some((b) => st[b] === 'netrimis' || st[b] === 'refuzat');
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
      <div>Confirmat de {c.confirmat_de.split('@')[0]}, {new Date(c.confirmat_la).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.{' '}
        {c.poster_trimis_la ? <span style={{ color: '#15803d' }}>Posterul a plecat în grupă.</span> : <span style={{ color: '#b45309' }}>Posterul n-a plecat complet{c.poster_motiv ? `: ${c.poster_motiv}` : '.'}</span>}
      </div>
      {deReluat && !pieseNesigure.length && (
        <div><button type="button" disabled={pending} onClick={() => rulează(() => trimiteDinNou(data.luna))} style={alegere(true)}>Trimite din nou ce n-a plecat</button></div>
      )}
      {pieseNesigure.map((b) => (
        <div key={b} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#b45309' }}>Nu știu sigur dacă au plecat {BUCATA_TEXT[b]} — verifică în grupă:</span>
          <button type="button" disabled={pending} onClick={() => rulează(() => hotarasteBucata(data.luna, b, true))} style={alegere(false)}>A plecat</button>
          <button type="button" disabled={pending} onClick={() => { if (confirm('Retrimit? Dacă a plecat deja, va apărea de două ori în grupă.')) rulează(() => hotarasteBucata(data.luna, b, false)); }} style={alegere(false)}>Retrimite</button>
        </div>
      ))}
      {mesaj && <span style={{ color: '#b45309' }}>{mesaj}</span>}
    </div>
  );
}

export default function NormeClient({ data }: { data: NormeData }) {
  const router = useRouter();
  // Ion, 07.10.2026: «direcțiile să fie separate» — o filă pe direcție, fără listă amestecată; se deschide pe prima
  // direcție care mai are ceva de decis
  const [uz, setUz] = useState(() => DIRECTII_PANOU.find((d) => data.randuri.some((r) => r.uzina === d && !r.decizie)) ?? DIRECTII_PANOU[0]);
  const [filtru, setFiltru] = useState<'toate' | 'de decis' | 'alese'>('toate');
  const confirmata = !!data.confirmare;
  const poateDecide = data.inchisa && (!confirmata || data.esteAdmin);
  const peUzina = data.randuri.filter((r) => r.uzina === uz);
  const deDecis = peUzina.filter((r) => !r.decizie).length;
  const vizibile = peUzina.filter((r) => filtru === 'toate' || (filtru === 'de decis' ? !r.decizie : !!r.decizie));
  const luna = data.luna.slice(5);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400, color: BORDO }}>Normele pentru {etLuna(data.luna)}</h1>
          <div style={{ fontSize: 12, color: '#777' }}>km și litri 01–{data.zileInLuna}.{luna} · <Link href={`/lde/agreare?luna=${data.luna}`} style={{ color: BORDO }}>agrearea șoferilor</Link></div>
        </div>
        <select value={data.luna} onChange={(e) => router.push(`/lde/agreare/norme?luna=${e.target.value}`)} aria-label="Luna"
          style={{ padding: '6px 10px', border: '1px solid rgba(155,27,48,0.15)', borderRadius: 8, background: '#fff', fontSize: 13, minHeight: 34 }}>
          {luniInchise(data.luna).map((l) => <option key={l} value={l}>{etLuna(l)}</option>)}
        </select>
      </div>

      {data.esteAdmin && <PanouIon data={data} />}
      {!data.esteAdmin && confirmata && (
        <div style={{ ...card, color: '#15803d', fontSize: 12.5 }}>Ion a confirmat normele lunii — nu se mai schimbă de aici.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DIRECTII_PANOU.filter((u) => data.randuri.some((r) => r.uzina === u)).map((u) => {   // fila fără mașini nu apare
            const rest = data.randuri.filter((r) => r.uzina === u && !r.decizie).length;
            const toate = data.randuri.filter((r) => r.uzina === u).length;
            return (
              <button key={u} type="button" onClick={() => setUz(u)} style={{ ...chip(uz === u), minHeight: 34, padding: '5px 12px' }}>
                {u} <span style={{ opacity: 0.8, fontSize: 11 }}>{rest ? `${rest} de confirmat` : toate ? '✓' : '—'}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setFiltru(filtru === 'de decis' ? 'toate' : 'de decis')} style={chip(filtru === 'de decis')}>De confirmat {deDecis}</button>
          <button type="button" onClick={() => setFiltru(filtru === 'alese' ? 'toate' : 'alese')} style={chip(filtru === 'alese')}>Confirmate {peUzina.length - deDecis}</button>
        </div>
      </div>

      <div style={card}>
        <div className="nr-rand nr-cap nr-capete" style={{ borderBottom: '1px solid rgba(155,27,48,0.1)' }}>
          <div /><div>Mașina</div><div style={{ textAlign: 'right' }}>Km</div><div style={{ textAlign: 'right' }}>Litri</div>
          <div style={{ textAlign: 'right' }}>Media</div><div>Confirmă sau pune media ta</div><div>Stare</div>
        </div>
        {vizibile.map((r) => <Rand key={r.vehicle_id + data.luna} r={r} luna={data.luna} poateDecide={poateDecide} />)}
        {!vizibile.length && <p style={{ padding: 12, color: '#666' }}>Nicio mașină pe filtrul ales.</p>}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: '#777' }}>
        Media = litri ÷ km × 100 în {etLuna(data.luna)}, socotită de soft (autobuzele după legea ta: litrii lunii ÷ km GPS; camioanele pe
        curse, până la plinul următor). «Confirm» dacă e bună; dacă e alta, «Altă medie…» cu motivul. Șoferul primește media mașinii lui;
        detaliul se deschide din ▸. Posterul în grupă pleacă după confirmarea lui Ion.
      </p>
    </div>
  );
}
