// Общие клиентские хелперы Mini App задачника (палитра TLX-терминала, initData, fetch, статусы).

export const C = {
  bg: '#1a1816', panel: '#221e1a', panel2: '#1d1a16', border: '#3a352f',
  accent: '#b8860b', gold: '#e9c463', text: '#e8e0d5', muted: '#9a8f82',
  ok: '#6fae6f', warn: '#d9a441', bad: '#cc6666',
};

type TG = { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };

export function initData(): string {
  if (typeof window === 'undefined') return '';
  const w = window as unknown as { Telegram?: TG };
  return w.Telegram?.WebApp?.initData || (process.env.NODE_ENV !== 'production' ? '__dev__' : '');
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
