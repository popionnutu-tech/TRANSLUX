import Link from 'next/link';

export default function MultumimPage() {
  return (
    <main style={{ maxWidth: 540, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1f7a3a', margin: '0 0 8px' }}>
        Mulțumim!
      </h1>
      <p style={{ fontSize: 14, color: '#444', margin: '0 0 24px', lineHeight: 1.5 }}>
        Verificarea a fost trimisă spre aprobare. După aprobarea adminului,
        eventualele modificări vor apărea în orarul real.
      </p>
      <Link
        href="/verificare"
        style={{
          display: 'inline-block',
          padding: '10px 18px',
          borderRadius: 8,
          background: '#9B1B30',
          color: '#fff',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Înapoi la lista rutelor
      </Link>
    </main>
  );
}
