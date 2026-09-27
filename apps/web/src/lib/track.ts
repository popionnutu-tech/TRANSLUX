// Evenimentele analiticii site-ului (panoul /analytics → Site). Fire-and-forget: o eroare aici
// nu are voie să oprească apelul sau fereastra «Acum».
// mod (ION-102): prin ce buton a venit omul — «Acum» (fereastra cu harta) sau «Mai târziu» (căutarea pe dată).
export type TrackMod = 'acum' | 'mai_tarziu';

export function track(body: Record<string, unknown>): void {
  try {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
