'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ro">
      <body style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>A apărut o eroare</h2>
          <button
            onClick={() => reset()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Reîncercați
          </button>
        </div>
      </body>
    </html>
  );
}
