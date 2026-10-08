'use client';

import { useEffect, useState } from 'react';
import { TESTE_PROBA, type Telefon, type Verdict } from '@/lib/bilete/proba-teste';
import { trimiteRezultatProba } from './actions';

// Cele 20 de teste ale lui Iura (Ion, 08.10.2026), cu ✅/❌ și nota; bifele stau pe telefon (localStorage), iar
// «Trimite lui Ion» le trimite în Telegram-ul lui Ion prin acțiunea paginii. Stiluri inline (resetul CSS al panoului).

const RED = '#9B1B30';
const CHEIE_LOCALA = 'proba-teste-v1';
const TEL: Record<Telefon, { t: string; bg: string; fg: string }> = {
  c: { t: 'CLIENT', bg: '#e5eef9', fg: '#1d5fa8' },
  s: { t: 'ȘOFER', bg: '#f8eedb', fg: '#8a5a00' },
  cs: { t: 'CLIENT + ȘOFER', bg: '#f6e6e9', fg: RED },
};
type Stare = Record<string, { v?: Verdict | null; nota?: string }>;

export default function TesteProba({ cheie }: { cheie: string }) {
  const [stare, setStare] = useState<Stare>({});
  const [trimit, setTrimit] = useState(false);
  const [mesaj, setMesaj] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try { setStare(JSON.parse(localStorage.getItem(CHEIE_LOCALA) || '{}') || {}); } catch { /* fără memorie locală */ }
  }, []);
  function schimba(n: number, patch: { v?: Verdict | null; nota?: string }) {
    setStare((s) => {
      const nou = { ...s, [n]: { ...(s[n] || {}), ...patch } };
      try { localStorage.setItem(CHEIE_LOCALA, JSON.stringify(nou)); } catch { /* ignor */ }
      return nou;
    });
  }

  const ok = TESTE_PROBA.filter((t) => stare[t.n]?.v === 'ok').length;
  const bad = TESTE_PROBA.filter((t) => stare[t.n]?.v === 'bad').length;

  async function trimite() {
    setTrimit(true); setMesaj(null);
    const r = await trimiteRezultatProba(cheie, stare, 'Iura');
    setTrimit(false);
    setMesaj(r.ok ? { ok: true, text: 'Trimis. Ion a primit rezultatul în Telegram.' } : { ok: false, text: r.eroare });
  }

  let grupa = '';
  return (
    <section style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>4. Cele 20 de teste</div>
      <p style={{ fontSize: 13, color: '#555', margin: '6px 0 0' }}>
        Ai două telefoane: CLIENT (cumperi) și ȘOFER (Telegramul tău cu sarcinile, scanezi). Bifează ✅ sau ❌ la fiecare test;
        la ❌ scrie ce s-a întâmplat. La final apasă «Trimite lui Ion».
      </p>
      <div style={{ fontSize: 13, color: '#555', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>Făcute {ok + bad} din {TESTE_PROBA.length} · ✅ {ok} · ❌ {bad}</div>
      {TESTE_PROBA.map((t) => {
        const s = stare[t.n] || {};
        const cap = t.grupa !== grupa ? (grupa = t.grupa) : null;
        const tel = TEL[t.who];
        return (
          <div key={t.n}>
            {cap && <div style={{ marginTop: 16, fontSize: 12, fontWeight: 800, letterSpacing: 1, color: '#888', textTransform: 'uppercase' }}>{cap}</div>}
            <div style={{ marginTop: 8, padding: 12, borderRadius: 12, border: `2px solid ${s.v === 'ok' ? '#1b7f3b' : s.v === 'bad' ? '#b42318' : '#eee'}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <b style={{ color: RED, fontSize: 17, minWidth: 24 }}>{t.n}</b>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: tel.bg, color: tel.fg }}>{tel.t}</span>
              </div>
              <div style={{ marginTop: 6 }}>{t.face}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}><b style={{ color: '#1b7f3b' }}>✅ dacă:</b> {t.asteptat}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {(['ok', 'bad'] as const).map((v) => {
                  const ales = s.v === v;
                  return (
                    <button key={v} type="button" aria-pressed={ales} onClick={() => schimba(t.n, { v: ales ? null : v })}
                      style={{ flex: 1, padding: 10, fontSize: 15, fontWeight: 700, borderRadius: 10, border: `1px solid ${ales ? (v === 'ok' ? '#1b7f3b' : '#b42318') : '#ddd'}`, background: ales ? (v === 'ok' ? '#e3f3e8' : '#fdecea') : '#fafafa', color: ales ? (v === 'ok' ? '#1b7f3b' : '#b42318') : '#333' }}>
                      {v === 'ok' ? '✅ Merge' : '❌ Nu merge'}
                    </button>
                  );
                })}
              </div>
              {s.v === 'bad' && (
                <textarea value={s.nota || ''} onChange={(e) => schimba(t.n, { nota: e.target.value })} placeholder="Ce s-a întâmplat"
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 8, fontSize: 14, borderRadius: 10, border: '1px solid #ccc', minHeight: 60 }} />
              )}
            </div>
          </div>
        );
      })}
      <button type="button" disabled={trimit || ok + bad === 0} onClick={() => void trimite()}
        style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, border: 0, borderRadius: 12, marginTop: 16, color: '#fff', background: trimit || ok + bad === 0 ? '#bbb' : RED }}>
        {trimit ? 'Se trimite…' : 'Trimite lui Ion'}
      </button>
      {mesaj && <div style={{ marginTop: 10, fontSize: 14, color: mesaj.ok ? '#1b7f3b' : '#b42318' }}>{mesaj.text}</div>}
      <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Poți trimite de mai multe ori, de exemplu după fiecare comandă; Ion primește de fiecare dată situația întreagă. Capturile de ecran trimite-i-le separat în Telegram.</p>
    </section>
  );
}
