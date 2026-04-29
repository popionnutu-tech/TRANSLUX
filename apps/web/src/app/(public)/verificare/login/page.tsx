import { redirect } from 'next/navigation';
import { isVerificareAuthenticated } from '@/lib/verificare-auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function VerificareLoginPage() {
  if (await isVerificareAuthenticated()) redirect('/verificare');
  return (
    <main style={{ maxWidth: 380, margin: '0 auto', padding: '60px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#9B1B30', margin: '0 0 6px' }}>
        Verificare orar
      </h1>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 24px' }}>
        Introduceți datele primite pentru a continua.
      </p>
      <LoginForm />
    </main>
  );
}
