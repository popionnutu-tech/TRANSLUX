'use client';

// Ion, 10.10.2026 («la achitare am apăsat înapoi și îmi dă eroare»): «Reîncercați» reîncarcă pagina întreagă — după o
// întoarcere de la bancă sau o versiune nouă a site-ului, `reset()` doar redesena aceeași eroare. RO + RU.
export default function GlobalError(_: { error: Error; reset: () => void }) {
  return (
    <html lang="ro">
      <body style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>A apărut o eroare</h2>
          <p style={{ margin: '0 0 1rem', color: '#666' }}>Произошла ошибка</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Reîncarcă pagina · Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
