import { TableSkeleton } from '@/components/Skeleton';

// Afișat la navigarea între pagini (segment loading) — schelet în loc de ecran gol.
export default function DashboardLoading() {
  return (
    <div style={{ padding: 24 }}>
      <TableSkeleton rows={10} cols={4} />
    </div>
  );
}
