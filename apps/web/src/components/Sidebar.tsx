'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const nav = [
  { href: '/reports',      label: 'Rapoarte' },
  { href: '/smm-accounts', label: 'Conturi SMM' },
  { href: '/users',        label: 'Utilizatori' },
  { href: '/routes',       label: 'Rute' },
  { href: '/drivers',      label: 'Șoferi' },
  { href: '/trips',        label: 'Curse' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 224,
        minHeight: '100vh',
        background: '#0a0818',
        color: '#f0e8d8',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #1e1c3a',
        flexShrink: 0,
        backgroundImage: 'radial-gradient(ellipse 120% 50% at 50% 0%, rgba(60,30,90,0.4) 0%, transparent 70%)',
      }}
    >
      {/* ── Brand ──────────────────────────────── */}
      <div
        style={{
          padding: '28px 20px 22px',
          borderBottom: '1px solid #1e1c3a',
          textAlign: 'center',
        }}
      >
        <img src="/logo.svg" alt="TRANSLUX" style={{ height: 32, marginBottom: 10 }} />
        {/* amber ornamental divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a2a5a)' }} />
          <span style={{ color: '#e8a030', fontSize: 8 }}>✦</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #3a2a5a, transparent)' }} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-cinzel, serif)',
            fontSize: 9,
            letterSpacing: '0.22em',
            color: '#4a3d6a',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          Panou Administrativ
        </div>
      </div>

      {/* ── Navigation ─────────────────────────── */}
      <nav style={{ flex: 1, paddingTop: 10 }}>
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'block',
                padding: '11px 20px',
                color: active ? '#e8a030' : '#8a7eaa',
                background: active ? 'rgba(232, 160, 48, 0.08)' : 'transparent',
                fontFamily: 'var(--font-cinzel, serif)',
                fontWeight: active ? 700 : 400,
                fontSize: 13,
                letterSpacing: '0.06em',
                textDecoration: 'none',
                borderLeft: active ? '2px solid #e8a030' : '2px solid transparent',
                transition: 'all 0.18s',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────── */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #1e1c3a',
        }}
      >
        {/* ornamental divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #2a2050)' }} />
          <span style={{ color: '#3a2a5a', fontSize: 8 }}>◆</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #2a2050, transparent)' }} />
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #2a2050',
            color: '#4a3d6a',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-cinzel, serif)',
            letterSpacing: '0.08em',
            transition: 'all 0.18s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#c04020';
            (e.currentTarget as HTMLButtonElement).style.color = '#c04020';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2050';
            (e.currentTarget as HTMLButtonElement).style.color = '#4a3d6a';
          }}
        >
          Deconectare
        </button>
      </div>
    </aside>
  );
}
