// Общие клиентские хелперы Mini App задачника (палитра TLX-терминала, initData, fetch, статусы).

// Бренд TRANSLUX: бордовый #9B1B30 на светлом.
export const C = {
  bg: '#faf8f7', panel: '#ffffff', panel2: '#f6f1f0', border: '#e7dede',
  accent: '#9B1B30', gold: '#9B1B30', text: '#2a2024', muted: '#8a7f86',
  ok: '#1a8a4a', warn: '#c07a12', bad: '#c0392b',
};

type TG = { WebApp?: {
  initData?: string; ready?: () => void; expand?: () => void;
  showConfirm?: (message: string, callback: (ok: boolean) => void) => void;
} };

/** Confirmare care FUNCȚIONEAZĂ în Telegram Mini App (window.confirm e blocat acolo →
 *  false tăcut). Semantică: Telegram.WebApp.showConfirm când există; în Telegram, dacă
 *  dialogul lipsește sau aruncă sincron (client vechi, popup deja deschis — WebAppPopupOpened),
 *  acțiunea SE EXECUTĂ fără dialog (butonul apăsat = intenția). FĂRĂ timeout: showConfirm e
 *  non-blocant, un timer ar răspunde «da» în locul omului care încă citește întrebarea.
 *  window.confirm rămâne doar în browser obișnuit (dev). */
export function confirmDialog(message: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const w = window as unknown as { Telegram?: TG };
  const msg = message.slice(0, 256); // plasă de siguranță: Telegram respinge sincron mesaje >256
  const show = w.Telegram?.WebApp?.showConfirm;
  const inTelegram = (() => { const d = initData(); return d !== '' && d !== '__dev__'; })();
  if (show) {
    return new Promise((resolve) => {
      try { show.call(w.Telegram!.WebApp, msg, (ok: boolean) => resolve(ok)); }
      catch { resolve(inTelegram ? true : window.confirm(msg)); }
    });
  }
  return Promise.resolve(inTelegram ? true : window.confirm(msg));
}

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
  // Fără pasul de acceptare (Ion, 17.08.2026): «trimisă» nu mai însemna nimic pentru executant —
  // sarcina primită e pur și simplu de făcut. 'accepted'/'in_progress' rămân doar pt. sarcini vechi.
  sent: { label: 'de făcut', color: C.gold, icon: '🆕' },
  delivered: { label: 'de făcut', color: C.gold, icon: '🆕' },
  accepted: { label: 'de făcut', color: C.gold, icon: '🆕' },
  // 'in_progress' nu mai înseamnă «a început lucrul» (pasul a dispărut), ci «întors la refacere» —
  // singurul care îl mai scrie e reworkTask.
  in_progress: { label: 'de refăcut', color: C.warn, icon: '🔁' },
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
  estimated_date?: string | null;
  source?: string | null;
  assignee_label?: string;
  category?: string;
  goal?: string | null;
}

// Categoriile de sarcini (migr. 249) — același limbaj vizual peste tot.
export const CAT: Record<string, { label: string; emoji: string; color: string }> = {
  MARKETING_AUTO: { label: 'Marketing auto', emoji: '🚌', color: '#4f9cf0' },
  VIDEO: { label: 'Video TikTok/FB', emoji: '🎬', color: '#b07cf0' },
  DEZVOLTARE: { label: 'Dezvoltare marketing', emoji: '📈', color: '#4fd08c' },
  ALTELE: { label: 'Altele', emoji: '📌', color: '#8a93a5' },
};
// Ordinea cerută de Ion (07.08, v2): reclama (zgomotul cel mai mare) ultima de tot.
export const CAT_ORDER = ['VIDEO', 'DEZVOLTARE', 'ALTELE', 'MARKETING_AUTO'] as const;
export const catOf = (c?: string) => CAT[c ?? 'ALTELE'] ?? CAT.ALTELE;
/** Cheia normalizată: orice categorie necunoscută cade în ALTELE (nu dispare din secțiuni). */
export const catKeyOf = (c?: string) => (c && CAT[c] ? c : 'ALTELE');

export interface TargetProgress { template_id: string; assignee_id?: string; label: string; done: number; target: number; goal?: string | null }

/** 'YYYY-MM-DDTHH:MM' (introdus ca oră a Chișinăului) → instant ISO, indiferent de fusul telefonului.
 *  Decalajul se ia la DATA țintă (corect peste trecerea la ora de vară/iarnă).
 *  Întoarce null pentru input gol/invalid — apelantul afișează eroarea, nu aruncă. */
export function chisinauLocalToISO(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const probe = new Date(`${local}:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Chisinau', timeZoneName: 'shortOffset' })
    .formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+3';
  const h = parseInt(tzName.replace('GMT', ''), 10) || 3;
  const sign = h < 0 ? '-' : '+';
  const d = new Date(`${local}:00${sign}${String(Math.abs(h)).padStart(2, '0')}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Câte zile pe săptămână rulează un șablon (plafonul și valoarea implicită a țintei).
 *  Copia client a maxPerWeekOf din lib/zadachnik/core.ts — ține-le identice. */
export function maxPerWeekOf(period: 'daily' | 'mon_fri' | 'custom', weekDays?: number[] | null): number {
  return period === 'daily' ? 7 : period === 'mon_fri' ? 5 : (weekDays?.length ?? 0);
}
