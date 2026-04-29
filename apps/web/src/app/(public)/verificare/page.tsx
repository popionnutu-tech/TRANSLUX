export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isVerificareAuthenticated } from '@/lib/verificare-auth';
import { getInterurbanRoutes } from './actions';
import { logoutVerificare } from './login/actions';

export default async function VerificarePage() {
  if (!(await isVerificareAuthenticated())) redirect('/verificare/login');
  const routes = await getInterurbanRoutes();

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#9B1B30', margin: 0 }}>
          Verificare orar rute
        </h1>
        <form action={logoutVerificare}>
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ieșire
          </button>
        </form>
      </div>
      <p style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.5 }}>
        Alegeți o rută și verificați ora la fiecare oprire. Confirmați dacă e
        corectă sau introduceți ora nouă. Modificările sunt aplicate doar după
        aprobarea adminului.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {routes.map((r) => (
          <li key={r.id}>
            <Link
              href={`/verificare/${r.id}`}
              style={{
                display: 'block',
                padding: '14px 16px',
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                textDecoration: 'none',
                color: '#222',
                border: '1px solid #eee',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{r.dest_to_ro}</span>
                {r.pending_count > 0 ? (
                  <span style={{ fontSize: 11, color: '#9B1B30', fontWeight: 600 }}>
                    {r.pending_count} în așteptare
                  </span>
                ) : r.last_status === 'approved' ? (
                  <span style={{ fontSize: 11, color: '#1f7a3a', fontWeight: 600 }}>
                    aprobat
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                {r.time_nord && <>Nord → Chișinău {r.time_nord}</>}
                {r.time_nord && r.time_chisinau && <>{'  ·  '}</>}
                {r.time_chisinau && <>Chișinău → Nord {r.time_chisinau}</>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {routes.length === 0 && (
        <p style={{ color: '#888', fontSize: 14 }}>Nu există rute interurbane active.</p>
      )}
    </main>
  );
}
