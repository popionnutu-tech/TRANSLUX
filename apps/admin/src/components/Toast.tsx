'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error';
type ToastItem = { id: number; text: string; kind: ToastKind };

// Pur aditiv — feedback vizual peste UI. Nu schimbă nicio logică de salvare.
const ToastCtx = createContext<{ show: (text: string, kind?: ToastKind) => void }>({ show: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: t.kind === 'error' ? 'var(--danger, #9B1B30)' : '#228B22',
              boxShadow: '0 6px 22px rgba(0,0,0,0.18)',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
