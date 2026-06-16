import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

/** Pur prezentațional — afișat în timpul aceleiași încărcări (nu schimbă date/logică). */
export function Skeleton({
  width = '100%',
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return <div className={styles.bar} style={{ width, height, ...style }} aria-hidden="true" />;
}

/** Placeholder de tabel: un titlu + rânduri de bare. */
export function TableSkeleton({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-busy="true" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton width={200} height={22} style={{ marginBottom: 8 }} />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 12 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={18} style={{ flex: c === 0 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
