'use client';

import { useEffect } from 'react';
import PrintPortal from '@/components/PrintPortal';

export type Cec = {
  doc_id: number; serie: string; numar: string; data: string; client: string; depozit: string;
  total: number;
  linii: { nume: string; articol: string; um: string; cant: number; pret: number; suma: number }[];
};

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cecul de dat clientului în mână. Cerut de Eduard (05.10): «распечатывать чек с наименованием товара и
// ценой».
//
// Lățimea e 58 mm fiindcă aceeași imprimantă termică tipărește și etichetele (HPRT LPQ58). Înălțimea e
// `auto`: un cec cu o poziție n-are de ce să scoată cât unul cu cincisprezece.
export default function CecModal({ cec, onClose }: { cec: Cec; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <PrintPortal>
      <div className="label-overlay"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', zIndex: 1100, overflowY: 'auto' }}>
        <style>{`
          @media print {
            /* Înălțime AUTO, nu fixă: hârtia termică e continuă, se taie unde se termină cecul. */
            @page { size: 58mm auto; margin: 0; }
            .label-overlay { position: static !important; padding: 0 !important; background: none !important;
                             display: block !important; overflow: visible !important; }
            .label-overlay > .card { margin: 0 !important; padding: 0 !important; border: none !important;
                                     box-shadow: none !important; max-width: none !important; }
            .piese-cec { border: none !important; margin: 0 !important; }
          }
        `}</style>

        <div className="card" style={{ margin: 0, maxWidth: 420, width: '100%' }}>
          <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Cec <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· 58 mm</span></h2>
            <button className="btn btn-outline" style={{ padding: '2px 10px' }} onClick={onClose}>Închide</button>
          </div>

          <div className="piese-cec" style={{ width: '58mm', padding: '2mm', boxSizing: 'border-box', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: '7.5pt', lineHeight: 1.25, border: '1px solid #cbd5e1', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '9pt' }}>TRANSLUX</div>
            <div style={{ textAlign: 'center', fontSize: '6.5pt' }}>{cec.depozit}</div>
            <div style={{ borderTop: '1px dashed #000', margin: '1.5mm 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{cec.serie} {cec.numar}</span><span>{cec.data}</span>
            </div>
            {cec.client && <div>Client: {cec.client}</div>}
            <div style={{ borderTop: '1px dashed #000', margin: '1.5mm 0' }} />

            {cec.linii.map((l, i) => (
              <div key={i} style={{ marginBottom: '1.2mm' }}>
                {/* Denumirea pe rândul ei, întreagă: pe 58 mm nu încape alături de cifre, iar trunchierea
                    ar lăsa clientul cu „Переключатель пово…" pe bon. */}
                <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{l.nume}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333' }}>{l.cant} {l.um} × {lei(l.pret)}</span>
                  <strong>{lei(l.suma)}</strong>
                </div>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #000', margin: '1.5mm 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', fontWeight: 800 }}>
              <span>TOTAL</span><span>{lei(cec.total)} lei</span>
            </div>
            <div style={{ textAlign: 'center', fontSize: '6.5pt', marginTop: '2mm' }}>Mulțumim!</div>
          </div>

          <button className="btn btn-primary btn-block no-print" style={{ marginTop: 12 }}
            onClick={() => window.print()}>🖨 Tipărește cecul</button>
        </div>
      </div>
    </PrintPortal>
  );
}
