import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data, error } = await db.from('admin_accounts').select('*');
console.log('Admin accounts:', data?.length ?? 0);
if (error) console.log('Error:', error.message);

if (data && data.length > 0) {
  for (const acc of data) {
    console.log(`  - ${acc.email} (id: ${acc.id}, role: ${acc.role ?? 'N/A'})`);
    const match = await bcrypt.compare(process.env.ADMIN_PASSWORD || 'admin123', acc.password_hash);
    console.log(`    Password match with env ADMIN_PASSWORD: ${match}`);
  }
} else {
  console.log('No admin accounts found! Running seed...');
}
