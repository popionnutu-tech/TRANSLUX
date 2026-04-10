import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function deleteAll() {
  const { count } = await db.from('daily_assignments').select('*', { count: 'exact', head: true });
  console.log('Records before:', count);

  const { error } = await db.from('daily_assignments').delete().gte('assignment_date', '2000-01-01');

  if (error) {
    console.error('Error:', error.message);
  } else {
    const { count: after } = await db.from('daily_assignments').select('*', { count: 'exact', head: true });
    console.log('Records after:', after);
    console.log('Done - all assignments deleted');
  }
}

deleteAll();
