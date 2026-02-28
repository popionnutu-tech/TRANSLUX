'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import type { User, UserRole } from '@translux/db';

export async function getUsers(): Promise<User[]> {
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .order('role')
    .order('username');
  return (data || []) as User[];
}

export async function updateUserRole(id: string, role: UserRole) {
  const { error } = await getSupabase()
    .from('users')
    .update({ role })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function toggleUser(id: string, active: boolean) {
  await getSupabase().from('users').update({ active }).eq('id', id);
  revalidatePath('/users');
}

export async function deleteUser(id: string) {
  const { error } = await getSupabase().from('users').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}
