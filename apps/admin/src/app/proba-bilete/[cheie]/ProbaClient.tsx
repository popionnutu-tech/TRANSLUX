'use client';

import { useCallback, useEffect, useState } from 'react';
import { cautaCurseProba, cumparaProba, stareProbe, type CursaProba, type RandProba } from './actions';
import TesteProba from './TesteProba';

// Pagina de probă (migr. 532): aceiași pași ca pe site — de unde/încotro și ziua → cursa → nume, prenume, telefon, e-mail →
// plata de 10 lei la maib → întoarcerea pe pagina reală a biletului. Dedesubt, bifele fiecărei comenzi de probă de azi.
// Stiluri inline: resetul CSS al panoului bate clasele Tailwind.

const RED = '#9B1B30';
const card = { background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 } as const;
const input = { width: '100%', padding: '12px 12px', fontSize: 16, border: '1px solid #ccc', borderRadius: 10, boxSizing: 'border-box' as const, marginTop: 4 };
const label = { display: 'block', fontSize: 13, color: '#555', marginTop: 10 } as const;
const buton = (activ: boolean) => ({ width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, border: 0, borderRadius: 12, marginTop: 14, color: '#fff', background: activ ? RED : '#bbb' });

const PASI: Array<[keyof RandProba['pasi'], string]> = [
  ['creata', 'creată'], ['platita', 'plătită'], ['email', 'e-mail livrat'], ['telegram', 'legat în Telegram'], ['scanat', 'scanat'], ['returnat', 'returnat'],
];

function zile(): { azi: string; maine: string; poimaine: string } {
  const azi = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const [y, m, d] = azi.split('-').map(Number);
  return { azi, maine: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), poimaine: new Date(Date.UTC(y, m - 1, d + 2)).toISOString().slice(0, 10) };
}

export default function ProbaClient({ cheie }: { cheie: string }) {
  const { azi, maine, poimaine } = zile();
  const [de, setDe] = useState('Briceni');
  const [spre, setSpre] = useState('Chișinău');
  const [zi, setZi] = useState(azi);
  const [curse, setCurse] = useState<CursaProba[] | null>(null);
  const [aleasa, setAleasa] = useState<CursaProba | null>(null);
  const [nume, setNume] = useState('');
  const [prenume, setPrenume] = useState('');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [lucru, setLucru] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const [randuri, setRanduri] = useState<RandProba[]>([]);

  const reincarca = useCallback(async () => {
    const r = await stareProbe(cheie);
    if (r.ok) setRanduri(r.randuri);
  }, [cheie]);
  useEffect(() => { void reincarca(); const t = setInterval(() => void reincarca(), 10_000); return () => clearInterval(t); }, [reincarca]);

  async function cauta() {
    setLucru(true); setEroare(null); setAleasa(null);
    const r = await cautaCurseProba(cheie, de, spre, zi);
    setLucru(false);
    if (!r.ok) { setEroare(r.eroare); setCurse(null); return; }
    setCurse(r.curse);
  }

  async function plateste() {
    if (!aleasa) return;
    setLucru(true); setEroare(null);
    const r = await cumparaProba(cheie, { tripDate: zi, routeId: aleasa.routeId, goingNorth: aleasa.goingNorth, fromRo: de, toRo: spre, nume, prenume, telefon, email });
    if (!r.ok) { setLucru(false); setEroare(r.eroare); return; }
    window.location.href = r.url;
  }

  const gata = Boolean(aleasa && nume.trim() && prenume.trim() && telefon.trim());
  return (
    <main style={{ minHeight: '100vh', background: '#f1efef', padding: '16px', fontFamily: 'var(--font-opensans), system-ui, sans-serif', color: '#1a1a1a' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ background: '#b91c1c', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>
          PROBA BILETELOR ONLINE · 10 lei · bani reali
        </div>

        <section style={card}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>1. Cursa</div>
          <label style={label}>De unde<input style={input} value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label style={label}>Încotro<input style={input} value={spre} onChange={(e) => setSpre(e.target.value)} /></label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {[[azi, 'Azi'], [maine, 'Mâine'], [poimaine, 'Poimâine']].map(([v, t]) => (
              <button key={v} type="button" onClick={() => setZi(v)} style={{ flex: 1, padding: 12, fontSize: 15, borderRadius: 10, border: `2px solid ${zi === v ? RED : '#ddd'}`, background: zi === v ? '#fbecee' : '#fff', fontWeight: 700 }}>
                {t} · {v.slice(8, 10)}.{v.slice(5, 7)}
              </button>
            ))}
          </div>
          <button type="button" disabled={lucru} onClick={() => void cauta()} style={buton(!lucru)}>Caută cursele</button>
          {curse && curse.length === 0 && <p style={{ color: '#666', marginTop: 10 }}>Nicio cursă între aceste localități în ziua aleasă.</p>}
          {curse && curse.map((c) => {
            const sel = aleasa?.routeId === c.routeId && aleasa?.goingNorth === c.goingNorth;
            return (
              <button key={`${c.routeId}-${c.goingNorth}`} type="button" onClick={() => setAleasa(c)}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: 12, borderRadius: 10, border: `2px solid ${sel ? RED : '#e3e3e3'}`, background: sel ? '#fbecee' : '#fff' }}>
                <b style={{ fontSize: 17 }}>{c.plecare}{c.sosire ? ` → ${c.sosire}` : ''}</b>
                <span style={{ display: 'block', fontSize: 13, color: '#666' }}>{c.ruta} · prețul real {c.pretReal} lei, la probă 10 lei</span>
              </button>
            );
          })}
        </section>

        {aleasa && (
          <section style={card}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>2. Pasagerul</div>
            <label style={label}>Nume<input style={input} value={nume} onChange={(e) => setNume(e.target.value)} autoComplete="family-name" /></label>
            <label style={label}>Prenume<input style={input} value={prenume} onChange={(e) => setPrenume(e.target.value)} autoComplete="given-name" /></label>
            <label style={label}>Telefon<input style={input} value={telefon} onChange={(e) => setTelefon(e.target.value)} inputMode="tel" placeholder="069 123 456" /></label>
            <label style={label}>E-mail (opțional)<input style={input} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" /></label>
            <button type="button" disabled={!gata || lucru} onClick={() => void plateste()} style={buton(gata && !lucru)}>
              {lucru ? 'Se deschide maib…' : 'Plătește 10 lei'}
            </button>
          </section>
        )}

        {eroare && <div style={{ ...card, background: '#fdecec', color: '#9b1b1b' }}>{eroare}</div>}

        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>3. Probele de azi</div>
            <button type="button" onClick={() => void reincarca()} style={{ border: 0, background: 'none', color: RED, fontWeight: 700 }}>Reîncarcă</button>
          </div>
          {randuri.length === 0 && <p style={{ color: '#666' }}>Nicio comandă de probă azi.</p>}
          {randuri.map((r) => (
            <div key={r.numar} style={{ borderTop: '1px solid #eee', paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>№ {r.numar} · {r.ora}</div>
              <div style={{ fontSize: 13, color: '#555' }}>{r.cursa} · {r.nume} · {r.telefon}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {PASI.map(([k, t]) => {
                  const v = r.pasi[k];
                  return (
                    <span key={k} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: v === true ? '#e3f3e8' : v === null ? '#f1f1f1' : '#fdecec', color: v === true ? '#1b7f3b' : v === null ? '#888' : '#9b1b1b' }}>
                      {v === true ? '✓' : v === null ? '–' : '✗'} {t}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <TesteProba cheie={cheie} />
      </div>
    </main>
  );
}
