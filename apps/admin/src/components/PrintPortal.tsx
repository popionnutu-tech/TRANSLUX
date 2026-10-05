'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Containerul ferestrelor care se TIPĂRESC (etichete de raft, foaia de etichete a unei recepții).
//
// DE CE EXISTĂ. Ambele ecrane ascundeau restul paginii cu `body * { visibility: hidden }`. Dar
// `visibility: hidden` ascunde CONȚINUTUL, nu și LOCUL: ecranul Prihod continua să ocupe înălțimea lui în
// pagina de tipar. La hârtie de 58×40 mm, asta însemna ~16 pagini goale înaintea primei etichete.
//
// Măsurat, nu presupus: foaia de recepție cu 2 etichete ieșea pe 18 pagini; eticheta singură din Catalog
// pe 16, din care doar prima avea ceva. Exact ce a raportat Eduard: «пустые етикетки».
//
// Reparația are două părți, amândouă necesare:
//   1. fereastra se mută ca UN COPIL DIRECT al `body` (portal) — altfel n-o putem deosebi, în CSS, de
//      restul aplicației în care e cuibărită;
//   2. restul se ascunde cu `display: none`, care chiar scoate conținutul din pagină.
export default function PrintPortal({ children }: { children: ReactNode }) {
  // `document` nu există la randarea pe server; portalul se creează abia după montare.
  const [gata, setGata] = useState(false);
  useEffect(() => { setGata(true); }, []);
  if (!gata) return null;
  return createPortal(
    <div className="piese-print-root">
      <style>{`
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          /* Tot ce nu e fereastra de tipărit iese din pagină cu totul. */
          body > *:not(.piese-print-root) { display: none !important; }
          .piese-print-root { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      {children}
    </div>,
    document.body,
  );
}
