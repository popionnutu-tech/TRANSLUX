/**
 * Scheletul paginii de direcție (ION-203), arătat cât se randează pe server o pereche care nu
 * e încă prerandată (apărută în orar după build) — nu scheletul formularului de pe pagina
 * principală din app/loading.tsx, care acoperea și grupul (rute).
 *
 * Nu atinge 404-ul: perechea necunoscută e oprită de middleware (rewrite /_not-found cu 404)
 * înainte să ajungă la pagină, iar toate perechile care trec de parsePair au curse sau sunt
 * anunțate (verificat 03.10 pe sitemap: 188 din 188). notFound() din pagină rămâne cazul rar
 * «pereche validă rămasă fără curse» — și acolo scheletul venea deja din app/loading.tsx.
 */
const bar = (width: string | number, height: number, margin: string | number = '0 0 10px') => (
  <div style={{ width, height, margin, background: 'rgba(155,27,48,0.06)', borderRadius: 6 }} />
);

export default function Loading() {
  return (
    <div className="legal-page" aria-busy="true">
      <header className="site-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 40px' }}>
        <div style={{ width: 206, height: 30, background: 'rgba(155,27,48,0.08)', borderRadius: 8 }} />
        <div style={{ width: 28, height: 18, background: 'rgba(155,27,48,0.06)', borderRadius: 6 }} />
      </header>
      <main className="legal-main route-main">
        {bar(180, 12, '8px 0 14px')}
        {bar('70%', 28, '0 0 14px')}
        {bar('100%', 14, '0 0 6px')}
        {bar('85%', 14, '0 0 22px')}
        {bar(260, 44, '0 0 28px')}
        {bar(140, 17, '0 0 12px')}
        <table className="route-table" aria-hidden="true">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td>{bar(44, 12, 0)}</td>
                <td>{bar(44, 12, 0)}</td>
                <td>{bar(60, 12, 0)}</td>
                <td>{bar('80%', 12, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
