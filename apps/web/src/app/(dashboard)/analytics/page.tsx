export const dynamic = 'force-dynamic';

import {
  getPageViewsPerDay,
  getSearchesPerDay,
  getTopSearchedRoutesDetailed,
  getDeviceBreakdown,
  getCountryBreakdown,
  getTotalStats,
} from './actions';
import {
  getOverviewKPI,
  getRouteScorecard,
  getDriverScorecard,
} from './sales-actions';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const days = 30;
  const now = new Date();
  const dateFrom = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const dateTo = now.toISOString().slice(0, 10);

  const [
    pageViews, searches, detailedRoutes, devices, countries, totals,
    overviewKPI, routeScorecard, driverScorecard,
  ] = await Promise.all([
    getPageViewsPerDay(days),
    getSearchesPerDay(days),
    getTopSearchedRoutesDetailed(days),
    getDeviceBreakdown(days),
    getCountryBreakdown(days),
    getTotalStats(days),
    getOverviewKPI(dateFrom, dateTo),
    getRouteScorecard(dateFrom, dateTo),
    getDriverScorecard(dateFrom, dateTo),
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
      initialOverviewKPI={overviewKPI}
      initialRouteScorecard={routeScorecard}
      initialDriverScorecard={driverScorecard}
    />
  );
}
