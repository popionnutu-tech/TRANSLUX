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
    <aside className="sidebar">
      <style>{`
        .sidebar {
          width: 240px;
          min-height: 100vh;
          background: rgba(17, 17, 17, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          color: #e2e8f0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
          position: relative;
          z-index: 10;
        }
        .sidebar::after {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 1px;
          background: linear-gradient(180deg, rgba(212, 32, 39, 0.4) 0%, rgba(212, 32, 39, 0.1) 50%, transparent 100%);
        }
        .sidebar-brand {
          padding: 28px 24px 24px;
          text-align: center;
          position: relative;
        }
        .sidebar-brand::after {
          content: '';
          position: absolute;
          bottom: 0; left: 24px; right: 24px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(212, 32, 39, 0.3), transparent);
        }
        .sidebar-logo {
          height: 28px;
          margin-bottom: 6px;
          filter: brightness(1.1);
        }
        .sidebar-subtitle {
          font-size: 10px;
          letter-spacing: 0.2em;
          color: #666;
          text-transform: uppercase;
          font-weight: 500;
        }
        .sidebar-nav {
          flex: 1;
          padding: 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          color: #888;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .sidebar-link:hover {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.04);
        }
        .sidebar-link-active {
          color: #fff !important;
          background: rgba(212, 32, 39, 0.12) !important;
        }
        .sidebar-link-active::before {
          content: '';
          position: absolute;
          left: 0; top: 6px; bottom: 6px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: #D42027;
          box-shadow: 0 0 10px rgba(212, 32, 39, 0.5);
        }
        .sidebar-link svg {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .sidebar-link:hover svg,
        .sidebar-link-active svg {
          opacity: 1;
        }
        .sidebar-footer {
          padding: 16px 12px;
          position: relative;
        }
        .sidebar-footer::before {
          content: '';
          position: absolute;
          top: 0; left: 24px; right: 24px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.06), transparent);
        }
        .sidebar-logout {
          width: 100%;
          padding: 10px 14px;
          background: rgba(212, 32, 39, 0.06);
          border: 1px solid rgba(212, 32, 39, 0.12);
          color: #888;
          border-radius: 10px;
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
          background: rgba(212, 32, 39, 0.15);
          border-color: rgba(212, 32, 39, 0.3);
          color: #f87171;
        }
      `}</style>

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
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ width: 20, height: 20, flexShrink: 0, opacity: 0.6 }}>
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
          Deconectare
        </button>
      </div>
    </aside>
  );
}
