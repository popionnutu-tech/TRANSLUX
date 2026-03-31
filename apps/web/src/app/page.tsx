import { HomePage } from '@/components/home-page';
import { getLocalities } from './(public)/actions';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const localities = await getLocalities();
  return <HomePage locale="ro" localities={localities} />;
}
