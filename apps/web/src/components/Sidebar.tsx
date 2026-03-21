'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const nav = [
  { href: '/reports',      label: 'Rapoarte',     icon: 'M3 3v18h18V3H3zm16 16H5V5h14v14zM7 12h2v5H7v-5zm4-3h2v8h-2V9zm4-2h2v10h-2V7z' },
  { href: '/smm-accounts', label: 'Conturi SMM',   icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
  { href: '/users',        label: 'Utilizatori',   icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { href: '/routes',       label: 'Rute',          icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' },
  { href: '/drivers',      label: 'Soferi',        icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/trips',        label: 'Curse',         icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
  { href: '/salary',       label: 'Salariu',       icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
];

/* Scattered "T" pattern SVG — brand decorative element */
const scatterPattern = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='120' viewBox='0 0 80 120'%3E%3Ctext x='10' y='40' font-family='Arial Black,Impact,sans-serif' font-weight='900' font-style='italic' font-size='48' fill='%23D42027' opacity='0.06' transform='rotate(-15 30 40)'%3ET%3C/text%3E%3Ctext x='40' y='100' font-family='Arial Black,Impact,sans-serif' font-weight='900' font-style='italic' font-size='32' fill='%23D42027' opacity='0.04' transform='rotate(10 50 100)'%3ET%3C/text%3E%3C/svg%3E")`;

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <style>{`
        .sidebar {
          width: 240px;
          min-height: 100vh;
          background: #fff;
          color: #222;
          display: flex;
          flex-direction: column;
          border-right: 2px solid #eee;
          flex-shrink: 0;
          position: relative;
          z-index: 10;
        }
        .sidebar-decor {
          position: absolute;
          top: 0; left: 0; bottom: 0; right: 0;
          background-image: ${scatterPattern};
          background-repeat: repeat;
          pointer-events: none;
          z-index: 0;
        }
        .sidebar-brand {
          padding: 24px 20px 20px;
          text-align: center;
          position: relative;
          z-index: 1;
          border-bottom: 2px solid #eee;
        }
        .sidebar-logo {
          height: 26px;
          margin-bottom: 4px;
        }
        .sidebar-subtitle {
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #999;
          text-transform: uppercase;
          font-weight: 500;
        }
        .sidebar-nav {
          flex: 1;
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: relative;
          z-index: 1;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 8px;
          color: #666;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
          position: relative;
        }
        .sidebar-link:hover {
          color: #222;
          background: #f5f5f5;
        }
        .sidebar-link-active {
          color: #D42027 !important;
          background: rgba(212, 32, 39, 0.06) !important;
          font-weight: 600;
        }
        .sidebar-link-active::before {
          content: '';
          position: absolute;
          left: 0; top: 6px; bottom: 6px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: #D42027;
        }
        .sidebar-link svg {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          opacity: 0.5;
          transition: opacity 0.2s;
        }
        .sidebar-link:hover svg,
        .sidebar-link-active svg {
          opacity: 1;
        }
        .sidebar-footer {
          padding: 16px 10px;
          position: relative;
          z-index: 1;
          border-top: 1px solid #eee;
        }
        .sidebar-logout {
          width: 100%;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.12);
          color: #999;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sidebar-logout:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }
      `}</style>

      <div className="sidebar-decor" />

      <div className="sidebar-brand">
        <img src="/logo.svg" alt="TRANSLUX" className="sidebar-logo" />
        <div className="sidebar-subtitle">Panou Administrativ</div>
      </div>

      <nav className="sidebar-nav">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${active ? ' sidebar-link-active' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-logout">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ width: 20, height: 20, flexShrink: 0, opacity: 0.5 }}>
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
          Deconectare
        </button>
      </div>
    </aside>
  );
}
