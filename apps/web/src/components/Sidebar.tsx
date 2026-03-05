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
        background: '#080705',
        color: '#e8dfc8',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #1e1c18',
        flexShrink: 0,
      }}
    >
      {/* ── Brand ──────────────────────────────── */}
      <div
        style={{
          padding: '28px 20px 20px',
          borderBottom: '1px solid #1e1c18',
        }}
      >
        {/* Gold rule above title */}
        <div
          style={{
            height: 2,
            background: 'linear-gradient(90deg, #b22222, #d4a017 60%, transparent)',
            marginBottom: 14,
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-oswald, Impact, sans-serif)',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#d4a017',
            lineHeight: 1,
          }}
        >
          TRANSLUX
        </div>
        <div
          style={{
            fontFamily: 'var(--font-oswald, Impact, sans-serif)',
            fontSize: 9,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#4a3d2a',
            marginTop: 6,
          }}
        >
          ▸ PANOU ADMINISTRATIV
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
                color: active ? '#d4a017' : '#7a6a58',
                background: active ? 'rgba(212, 160, 23, 0.07)' : 'transparent',
                fontFamily: 'var(--font-oswald, Impact, sans-serif)',
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                borderLeft: active ? '2px solid #d4a017' : '2px solid transparent',
                transition: 'all 0.15s',
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
          borderTop: '1px solid #1e1c18',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-courier, monospace)',
            fontSize: 10,
            color: '#3d3010',
            letterSpacing: '0.1em',
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #2a2018',
            color: '#4a3d2a',
            borderRadius: 1,
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-oswald, Impact, sans-serif)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#b22222';
            (e.currentTarget as HTMLButtonElement).style.color = '#b22222';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2018';
            (e.currentTarget as HTMLButtonElement).style.color = '#4a3d2a';
          }}
        >
          ✕ Deconectare
        </button>
      </div>
    </aside>
  );
}
