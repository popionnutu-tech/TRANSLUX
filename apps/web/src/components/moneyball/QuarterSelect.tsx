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
      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      {quarters.map((q) => (
        <option key={q} value={q}>
          {q}
        </option>
      ))}
    </select>
  );
}
