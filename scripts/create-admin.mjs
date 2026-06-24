// Создание нового admin-аккаунта. Запускать ВАМ, из корня репозитория:
//   node scripts/create-admin.mjs <email> <пароль> [роль]
// Роль по умолчанию ADMIN. Пароль вы задаёте сами — он сразу хешируется (bcrypt), в открытом виде нигде не хранится.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const [, , email, password, role = 'ADMIN'] = process.argv;

if (!email || !password) {
  console.error('Использование: node scripts/create-admin.mjs <email> <пароль> [роль=ADMIN]');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Некорректный email:', email);
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data: existing } = await db.from('admin_accounts').select('id').eq('email', email).maybeSingle();
if (existing) {
  console.error(`Аккаунт ${email} уже существует (id ${existing.id}). Скрипт ничего не менял.`);
  process.exit(1);
}

const password_hash = await bcrypt.hash(password, 12);
const { data, error } = await db
  .from('admin_accounts')
  .insert({ email, password_hash, role, active: true })
  .select('id, email, role')
  .single();

if (error) {
  console.error('Ошибка:', error.message);
  process.exit(1);
}
console.log(`✅ Создан аккаунт: ${data.email} (роль ${data.role}, id ${data.id}). Войти можно на central-hub-md.vercel.app с этим email и вашим паролем.`);
