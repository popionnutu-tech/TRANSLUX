'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export function QuarterSelect({
  quarters,
  current,
}: {
  quarters: string[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('q', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={onChange}
      style={{
        padding: '6px 12px',
        background: '#fff',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-xs)',
        fontSize: 13,
        color: 'var(--text)',
        cursor: 'pointer',
      }}
    >
      {quarters.map((q) => (
        <option key={q} value={q}>
          {q}
        </option>
      ))}
    </select>
  );
}
