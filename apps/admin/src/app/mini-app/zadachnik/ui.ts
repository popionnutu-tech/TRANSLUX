// Общие клиентские хелперы Mini App задачника (палитра TLX-терминала, initData, fetch, статусы).

// Бренд TRANSLUX: бордовый #9B1B30 на светлом.
export const C = {
  bg: '#faf8f7', panel: '#ffffff', panel2: '#f6f1f0', border: '#e7dede',
  accent: '#9B1B30', gold: '#9B1B30', text: '#2a2024', muted: '#8a7f86',
  ok: '#1a8a4a', warn: '#c07a12', bad: '#c0392b',
};

type TG = { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };

export function initData(): string {
  if (typeof window === 'undefined') return '';
  const w = window as unknown as { Telegram?: TG };
  const fromTg = w.Telegram?.WebApp?.initData;
  if (fromTg) return fromTg;
  // Надёжный fallback: Telegram кладёт initData в URL-фрагмент (#tgWebAppData=…),
  // даже если telegram-web-app.js не загрузился (CSP/сеть). Кэшируем на первом заходе,
  // чтобы хватало и при навигации внутри Mini App (там хэш уже потерян).
  try {
    const h = window.location.hash.replace(/^#/, '');
    const d = new URLSearchParams(h).get('tgWebAppData');
    if (d) { try { sessionStorage.setItem('tgInitData', d); } catch { /* ignore */ } return d; }
    const cached = sessionStorage.getItem('tgInitData');
    if (cached) return cached;
  } catch { /* ignore */ }
  return process.env.NODE_ENV !== 'production' ? '__dev__' : '';
}

/** Дождаться загрузки telegram-web-app.js (до ~2с), затем ready()/expand(). */
export function ready(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve();
    const w = window as unknown as { Telegram?: TG };
    let n = 0;
    const t = setInterval(() => {
      if (w.Telegram?.WebApp || n++ > 40) {
        clearInterval(t);
        try { w.Telegram?.WebApp?.ready?.(); w.Telegram?.WebApp?.expand?.(); } catch { /* ignore */ }
        resolve();
      }
    }, 50);
  });
}

export async function api(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch('/api/zadachnik' + path, {
    ...opts,
    headers: { 'x-telegram-init-data': initData(), 'content-type': 'application/json', ...(opts.headers || {}) },
  });
}

export const STATE: Record<string, { label: string; color: string; icon: string }> = {
  created: { label: 'creată', color: C.muted, icon: '•' },
  sent: { label: 'trimisă', color: C.gold, icon: '🆕' },
  delivered: { label: 'livrată', color: C.gold, icon: '🆕' },
  accepted: { label: 'acceptată', color: C.gold, icon: '▶' },
  in_progress: { label: 'în lucru', color: C.gold, icon: '▶' },
  report_pending: { label: 'de verificat', color: C.warn, icon: '⏳' },
  resolved: { label: 'rezolvată', color: C.ok, icon: '✅' },
  rejected: { label: 'respinsă', color: C.bad, icon: '❌' },
  cancelled: { label: 'anulată', color: C.muted, icon: '🚫' },
  overdue: { label: 'întârziată', color: C.bad, icon: '⚠' },
  overdue_responded: { label: 'termen propus', color: C.warn, icon: '💬' },
  ignored: { label: 'ignorată', color: C.bad, icon: '🚫' },
  failed: { label: 'eșuată', color: C.bad, icon: '❌' },
};

export function fmt(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export interface Task {
  id: string; title: string | null; description: string; points: number;
  current_deadline: string; current_state: string; rework_used: boolean;
  assignee_id: string; creator_id: string;
}
