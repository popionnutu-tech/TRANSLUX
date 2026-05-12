import { verifySession } from '@/lib/auth';
import { getClientIp } from '@/lib/ip-access';

export default async function AccessDeniedPage() {
  const session = await verifySession();
  const ip = await getClientIp();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: '#fff',
    }}>
      <div style={{
        maxWidth: 480,
        textAlign: 'center',
        border: '1px solid rgba(155,27,48,0.12)',
        borderRadius: 16,
        padding: 40,
        background: '#fff',
        boxShadow: '0 8px 32px rgba(155,27,48,0.06)',
      }}>
        <div style={{
          width: 56,
          height: 56,
          margin: '0 auto 20px',
          borderRadius: '50%',
          background: 'rgba(185, 28, 28, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
        }}>🔒</div>

        <h1 style={{
          fontSize: 20,
          fontWeight: 700,
          color: '#9B1B30',
          marginBottom: 12,
        }}>
          Acces blocat de la această locație
        </h1>

        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
          Contul tău ({session?.email ?? '—'}) cu rolul <strong>{session?.role ?? '—'}</strong> poate
          accesa sistemul doar de la adresele IP autorizate (oficiu).
        </p>

        {ip && (
          <p style={{ color: '#999', fontSize: 12, marginBottom: 20 }}>
            IP-ul tău curent: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{ip}</code>
          </p>
        )}

        <p style={{ color: '#666', fontSize: 13, lineHeight: 1.6 }}>
          Dacă crezi că e o greșeală, contactează administratorul pentru a-ți adăuga IP-ul curent în lista permisă.
        </p>

        <form action="/api/auth/logout" method="post" style={{ marginTop: 24 }}>
          <button type="submit" style={{
            padding: '10px 20px',
            background: '#9B1B30',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}>
            Deconectare
          </button>
        </form>
      </div>
    </div>
  );
}
