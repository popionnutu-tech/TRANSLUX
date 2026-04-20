'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminRole } from '@translux/db';

type NavItem = { href: string; label: string; adminOnly: boolean; icon: string };

const nomenclatorItems: NavItem[] = [
  { href: '/users',        label: 'Utilizatori',   adminOnly: true,  icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { href: '/routes',       label: 'Rute',          adminOnly: true,  icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' },
  { href: '/drivers',      label: 'Soferi',        adminOnly: true,  icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/vehicles',     label: 'Mașini',        adminOnly: true,  icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/trips',        label: 'Curse',         adminOnly: true,  icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
  { href: '/mapping',      label: 'Mapping rute',  adminOnly: true,  icon: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z' },
  { href: '/smm-accounts', label: 'Conturi SMM',   adminOnly: true,  icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
];

const nav: NavItem[] = [
  { href: '/reports',      label: 'Rapoarte',     adminOnly: true,  icon: 'M3 3v18h18V3H3zm16 16H5V5h14v14zM7 12h2v5H7v-5zm4-3h2v8h-2V9zm4-2h2v10h-2V7z' },
  // { href: '/fb-bot',       label: 'Bot Facebook',  adminOnly: true,  icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z' }, // hidden — feature paused, code preserved
  { href: '/salary',       label: 'Salariu',       adminOnly: true,  icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { href: '/offers',       label: 'Oferte',        adminOnly: true,  icon: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z' },
  { href: '/grafic',       label: 'Grafic',        adminOnly: true,  icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7v-7zm4-3h2v10h-2V7zm4 6h2v4h-2v-4z' },  // admin-only grafic view
  { href: '/numarare',    label: 'Numărare',      adminOnly: false, icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z' },
  { href: '/analytics',   label: 'Analitică',     adminOnly: true,  icon: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z' },
];

const sidebarStyle: React.CSSProperties = {
  width: 240,
  minHeight: '100vh',
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  color: '#333',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(155,27,48,0.06)',
  flexShrink: 0,
  position: 'relative',
  zIndex: 10,
  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
};

const brandStyle: React.CSSProperties = {
  padding: '24px 20px 20px',
  textAlign: 'center',
  borderBottom: '1px solid rgba(155,27,48,0.06)',
};

const logoStyle: React.CSSProperties = {
  display: 'inline-block',
  height: 26,
  width: '100%',
  maxWidth: 180,
  backgroundColor: '#9B1B30',
  WebkitMaskImage: 'url(/translux-logo-red.png)',
  WebkitMaskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskImage: 'url(/translux-logo-red.png)',
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.15em',
  color: 'rgba(155,27,48,0.35)',
  textTransform: 'uppercase',
  fontWeight: 500,
  marginTop: 4,
};

const navStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const linkBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  borderRadius: 10,
  color: '#999',
  fontSize: 13,
  fontWeight: 500,
  fontStyle: 'italic',
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  position: 'relative',
};

const linkActive: React.CSSProperties = {
  ...linkBase,
  color: '#9B1B30',
  background: 'rgba(155,27,48,0.06)',
  fontWeight: 600,
};

const activeBar: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 6,
  bottom: 6,
  width: 3,
  borderRadius: '0 3px 3px 0',
  background: '#9B1B30',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 10px',
  borderTop: '1px solid rgba(155,27,48,0.06)',
};

const logoutStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'transparent',
  border: '1px solid rgba(155,27,48,0.1)',
  color: 'rgba(155,27,48,0.4)',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
  fontStyle: 'italic',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(item.href + '/');
  return (
    <Link href={item.href} style={active ? linkActive : linkBase}>
      {active && <span style={activeBar} />}
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: active ? 0.8 : 0.4 }}>
        <path d={item.icon} />
      </svg>
      {item.label}
    </Link>
  );
}

const nomenclatorHrefs = nomenclatorItems.map(i => i.href);

export default function Sidebar({ role = 'ADMIN' }: { role?: AdminRole }) {
  const pathname = usePathname();
  const router = useRouter();

  const nomenclatorActive = nomenclatorHrefs.some(h => pathname === h || pathname.startsWith(h + '/'));
  const [nomenclatorOpen, setNomenclatorOpen] = useState(nomenclatorActive);

  const filteredNav = role === 'ADMIN' ? nav
    : role === 'GRAFIC' || role === 'DISPATCHER' ? nav.filter(n => n.href === '/grafic' && n.label === 'Grafic')
    : role === 'OPERATOR_CAMERE' || role === 'ADMIN_CAMERE' ? nav.filter(n => n.href === '/numarare')
    : nav;

  const showNomenclator = role === 'ADMIN' || role === 'DISPATCHER';
  const filteredNomenclator = role === 'ADMIN'
    ? nomenclatorItems
    : nomenclatorItems.filter(i => i.href === '/drivers' || i.href === '/vehicles');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside style={sidebarStyle}>
      <div style={brandStyle}>
        <span style={logoStyle} />
        <div style={subtitleStyle}>Panou Administrativ</div>
      </div>

      <nav style={navStyle}>
        {filteredNav.map((item) => (
          <NavLink key={item.href + item.label} item={item} pathname={pathname} />
        ))}

        {showNomenclator && (
          <>
            <button
              onClick={() => setNomenclatorOpen(o => !o)}
              style={{
                ...linkBase,
                background: nomenclatorActive ? 'rgba(155,27,48,0.06)' : 'transparent',
                color: nomenclatorActive ? '#9B1B30' : '#999',
                fontWeight: nomenclatorActive ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              }}
            >
              {nomenclatorActive && <span style={activeBar} />}
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: nomenclatorActive ? 0.8 : 0.4 }}>
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
              <span style={{ flex: 1, textAlign: 'left' }}>Nomenclator</span>
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{
                  width: 18,
                  height: 18,
                  opacity: 0.4,
                  transition: 'transform 0.2s ease',
                  transform: nomenclatorOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>

            <div style={{
              overflow: 'hidden',
              maxHeight: nomenclatorOpen ? 300 : 0,
              transition: 'max-height 0.25s ease',
              paddingLeft: 12,
            }}>
              {filteredNomenclator.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </>
        )}
      </nav>

      <div style={footerStyle}>
        <button onClick={handleLogout} style={logoutStyle}>
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: 0.4 }}>
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
          Deconectare
        </button>
      </div>
    </aside>
  );
}
