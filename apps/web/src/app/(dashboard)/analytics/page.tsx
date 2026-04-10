export const dynamic = 'force-dynamic';

import {
  getPageViewsPerDay,
  getSearchesPerDay,
  getTopSearchedRoutes,
  getDeviceBreakdown,
  getCountryBreakdown,
  getTotalStats,
} from './actions';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const days = 30;
  const [pageViews, searches, topRoutes, devices, countries, totals] = await Promise.all([
    getPageViewsPerDay(days),
    getSearchesPerDay(days),
    getTopSearchedRoutes(days),
    getDeviceBreakdown(days),
    getCountryBreakdown(days),
    getTotalStats(days),
  ]);

  return (
    <AnalyticsClient
      initialPageViews={pageViews}
      initialSearches={searches}
      initialTopRoutes={topRoutes}
      initialDevices={devices}
      initialCountries={countries}
      initialTotals={totals}
      initialDays={days}
    />
  );
}
