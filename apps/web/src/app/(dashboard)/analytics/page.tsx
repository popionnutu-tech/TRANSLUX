export const dynamic = 'force-dynamic';

import {
  getPageViewsPerDay,
  getSearchesPerDay,
  getTopSearchedRoutesDetailed,
  getDeviceBreakdown,
  getCountryBreakdown,
  getTotalStats,
} from './actions';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const days = 30;
  const [pageViews, searches, detailedRoutes, devices, countries, totals] = await Promise.all([
    getPageViewsPerDay(days),
    getSearchesPerDay(days),
    getTopSearchedRoutesDetailed(days),
    getDeviceBreakdown(days),
    getCountryBreakdown(days),
    getTotalStats(days),
  ]);

  return (
    <AnalyticsClient
      initialPageViews={pageViews}
      initialSearches={searches}
      initialDetailedRoutes={detailedRoutes}
      initialDevices={devices}
      initialCountries={countries}
      initialTotals={totals}
      initialDays={days}
    />
  );
}
