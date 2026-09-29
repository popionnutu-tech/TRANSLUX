export const dynamic = 'force-dynamic';

import { getSiteAnalytics } from './actions';
import { getOverviewData } from './sales-actions';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const days = 30;
  const now = new Date();
  const dateFrom = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const dateTo = now.toISOString().slice(0, 10);

  const [site, overview] = await Promise.all([
    getSiteAnalytics(days),
    getOverviewData(dateFrom, dateTo, 'interurban'),
  ]);

  return (
    <AnalyticsClient
      initialPageViews={site.pageViews}
      initialSearches={site.searches}
      initialDetailedRoutes={site.detailedRoutes}
      initialDevices={site.devices}
      initialCountries={site.countries}
      initialTotals={site.totals}
      initialAnomalies={site.anomalies}
      initialDays={days}
      initialOverviewKPI={overview.kpi}
      initialRouteScorecard={overview.routes}
      initialDriverScorecard={overview.drivers}
      initialRouteLoad={overview.routeLoad}
    />
  );
}
