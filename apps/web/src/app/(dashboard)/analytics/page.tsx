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
  getDriverPerformance,
  getRouteEtalons,
  getEmptyTripsAnalysis,
  getDemandSupplyGap,
  getRevenueOverview,
  getRoutesList,
} from './sales-actions';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const days = 30;
  const now = new Date();
  const dateFrom = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const dateTo = now.toISOString().slice(0, 10);

  const [
    pageViews, searches, detailedRoutes, devices, countries, totals,
    driverPerf, etalons, emptyTrips, demandGap, revenue, routes,
  ] = await Promise.all([
    getPageViewsPerDay(days),
    getSearchesPerDay(days),
    getTopSearchedRoutesDetailed(days),
    getDeviceBreakdown(days),
    getCountryBreakdown(days),
    getTotalStats(days),
    getDriverPerformance(dateFrom, dateTo),
    getRouteEtalons(),
    getEmptyTripsAnalysis(dateFrom, dateTo),
    getDemandSupplyGap(days),
    getRevenueOverview(dateFrom, dateTo),
    getRoutesList(),
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
      initialDriverPerf={driverPerf}
      initialEtalons={etalons}
      initialEmptyTrips={emptyTrips}
      initialDemandGap={demandGap}
      initialRevenue={revenue}
      initialRoutes={routes}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
    />
  );
}
