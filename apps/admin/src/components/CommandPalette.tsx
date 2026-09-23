'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRole } from '@translux/db';
import { destinatii, type Destinatie } from '@/components/Sidebar';

// Ion, 23.09.2026: «super user experience, la lucru să fie fast». Panoul are 72 de pagini și 65
// de intrări în meniu — găsirea uneia cere derulat și citit. Aici se scrie și se apasă Enter.
//
// ⌘K (Ctrl+K pe Windows) deschide, literele filtrează, săgețile aleg, Enter merge. Ultimele
// patru destinații deschise stau primele, fiindcă munca de zi cu zi se învârte în jurul
// acelorași câteva pagini.

const CHEIE = 'palette-recente';
const MAX_RECENTE = 4;

// Potrivire pe subșir, nu pe prefix: «zilnic» găsește «Tablou zilnic» și «Atribuiri zilnice».
// Diacriticele se ignoră — nimeni nu scrie «Mașini» cu ș când se grăbește.
const plat = (s: string) => s.toLowerCase()
  .replace(/[ăâ]/g, 'a').replace(/[îi]/g, 'i').replace(/[șş]/g, 's').replace(/[țţ]/g, 't');

function scor(d: Destinatie, q: string): number {
  const l = plat(d.label), g = plat(d.grup), h = plat(d.href);
  if (!q) return 0;
  if (l === q) return 100;
  if (l.startsWith(q)) return 80;
  if (l.includes(q)) return 60;
  if (g.includes(q)) return 30;
  if (h.includes(q)) return 20;
  // literele în ordine, oriunde: «atrz» găsește «Atribuiri zilnice»
  let i = 0;
  for (const c of l) if (c === q[i]) i++;
  return i === q.length ? 10 : -1;
}

export default function CommandPalette({ role }: { role: AdminRole }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [recente, setRecente] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const toate = useMemo(() => destinatii(role), [role]);

  useEffect(() => {
    try { setRecente(JSON.parse(localStorage.getItem(CHEIE) || '[]')); } catch { /* prima dată */ }
  }, []);

  const rezultate = useMemo(() => {
    const t = plat(q.trim());
    if (!t) {
      const r = recente.map(h => toate.find(d => d.href === h)).filter((d): d is Destinatie => !!d);
      const rest = toate.filter(d => !recente.includes(d.href));
      return [...r, ...rest].slice(0, 40);
    }
    return toate.map(d => ({ d, s: scor(d, t) })).filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.d);
  }, [q, toate, recente]);

  const mergi = useCallback((d: Destinatie) => {
    const noi = [d.href, ...recente.filter(h => h !== d.href)].slice(0, MAX_RECENTE);
    setRecente(noi);
    try { localStorage.setItem(CHEIE, JSON.stringify(noi)); } catch { /* modul privat */ }
    setDeschis(false); setQ('');
    router.push(d.href);
  }, [recente, router]);

  useEffect(() => {
    const la = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setDeschis(v => !v); setQ(''); setSel(0); return;
      }
      if (!deschis) return;
      if (e.key === 'Escape') { e.preventDefault(); setDeschis(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, rezultate.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && rezultate[sel]) { e.preventDefault(); mergi(rezultate[sel]); }
    };
    window.addEventListener('keydown', la);
    return () => window.removeEventListener('keydown', la);
  }, [deschis, rezultate, sel, mergi]);

  useEffect(() => { if (deschis) inputRef.current?.focus(); }, [deschis]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!deschis) {
    return (
      <button
        onClick={() => setDeschis(true)}
        title="Caută orice pagină — ⌘K"
        aria-label="Caută o pagină"
        style={{
          position: 'fixed', right: 18, bottom: 18, zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff', color: 'var(--text-secondary)',
          border: '1px solid var(--border-accent)', borderRadius: 999,
          padding: '9px 14px', fontSize: 13, cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(155,27,48,0.10)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        Caută
        <kbd style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 11, opacity: 0.75,
          border: '1px solid var(--border-accent)', borderRadius: 4, padding: '1px 5px',
        }}>⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Caută o pagină"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setDeschis(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(30,10,14,0.28)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px 16px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560, background: '#fff', borderRadius: 14,
        border: '1px solid var(--border-accent)', boxShadow: '0 18px 50px rgba(30,10,14,0.22)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-muted)" aria-hidden>
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Scrie numele paginii…"
            aria-label="Caută o pagină"
            style={{ flex: 1, border: 0, outline: 'none', fontSize: 16, background: 'transparent', color: 'var(--text)' }}
          />
          <kbd style={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-secondary)',
            border: '1px solid var(--border-accent)', borderRadius: 4, padding: '1px 5px',
          }}>esc</kbd>
        </div>

        <div ref={listaRef} role="listbox" style={{ overflowY: 'auto', padding: 6 }}>
          {rezultate.length === 0 && (
            <p style={{ padding: '18px 12px', color: 'var(--text-secondary)', fontSize: 14 }}>
              Nicio pagină nu se potrivește cu „{q}”.
            </p>
          )}
          {rezultate.map((d, i) => {
            const activ = i === sel;
            const proaspat = !q && recente.includes(d.href);
            return (
              <button
                key={d.href}
                role="option"
                aria-selected={activ}
                onMouseEnter={() => setSel(i)}
                onClick={() => mergi(d)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  background: activ ? 'var(--primary-dim)' : 'transparent', border: 0,
                  borderRadius: 8, padding: '8px 10px', cursor: 'pointer', font: 'inherit', color: 'inherit',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden
                  fill={activ ? 'var(--primary)' : 'var(--text-muted)'} style={{ flexShrink: 0 }}>
                  <path d={d.icon} />
                </svg>
                <span style={{ flex: 1, fontSize: 14, fontWeight: activ ? 600 : 400 }}>{d.label}</span>
                {proaspat && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>recent</span>}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.grup}</span>
              </button>
            );
          })}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)', padding: '7px 14px',
          fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', gap: 14,
        }}>
          <span>↑↓ alege</span><span>⏎ deschide</span><span>esc închide</span>
        </div>
      </div>
    </div>
  );
}
