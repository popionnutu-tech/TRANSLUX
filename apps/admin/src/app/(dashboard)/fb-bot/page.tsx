export const dynamic = 'force-dynamic';

import { getFbConfigs, getRecentFbEvents } from './actions';
import FbBotClient from './FbBotClient';

export default async function FbBotPage() {
  const [configs, events] = await Promise.all([getFbConfigs(), getRecentFbEvents(50)]);
  return <FbBotClient initialConfigs={configs} initialEvents={events} />;
}
