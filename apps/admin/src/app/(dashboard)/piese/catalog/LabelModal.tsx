'use client';

import { code128BarsSvg, cleanCode128 } from '@/lib/code128';

export interface LabelData {
  id: number; name: string; manufacturer: string; articleCode: string;
  barcode: string; unit: string; qty: number; price: number | null;
}

// Eticheta de tipărit a unei piese (mărime reală ~58×40 mm, pt. imprimantă de etichete).
// Conține: denumire, marcă, cod intern, stoc, preț + cod de bare Code128 SCANABIL + numărul dedesubt (backup manual).
// La tipărire (Ctrl+P / butonul „Tipărește"), CSS-ul de print izolează DOAR eticheta la dimensiunea etichetei.
export default function LabelModal({ data, onClose }: { data: LabelData; onClose: () => void }) {
  const codeText = cleanCode128(data.barcode);
  const bars = code128BarsSvg(codeText, 60);
  const priceStr = data.price != null ? `${data.price.toLocaleString('ro-RO')} lei` : '— lei';
  const sub = [data.manufacturer, data.articleCode && `Art: ${data.articleCode}`].filter(Boolean).join(' · ');

  return (
    <div className="label-overlay" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', zIndex: 1100, overflowY: 'auto' }}>
      {/* CSS de tipărire: ascunde tot în afară de etichetă și fixează formatul paginii la mărimea etichetei. */}
      <style>{`
        @media print {
          @page { size: 58mm 40mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .piese-label, .piese-label * { visibility: visible !important; }
          .piese-label { position: fixed !important; left: 0; top: 0; margin: 0 !important; border: none !important; box-shadow: none !important; }
        }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Etichetă piesă <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· mărime reală</span></h2>
          <button className="btn btn-outline" style={{ padding: '2px 10px' }} onClick={onClose}>Închide</button>
        </div>

        <div className="piese-label" style={{ width: '58mm', height: '40mm', padding: '2mm', boxSizing: 'border-box', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', gap: '0.8mm', border: '1px solid #cbd5e1' }}>
          <div style={{ fontWeight: 700, fontSize: '8.5pt', lineHeight: 1.08, maxHeight: '8.5mm', overflow: 'hidden' }}>{data.name || '—'}</div>
          <div style={{ fontSize: '6.5pt', color: '#333', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub || ' '}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.4mm' }}>
            <span style={{ fontSize: '7pt' }}>Stoc: <b>{data.qty}</b> {data.unit}</span>
            <span style={{ fontSize: '12.5pt', fontWeight: 800 }}>{priceStr}</span>
          </div>
          {bars ? (
            <>
              <div style={{ height: '9mm', width: '100%', marginTop: 'auto' }} dangerouslySetInnerHTML={{ __html: bars }} />
              <div style={{ fontFamily: 'monospace', fontSize: '7pt', textAlign: 'center', letterSpacing: '0.5px', lineHeight: 1 }}>{codeText}</div>
            </>
          ) : (
            <div style={{ fontSize: '7pt', color: '#888', marginTop: 'auto', textAlign: 'center', paddingBottom: '2mm' }}>fără cod de bare</div>
          )}
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => window.print()}>🖨 Tipărește eticheta</button>
      </div>
    </div>
  );
}
