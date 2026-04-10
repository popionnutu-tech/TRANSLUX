'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const body = JSON.stringify({ path: pathname });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/track', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/analytics/track', { method: 'POST', body, keepalive: true });
      }
    } catch {}
  }, [pathname]);

  return null;
}
